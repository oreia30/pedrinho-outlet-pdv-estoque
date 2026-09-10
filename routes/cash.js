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
  res.render('cash/list', { transactions: rows, saldo, error: null });
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
    res.render('cash/list', { transactions: rows, saldo: null, error: err.message });
  }
});

module.exports = router;
