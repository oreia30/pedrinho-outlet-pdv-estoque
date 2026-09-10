const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'pedrinho_session';
const SESSION_DAYS = 180;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET não definida — configure uma string aleatória longa no .env / Vercel.');
  }
  return secret;
}

function issueSession(res, user) {
  const token = jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role },
    getSecret(),
    { expiresIn: `${SESSION_DAYS}d` }
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME);
}

// Middleware: exige login. Renova o cookie (sessão deslizante) a cada request válido.
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.redirect('/login');
  }
  try {
    const payload = jwt.verify(token, getSecret());
    req.user = payload;
    issueSession(res, { id: payload.sub, name: payload.name, email: payload.email, role: payload.role });
    next();
  } catch (err) {
    clearSession(res);
    return res.redirect('/login');
  }
}

// Mesma checagem, mas pra rotas de API (responde 401 em JSON em vez de redirecionar)
function requireAuthApi(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'não autenticado' });
  }
  try {
    const payload = jwt.verify(token, getSecret());
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'sessão inválida' });
  }
}

module.exports = { issueSession, clearSession, requireAuth, requireAuthApi, COOKIE_NAME };
