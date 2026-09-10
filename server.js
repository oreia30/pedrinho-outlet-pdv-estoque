require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const { pool } = require('./lib/db');
const { ensureSchema } = require('./lib/migrate');
const { requireAuth } = require('./lib/auth');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const cashRoutes = require('./routes/cash');
const dashboardRoutes = require('./routes/dashboard');
const accountRoutes = require('./routes/account');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Garante que o schema/tabelas/admin existam antes de qualquer rota —
// elimina a necessidade de rodar SQL manual no Neon.
app.use(async (req, res, next) => {
  try {
    await ensureSchema(pool);
    next();
  } catch (err) {
    console.error('Erro ao migrar schema:', err);
    res.status(500).send('Erro ao inicializar banco de dados. Verifique DATABASE_URL.');
  }
});

app.locals.brand = {
  name: 'Pedrinho Outlet',
  slogan: 'Seu novo padrão de estilo começa aqui.',
};

app.use(authRoutes);

app.use(requireAuth);
app.use(dashboardRoutes);
app.use(productRoutes);
app.use(orderRoutes);
app.use(cashRoutes);
app.use(accountRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Painel Pedrinho Outlet rodando em http://localhost:${PORT}`);
});

module.exports = app;
