const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../lib/db');
const { SCHEMA } = require('../lib/migrate');
const { issueSession, clearSession } = require('../lib/auth');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('login', { error: 'Preencha e-mail e senha.' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${SCHEMA}.users WHERE email = $1 AND active = true`,
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user) {
      return res.render('login', { error: 'E-mail ou senha inválidos.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.render('login', { error: 'E-mail ou senha inválidos.' });
    }
    issueSession(res, user);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Erro ao entrar. Tente novamente.' });
  }
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.redirect('/login');
});

module.exports = router;
