const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../lib/db');
const { SCHEMA } = require('../lib/migrate');

const router = express.Router();

router.get('/conta', (req, res) => {
  res.render('account', { error: null, success: null });
});

router.post('/conta/senha', async (req, res) => {
  try {
    const { senhaAtual, novaSenha, confirmarSenha } = req.body;
    if (!senhaAtual || !novaSenha || novaSenha.length < 8) {
      throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
    }
    if (novaSenha !== confirmarSenha) {
      throw new Error('A confirmação não confere com a nova senha.');
    }
    const { rows } = await pool.query(`SELECT * FROM ${SCHEMA}.users WHERE id = $1`, [req.user.sub]);
    const user = rows[0];
    const ok = user && (await bcrypt.compare(senhaAtual, user.password_hash));
    if (!ok) throw new Error('Senha atual incorreta.');

    const newHash = await bcrypt.hash(novaSenha, 10);
    await pool.query(`UPDATE ${SCHEMA}.users SET password_hash = $1 WHERE id = $2`, [newHash, user.id]);
    res.render('account', { error: null, success: 'Senha alterada com sucesso.' });
  } catch (err) {
    res.render('account', { error: err.message, success: null });
  }
});

module.exports = router;
