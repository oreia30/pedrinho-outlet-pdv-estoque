const express = require('express');
const { pool } = require('../lib/db');
const { SCHEMA } = require('../lib/migrate');
const { computeAndApplyItems } = require('../lib/sales');

const router = express.Router();

const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Outro'];

router.get('/pdv', async (req, res) => {
  const { rows: products } = await pool.query(
    `SELECT id, name, category, price, quantity, image_url
     FROM ${SCHEMA}.products
     WHERE active = true AND quantity > 0
     ORDER BY name ASC`
  );
  res.render('pdv', { products, paymentMethods: PAYMENT_METHODS });
});

// Registra uma venda feita no balcão da loja física. Mesma lógica de estoque
// e caixa da venda online (routes/store.js), só que com desconto e forma de
// pagamento escolhidos aqui, e feita por quem está logado no painel.
router.post('/pdv/api/venda', async (req, res) => {
  const { items, discountType, discountValue, paymentMethod, customerName, note } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Adicione ao menos um produto à venda.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { orderItems, discountAmount, total } = await computeAndApplyItems(client, items, {
      type: discountType,
      value: discountValue,
    });

    const nome = (customerName || '').trim() || 'Cliente balcão';
    const descricaoPartes = [`Venda balcão - ${nome}`];
    if (note && note.trim()) descricaoPartes.push(note.trim());

    const { rows: orderRows } = await client.query(
      `INSERT INTO ${SCHEMA}.orders
         (customer_name, items, total, payment_method, status, discount, channel, seller_name)
       VALUES ($1,$2,$3,$4,'pago',$5,'balcao',$6)
       RETURNING id`,
      [nome, JSON.stringify(orderItems), total, paymentMethod || null, discountAmount, req.user && req.user.name]
    );

    await client.query(
      `INSERT INTO ${SCHEMA}.cash_transactions (type, category, amount, description, ref_type, ref_id)
       VALUES ('entrada', 'venda balcão', $1, $2, 'order', $3)`,
      [total, descricaoPartes.join(' — '), orderRows[0].id]
    );

    await client.query('COMMIT');
    res.json({ ok: true, orderId: orderRows[0].id, total, discountAmount });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message || 'Não foi possível registrar a venda.' });
  } finally {
    client.release();
  }
});

module.exports = router;
