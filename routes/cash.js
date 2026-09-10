const express = require('express');
const { pool } = require('../lib/db');
const { SCHEMA } = require('../lib/migrate');

const router = express.Router();

router.get('/caixa', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM ${SCHEMA}.cash_transactions ORDER BY created_at DESC LIMIT 300`
  );
  const { rows: totals } = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'entrada' THEN amount ELSE 0 END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN type = 'saida' THEN amount ELSE 0 END), 0) AS saidas
    FROM ${SCHEMA}.cash_transactions
  `);
  const saldo = Number(totals[0].entradas) - Number(totals[0].saidas);
  res.render('cash/list', { transactions: rows, saldo, error: null, erro: req.query.erro || null });
});

router.post('/caixa', async (req, res) => {
  try {
    const { type, category, amount, description } = req.body;
    if (!['entrada', 'saida'].includes(type) || !category || !amount) {
      throw new Error('Preencha tipo, categoria e valor.');
    }
    await pool.query(
      `INSERT INTO ${SCHEMA}.cash_transactions (type, category, amount, description)
       VALUES ($1,$2,$3,$4)`,
      [type, category, Number(amount), description || null]
    );
    res.redirect('/caixa');
  } catch (err) {
    const { rows } = await pool.query(
      `SELECT * FROM ${SCHEMA}.cash_transactions ORDER BY created_at DESC LIMIT 300`
    );
    res.render('cash/list', { transactions: rows, saldo: null, error: err.message, erro: null });
  }
});

// Só lançamentos manuais (ref_type nulo) podem ser editados/apagados por aqui.
// Lançamentos de vendas (ref_type = 'order') são ajustados editando ou
// cancelando o pedido em /pedidos — mexer neles direto aqui deixaria o total
// do pedido e o caixa dessincronizados.
router.get('/caixa/:id/editar', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM ${SCHEMA}.cash_transactions WHERE id = $1`, [req.params.id]);
  const tx = rows[0];
  if (!tx || tx.ref_type) {
    return res.redirect(
      '/caixa?erro=' + encodeURIComponent('Esse lançamento vem de uma venda — edite ou cancele o pedido em Pedidos.')
    );
  }
  res.render('cash/edit', { tx, error: null });
});

router.post('/caixa/:id/editar', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM ${SCHEMA}.cash_transactions WHERE id = $1`, [req.params.id]);
  const tx = rows[0];
  if (!tx || tx.ref_type) {
    return res.redirect(
      '/caixa?erro=' + encodeURIComponent('Esse lançamento vem de uma venda — edite ou cancele o pedido em Pedidos.')
    );
  }

  try {
    const { type, category, amount, description } = req.body;
    if (!['entrada', 'saida'].includes(type) || !category || !amount) {
      throw new Error('Preencha tipo, categoria e valor.');
    }
    await pool.query(
      `UPDATE ${SCHEMA}.cash_transactions SET type = $1, category = $2, amount = $3, description = $4 WHERE id = $5`,
      [type, category, Number(amount), description || null, req.params.id]
    );
    res.redirect('/caixa');
  } catch (err) {
    res.render('cash/edit', { tx: { ...tx, ...req.body }, error: err.message });
  }
});

router.post('/caixa/:id/excluir', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM ${SCHEMA}.cash_transactions WHERE id = $1`, [req.params.id]);
  const tx = rows[0];
  if (tx && !tx.ref_type) {
    await pool.query(`DELETE FROM ${SCHEMA}.cash_transactions WHERE id = $1`, [req.params.id]);
  }
  res.redirect('/caixa');
});

module.exports = router;
