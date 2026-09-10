const bcrypt = require('bcryptjs');

const SCHEMA = 'pedrinho';

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Catálogo de exemplo (moda masculina) — trocar pelo catálogo real no painel.
const SAMPLE_PRODUCTS = [
  {
    name: 'Camiseta Oversized Preta',
    description: 'Camiseta oversized 100% algodão, estampa minimalista.',
    category: 'Camisetas',
    price: 79.9,
    quantity: 10,
    attributes: { tamanhos: ['P', 'M', 'G', 'GG'], cor: 'Preto' },
  },
  {
    name: 'Bermuda Moletom Cinza',
    description: 'Bermuda de moletom com bolsos, cordão ajustável.',
    category: 'Bermudas',
    price: 99.9,
    quantity: 10,
    attributes: { tamanhos: ['P', 'M', 'G', 'GG'], cor: 'Cinza' },
  },
  {
    name: 'Boné Aba Reta Pedrinho Outlet',
    description: 'Boné aba reta bordado, ajuste de fivela.',
    category: 'Acessórios',
    price: 59.9,
    quantity: 10,
    attributes: { tamanhos: ['Único'], cor: 'Preto' },
  },
  {
    name: 'Jaqueta Corta-Vento Preta',
    description: 'Jaqueta corta-vento impermeável, forro interno.',
    category: 'Jaquetas',
    price: 189.9,
    quantity: 10,
    attributes: { tamanhos: ['M', 'G', 'GG'], cor: 'Preto' },
  },
  {
    name: 'Calça Cargo Bege',
    description: 'Calça cargo com bolsos laterais, tecido resistente.',
    category: 'Calças',
    price: 149.9,
    quantity: 10,
    attributes: { tamanhos: ['38', '40', '42', '44'], cor: 'Bege' },
  },
];

let migrated = false;

async function ensureSchema(pool) {
  if (migrated) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'administrador',
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        price NUMERIC NOT NULL DEFAULT 0,
        quantity NUMERIC NOT NULL DEFAULT 0,
        image_url TEXT,
        images JSONB NOT NULL DEFAULT '[]',
        attributes JSONB NOT NULL DEFAULT '{}',
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_name TEXT NOT NULL,
        customer_contact TEXT,
        address TEXT,
        items JSONB NOT NULL,
        total NUMERIC NOT NULL,
        payment_method TEXT,
        status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pago','pendente','cancelado')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.cash_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL CHECK (type IN ('entrada','saida')),
        category TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        description TEXT,
        ref_type TEXT,
        ref_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Config visual da loja (banner + logo). Uma linha só, id fixo = 1.
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.store_settings (
        id INT PRIMARY KEY DEFAULT 1,
        banner_url TEXT,
        logo_url TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (id = 1)
      )
    `);
    await client.query(
      `INSERT INTO ${SCHEMA}.store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
    );

    // Categorias de exemplo só se a tabela ainda estiver vazia — não pisa em
    // categorias que o cliente já tenha criado/apagado no painel.
    const { rows: catRows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${SCHEMA}.categories`);
    if (catRows[0].count === 0) {
      const defaultCategories = ['Camisetas', 'Bermudas', 'Acessórios', 'Jaquetas', 'Calças'];
      for (const name of defaultCategories) {
        await client.query(
          `INSERT INTO ${SCHEMA}.categories (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
          [name, slugify(name)]
        );
      }
    }

    // Admin + catálogo de exemplo só na primeira vez (tabela de usuários vazia)
    const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM ${SCHEMA}.users`);
    if (rows[0].count === 0) {
      const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'Pedrinho@2026';
      const passwordHash = await bcrypt.hash(defaultPassword, 10);
      await client.query(
        `INSERT INTO ${SCHEMA}.users (name, email, password_hash, role) VALUES ($1, $2, $3, 'administrador')`,
        ['Pedrinho', 'admin@pedrinhooutlet.com', passwordHash]
      );

      for (const p of SAMPLE_PRODUCTS) {
        await client.query(
          `INSERT INTO ${SCHEMA}.products (name, description, category, price, quantity, attributes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [p.name, p.description, p.category, p.price, p.quantity, p.attributes]
        );
      }
    }

    await client.query('COMMIT');
    migrated = true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ensureSchema, SCHEMA, slugify };
