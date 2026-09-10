const express = require('express');
const multer = require('multer');
const { pool } = require('../lib/db');
const { SCHEMA, slugify } = require('../lib/migrate');
const { uploadImage, deleteImage, MAX_FILE_SIZE } = require('../lib/storage');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

async function loadSettingsPage(res, extra = {}) {
  const { rows: settingsRows } = await pool.query(`SELECT * FROM ${SCHEMA}.store_settings WHERE id = 1`);
  const { rows: categories } = await pool.query(`SELECT * FROM ${SCHEMA}.categories ORDER BY name ASC`);
  res.render('settings', {
    settings: settingsRows[0] || { banner_url: null, logo_url: null },
    categories,
    MAX_FILE_SIZE_MB: MAX_FILE_SIZE / (1024 * 1024),
    error: null,
    success: null,
    ...extra,
  });
}

router.get('/configuracoes', async (req, res) => {
  await loadSettingsPage(res);
});

router.post('/configuracoes/banner', upload.single('banner'), async (req, res) => {
  try {
    if (!req.file) throw new Error('Escolha uma imagem para o banner.');
    const { rows } = await pool.query(`SELECT banner_url FROM ${SCHEMA}.store_settings WHERE id = 1`);
    const oldUrl = rows[0] && rows[0].banner_url;

    const url = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
    await pool.query(`UPDATE ${SCHEMA}.store_settings SET banner_url = $1, updated_at = now() WHERE id = 1`, [url]);
    if (oldUrl) await deleteImage(oldUrl);

    await loadSettingsPage(res, { success: 'Banner atualizado com sucesso.' });
  } catch (err) {
    console.error(err);
    await loadSettingsPage(res, {
      error: err.message.includes('File too large')
        ? `A imagem do banner precisa ter até ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
        : err.message || 'Erro ao enviar o banner.',
    });
  }
});

router.post('/configuracoes/banner/remover', async (req, res) => {
  const { rows } = await pool.query(`SELECT banner_url FROM ${SCHEMA}.store_settings WHERE id = 1`);
  const oldUrl = rows[0] && rows[0].banner_url;
  await pool.query(`UPDATE ${SCHEMA}.store_settings SET banner_url = NULL, updated_at = now() WHERE id = 1`);
  if (oldUrl) await deleteImage(oldUrl);
  await loadSettingsPage(res, { success: 'Banner removido.' });
});

router.post('/configuracoes/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) throw new Error('Escolha uma imagem para a logo.');
    const { rows } = await pool.query(`SELECT logo_url FROM ${SCHEMA}.store_settings WHERE id = 1`);
    const oldUrl = rows[0] && rows[0].logo_url;

    const url = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
    await pool.query(`UPDATE ${SCHEMA}.store_settings SET logo_url = $1, updated_at = now() WHERE id = 1`, [url]);
    if (oldUrl) await deleteImage(oldUrl);

    await loadSettingsPage(res, { success: 'Logo atualizada com sucesso.' });
  } catch (err) {
    console.error(err);
    await loadSettingsPage(res, {
      error: err.message.includes('File too large')
        ? `A imagem da logo precisa ter até ${MAX_FILE_SIZE / (1024 * 1024)}MB.`
        : err.message || 'Erro ao enviar a logo.',
    });
  }
});

router.post('/configuracoes/logo/remover', async (req, res) => {
  const { rows } = await pool.query(`SELECT logo_url FROM ${SCHEMA}.store_settings WHERE id = 1`);
  const oldUrl = rows[0] && rows[0].logo_url;
  await pool.query(`UPDATE ${SCHEMA}.store_settings SET logo_url = NULL, updated_at = now() WHERE id = 1`);
  if (oldUrl) await deleteImage(oldUrl);
  await loadSettingsPage(res, { success: 'Logo removida — volta a mostrar o nome da loja.' });
});

router.post('/configuracoes/categorias', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) throw new Error('Digite um nome para a categoria.');
    const slug = slugify(name);
    await pool.query(
      `INSERT INTO ${SCHEMA}.categories (name, slug) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [name, slug]
    );
    await loadSettingsPage(res, { success: `Categoria "${name}" adicionada.` });
  } catch (err) {
    await loadSettingsPage(res, { error: err.message || 'Erro ao adicionar categoria.' });
  }
});

router.post('/configuracoes/categorias/:id/excluir', async (req, res) => {
  await pool.query(`DELETE FROM ${SCHEMA}.categories WHERE id = $1`, [req.params.id]);
  await loadSettingsPage(res, { success: 'Categoria removida.' });
});

module.exports = router;
