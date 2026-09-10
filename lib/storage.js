const fs = require('fs');
const path = require('path');

// Limite prático por arquivo e por produto (ver README — evita estourar o
// limite de tamanho de requisição das funções da Vercel no upload direto
// pelo servidor).
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_FILES_PER_PRODUCT = 5;

async function uploadImage(buffer, originalName, mimetype) {
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${originalName}`.replace(
    /[^a-zA-Z0-9.\-_]/g,
    '_'
  );

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Produção: sobe pro Vercel Blob. Só a URL fica salva no Postgres —
    // o arquivo em si nunca entra no banco de dados.
    const { put } = require('@vercel/blob');
    const blob = await put(`produtos/${safeName}`, buffer, {
      access: 'public',
      contentType: mimetype,
    });
    return blob.url;
  }

  if (process.env.VERCEL) {
    // Rodando na Vercel sem Blob configurado: o sistema de arquivos da
    // função é somente leitura (fora de /tmp) e não persiste entre
    // requisições, então gravar a foto ali não funcionaria de verdade.
    // Erro claro aqui é melhor do que uma foto que "sobe" e some depois.
    throw new Error(
      'Upload de fotos precisa do Vercel Blob configurado (Storage → Create Database → Blob no projeto).'
    );
  }

  // Fallback local — só entra em uso rodando localmente (npm start na sua
  // máquina) sem BLOB_READ_WRITE_TOKEN configurada.
  const dir = path.join(__dirname, '..', 'public', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, safeName), buffer);
  return `/uploads/${safeName}`;
}

async function deleteImage(url) {
  if (!url) return;
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN && /blob\.vercel-storage\.com/.test(url)) {
      const { del } = require('@vercel/blob');
      await del(url);
    } else if (url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', 'public', url);
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn('[aviso] não foi possível apagar imagem antiga:', err.message);
  }
}

module.exports = { uploadImage, deleteImage, MAX_FILE_SIZE, MAX_FILES_PER_PRODUCT };
