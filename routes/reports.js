const express = require('express');
const { pool } = require('../lib/db');
const { SCHEMA } = require('../lib/migrate');

const router = express.Router();

function getRange(periodoRaw) {
  const now = new Date();
  let periodo = periodoRaw;
  let start;

  if (periodo === '7d') {
    start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (periodo === '30d') {
    start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  } else if (periodo === 'mes') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    periodo = 'hoje';
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  }

  return { start, periodo };
}

router.get('/relatorios', async (req, res) => {
  const { start, periodo } = getRange(req.query.periodo);

  const { rows: vendaRows } = await pool.query(
    `SELECT COUNT(*)::int AS qtd, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(discount), 0) AS descontos
     FROM ${SCHEMA}.orders
     WHERE created_at >= $1 AND status != 'cancelado'`,
    [start]
  );
  const qtdVendas = vendaRows[0].qtd;
  const totalVendas = Number(vendaRows[0].total);
  const totalDescontos = Number(vendaRows[0].descontos);
  const ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0;

  const { rows: caixaRows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'entrada' THEN amount ELSE 0 END), 0) AS entradas,
       COALESCE(SUM(CASE WHEN type = 'saida' THEN amount ELSE 0 END), 0) AS saidas
     FROM ${SCHEMA}.cash_transactions
     WHERE created_at >= $1`,
    [start]
  );
  const entradas = Number(caixaRows[0].entradas);
  const saidas = Number(caixaRows[0].saidas);

  const { rows: porPagamento } = await pool.query(
    `SELECT COALESCE(payment_method, 'Não informado') AS metodo, COUNT(*)::int AS qtd, COALESCE(SUM(total), 0) AS total
     FROM ${SCHEMA}.orders
     WHERE created_at >= $1 AND status != 'cancelado'
     GROUP BY metodo
     ORDER BY total DESC`,
    [start]
  );

  const { rows: porCanal } = await pool.query(
    `SELECT channel, COUNT(*)::int AS qtd, COALESCE(SUM(total), 0) AS total
     FROM ${SCHEMA}.orders
     WHERE created_at >= $1 AND status != 'cancelado'
     GROUP BY channel
     ORDER BY total DESC`,
    [start]
  );

  const { rows: topProdutos } = await pool.query(
    `SELECT item->>'name' AS name,
            SUM((item->>'quantity')::numeric) AS quantidade,
            SUM((item->>'quantity')::numeric * (item->>'unit_price')::numeric) AS receita
     FROM ${SCHEMA}.orders, jsonb_array_elements(items) AS item
     WHERE created_at >= $1 AND status != 'cancelado'
     GROUP BY name
     ORDER BY quantidade DESC
     LIMIT 8`,
    [start]
  );

  const { rows: canceladas } = await pool.query(
    `SELECT COUNT(*)::int AS qtd, COALESCE(SUM(total), 0) AS total
     FROM ${SCHEMA}.orders
     WHERE created_at >= $1 AND status = 'cancelado'`,
    [start]
  );

  res.render('reports', {
    periodo,
    qtdVendas,
    totalVendas,
    totalDescontos,
    ticketMedio,
    entradas,
    saidas,
    saldoPeriodo: entradas - saidas,
    porPagamento,
    porCanal,
    topProdutos,
    canceladasQtd: canceladas[0].qtd,
    canceladasTotal: Number(canceladas[0].total),
  });
});

module.exports = router;
