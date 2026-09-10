const express = require('express');
const multer = require('multer');
const { pool } = require('../lib/db');
const { SCHEMA } = require('../lib/migrate');
const { uploadImage, deleteImage, MAX_FILE_SIZE, MAX_FILES_PER_PRODUCT } = require('../lib/storage');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_PRODUCT },
});

router.get('/produtos', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM ${SCHEMA}.products ORDER BY created_at DESC`
  );
  res.render('products/list', { products: rows });
});

router.get('/produtos/novo', (req, res) => {
  res.render('products/form', { product: null, error: null });
});

router.get('/produtos/:id/editar', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM ${SCHEMA}.products WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.redirect('/produtos');
  res.render('products/form', { product: rows[0], error: null });
});

function parseAttributes(body) {
  const tamanhos = (body.tamanhos || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const attrs = {};
  if (tamanhos.length) attrs.tamanhos = tamanhos;
  if (body.cor) attrs.cor = body.cor.trim();
  return attrs;
}

router.post('/produtos', upload.array('images', MAX_FILES_PER_PRODUCT), async (req, res) => {
  try {
    const { name, description, category, price, quantity } = req.body;
    if (!name || !price) {
      return res.render('products/form', { product: req.body, error: 'Nome e preço são obrigatórios.' });
    }

    const files = req.files || [];
    const imageUrls = [];
    for (const file of files) {
      const url = await uploadImage(file.buffer, file.originalname, file.mimetype);
      imageUrls.push(url);
    }

    const attributes = parseAttributes(req.body);
    const active = req.body.active === 'on';

    await pool.query(
      `INSERT INTO ${SCHEMA}.products (name, description, category, price, quantity, image_url, images, attributes, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        name,
        description || null,
        category || null,
        Number(price),
        Number(quantity || 0),
        imageUrls[0] || null,
        JSON.stringify(imageUrls),
        JSON.stringify(attributes),
        active,
      ]
    );

    res.redirect('/produtos');
  } catch (err) {
    console.error(err);
    res.render('products/form', {
      product: req.body,
      error: err.message.includes('File too large')
        ? `Cada foto precisa ter até ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
        : 'Erro ao salvar produto. Tente novamente.',
    });
  }
});

router.post('/produtos/:id', upload.array('images', MAX_FILES_PER_PRODUCT), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`SELECT * FROM ${SCHEMA}.products WHERE id = $1`, [id]);
    const existing = rows[0];
    if (!existing) return res.redirect('/produtos');

    const { name, description, category, price, quantity } = req.body;
    const keepImages = [].concat(req.body.keepImages || []).filter(Boolean);

    const files = req.files || [];
    const newUrls = [];
    for (const file of files) {
      const url = await uploadImage(file.buffer, file.originalname, file.mimetype);
      newUrls.push(url);
    }

    // apaga do storage as imagens antigas que o usuário removeu na tela
    const previousImages = Array.isArray(existing.images) ? existing.images : [];
    const removed = previousImages.filter((u) => !keepImages.includes(u));
    for (const url of removed) {
      await deleteImage(url);
    }

    const finalImages = [...keepImages, ...newUrls];
    const attributes = parseAttributes(req.body);
    const active = req.body.active === 'on';

    await pool.query(
      `UPDATE ${SCHEMA}.products
       SET name=$1, description=$2, category=$3, price=$4, quantity=$5,
           image_url=$6, images=$7, attributes=$8, active=$9, updated_at=now()
       WHERE id=$10`,
      [
        name,
        description || null,
        category || null,
        Number(price),
        Number(quantity || 0),
        finalImages[0] || null,
        JSON.stringify(finalImages),
        JSON.stringify(attributes),
        active,
        id,
      ]
    );

    res.redirect('/produtos');
  } catch (err) {
    console.error(err);
    res.redirect(`/produtos/${req.params.id}/editar`);
  }
});

router.post('/produtos/:id/excluir', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM ${SCHEMA}.products WHERE id = $1`, [req.params.id]);
  const product = rows[0];
  if (product) {
    const images = Array.isArray(product.images) ? product.images : [];
    for (const url of images) {
      await deleteImage(url);
    }
    await pool.query(`DELETE FROM ${SCHEMA}.products WHERE id = $1`, [req.params.id]);
  }
  res.redirect('/produtos');
});

module.exports = router;
