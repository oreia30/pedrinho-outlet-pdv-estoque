const express = require('express');
const { pool } = require('../lib/db');
const { SCHEMA } = require('../lib/migrate');

const router = express.Router();

router.get('/pedidos', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM ${SCHEMA}.orders ORDER BY created_at DESC LIMIT 200`
  );
  res.render('orders/list', { orders: rows });
});

router.post('/pedidos/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['pago', 'pendente', 'cancelado'].includes(status)) {
    return res.redirect('/pedidos');
  }
  await pool.query(`UPDATE ${SCHEMA}.orders SET status = $1 WHERE id = $2`, [status, req.params.id]);
  res.redirect('/pedidos');
});

module.exports = router;
