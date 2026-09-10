const express = require('express');
const { pool } = require('../lib/db');
const { SCHEMA } = require('../lib/migrate');

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows: saldoRows } = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'entrada' THEN amount ELSE 0 END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN type = 'saida' THEN amount ELSE 0 END), 0) AS saidas
    FROM ${SCHEMA}.cash_transactions
  `);
  const saldo = Number(saldoRows[0].entradas) - Number(saldoRows[0].saidas);

  const { rows: hojeRows } = await pool.query(`
    SELECT COUNT(*)::int AS pedidos_hoje, COALESCE(SUM(total), 0) AS faturado_hoje
    FROM ${SCHEMA}.orders
    WHERE created_at::date = CURRENT_DATE AND status != 'cancelado'
  `);

  const { rows: baixoEstoque } = await pool.query(`
    SELECT id, name, quantity FROM ${SCHEMA}.products
    WHERE active = true AND quantity <= 3
    ORDER BY quantity ASC
    LIMIT 10
  `);

  const { rows: ultimosPedidos } = await pool.query(`
    SELECT * FROM ${SCHEMA}.orders ORDER BY created_at DESC LIMIT 5
  `);

  res.render('dashboard', {
    saldo,
    pedidosHoje: hojeRows[0].pedidos_hoje,
    faturadoHoje: Number(hojeRows[0].faturado_hoje),
    baixoEstoque,
    ultimosPedidos,
  });
});

module.exports = router;
