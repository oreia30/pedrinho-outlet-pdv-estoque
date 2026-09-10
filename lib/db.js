const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('[aviso] DATABASE_URL não definida — configure no .env ou nas variáveis de ambiente da Vercel.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

module.exports = { pool };
