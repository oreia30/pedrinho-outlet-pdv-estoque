const express = require('express');
const { pool } = require('../lib/db');
const { SCHEMA } = require('../lib/migrate');
const { reverseOrderStockAndCash, computeAndApplyItems } = require('../lib/sales');

const router = express.Router();

router.get('/pedidos', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM ${SCHEMA}.orders ORDER BY created_at DESC LIMIT 200`
  );
  res.render('orders/list', { orders: rows, erro: req.query.erro || null });
});

// Muda o status do pedido. Cancelar devolve o estoque e apaga o lançamento de
// caixa daquela venda; reativar um pedido cancelado debita o estoque de novo
// e recria o lançamento (pelo valor original, sem recalcular preço).
router.post('/pedidos/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['pago', 'pendente', 'cancelado'].includes(status)) {
    return res.redirect('/pedidos');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM ${SCHEMA}.orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const order = rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.redirect('/pedidos');
    }

    if (order.status !== status) {
      if (status === 'cancelado') {
        await reverseOrderStockAndCash(client, order);
      } else if (order.status === 'cancelado') {
        const items = Array.isArray(order.items) ? order.items : [];
        for (const item of items) {
          const { rows: prodRows } = await client.query(
            `SELECT name, quantity FROM ${SCHEMA}.products WHERE id = $1 FOR UPDATE`,
            [item.product_id]
          );
          const product = prodRows[0];
          if (!product) {
            throw new Error(`Produto "${item.name}" não existe mais no catálogo — não é possível reativar este pedido.`);
          }
          if (Number(product.quantity) < item.quantity) {
            throw new Error(`Estoque insuficiente para reativar: "${item.name}" (disponível: ${product.quantity}, precisa de ${item.quantity}).`);
          }
          await client.query(`UPDATE ${SCHEMA}.products SET quantity = quantity - $1 WHERE id = $2`, [
            item.quantity,
            item.product_id,
          ]);
        }
        const categoria = order.channel === 'balcao' ? 'venda balcão' : 'venda loja';
        await client.query(
          `INSERT INTO ${SCHEMA}.cash_transactions (type, category, amount, description, ref_type, ref_id)
           VALUES ('entrada', $1, $2, $3, 'order', $4)`,
          [categoria, order.total, `Pedido de ${order.customer_name} (reativado)`, order.id]
        );
      }
      await client.query(`UPDATE ${SCHEMA}.orders SET status = $1, updated_at = now() WHERE id = $2`, [
        status,
        req.params.id,
      ]);
    }

    await client.query('COMMIT');
    res.redirect('/pedidos');
  } catch (err) {
    await client.query('ROLLBACK');
    res.redirect('/pedidos?erro=' + encodeURIComponent(err.message));
  } finally {
    client.release();
  }
});

// Edição de itens/desconto/pagamento só é permitida pra vendas feitas no
// balcão (channel = 'balcao') — pedidos vindos da loja online seguem o fluxo
// de status (pago/pendente/cancelado) normalmente, sem editar os itens aqui.
router.get('/pedidos/:id/editar', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM ${SCHEMA}.orders WHERE id = $1`, [req.params.id]);
  const order = rows[0];
  if (!order || order.channel !== 'balcao') {
    return res.redirect('/pedidos?erro=' + encodeURIComponent('Só é possível editar vendas feitas no balcão.'));
  }
  if (order.status === 'cancelado') {
    return res.redirect(
      '/pedidos?erro=' + encodeURIComponent('Reative o pedido (mude o status) antes de editar os itens.')
    );
  }

  const { rows: products } = await pool.query(
    `SELECT id, name, category, price, quantity, image_url FROM ${SCHEMA}.products WHERE active = true ORDER BY name ASC`
  );

  const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Outro'];
  res.render('orders/edit', { order, products, paymentMethods: PAYMENT_METHODS, error: null });
});

router.post('/pedidos/:id/editar', async (req, res) => {
  const { items, discountType, discountValue, paymentMethod, customerName, note } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM ${SCHEMA}.orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const order = rows[0];
    if (!order || order.channel !== 'balcao') {
      throw new Error('Só é possível editar vendas feitas no balcão.');
    }
    if (order.status === 'cancelado') {
      throw new Error('Reative o pedido antes de editar os itens.');
    }

    await reverseOrderStockAndCash(client, order);

    const { orderItems, discountAmount, total } = await computeAndApplyItems(client, items, {
      type: discountType,
      value: discountValue,
    });

    const nome = (customerName || '').trim() || 'Cliente balcão';
    const descricaoPartes = [`Venda balcão - ${nome} (editada)`];
    if (note && note.trim()) descricaoPartes.push(note.trim());

    await client.query(
      `UPDATE ${SCHEMA}.orders
       SET customer_name = $1, items = $2, total = $3, discount = $4, payment_method = $5, updated_at = now()
       WHERE id = $6`,
      [nome, JSON.stringify(orderItems), total, discountAmount, paymentMethod || null, order.id]
    );

    await client.query(
      `INSERT INTO ${SCHEMA}.cash_transactions (type, category, amount, description, ref_type, ref_id)
       VALUES ('entrada', 'venda balcão', $1, $2, 'order', $3)`,
      [total, descricaoPartes.join(' — '), order.id]
    );

    await client.query('COMMIT');
    res.json({ ok: true, total, discountAmount });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message || 'Não foi possível salvar as alterações.' });
  } finally {
    client.release();
  }
});

module.exports = router;
