// Canales manuales: los que el admin carga a mano (Tigo Sport y otros deportes
// de Paraguay que iptv-org no trae con señal). Se guardan en PostgreSQL, se
// inyectan en los listados de canales y se reproducen por el mismo proxy
// (/api/stream) que los de iptv-org. El id público es "man:<n>".

import express from 'express';
import { query, one, many } from './pg.js';
import { requireRole } from './auth.js';

const PREFIX = 'man:';
export const isManualId = (id) => typeof id === 'string' && id.startsWith(PREFIX);

// Sube http -> https donde se pueda (Android bloquea cleartext por defecto).
function httpsLogo(url) {
  if (!url) return null;
  return url.startsWith('http://') ? 'https://' + url.slice(7) : url;
}

// DTO con la MISMA forma que toDTO() de iptvSource, para que el frontend y la
// APK lo traten igual que un canal normal.
function toCard(row) {
  return {
    id: PREFIX + row.id,
    name: row.name,
    altNames: [],
    country: row.country,
    categories: [row.category],
    isNsfw: false,
    website: null,
    closed: false,
    logo: httpsLogo(row.logo_url),
    streamCount: 1,
    manual: true,
  };
}

// Canales habilitados que coinciden con el filtro (para inyectar en listados).
// country/category opcionales; si se pasan, deben coincidir.
export async function manualCards({ country, category } = {}) {
  const where = ['enabled'];
  const params = [];
  if (country) { params.push(country); where.push(`country = $${params.length}`); }
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  const rows = await many(
    `SELECT * FROM manual_channels WHERE ${where.join(' AND ')} ORDER BY sort ASC, id ASC`,
    params
  );
  return rows.map(toCard);
}

// Streams de un canal manual ("man:<n>") con la forma de getChannelStreams.
export async function manualStreams(publicId) {
  const n = parseInt(String(publicId).slice(PREFIX.length), 10);
  if (!Number.isFinite(n)) return null;
  const row = await one(`SELECT * FROM manual_channels WHERE id = $1 AND enabled`, [n]);
  if (!row) return null;
  return {
    channel: toCard(row),
    streams: [{ url: row.stream_url, quality: null, userAgent: row.user_agent || null, referrer: row.referrer || null }],
  };
}

// ---------- Router admin ----------
const router = express.Router();

function h(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      const status = err.status || 500;
      if (status === 500) console.error('[manual-channels]', err);
      res.status(status).json({ error: err.message });
    });
  };
}

function body(req) {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const streamUrl = String(b.streamUrl || '').trim();
  return {
    name,
    streamUrl,
    logoUrl: b.logoUrl ? String(b.logoUrl).trim() : null,
    userAgent: b.userAgent ? String(b.userAgent).trim() : null,
    referrer: b.referrer ? String(b.referrer).trim() : null,
    country: (b.country ? String(b.country).trim().toUpperCase() : 'PY') || 'PY',
    category: (b.category ? String(b.category).trim().toLowerCase() : 'sports') || 'sports',
    enabled: b.enabled === undefined ? true : !!b.enabled,
    sort: Number.isFinite(+b.sort) ? parseInt(b.sort, 10) : 0,
  };
}

router.get('/admin/manual-channels', requireRole('admin'), h(async (req, res) => {
  const rows = await many(`SELECT * FROM manual_channels ORDER BY sort ASC, id ASC`);
  res.json(rows);
}));

router.post('/admin/manual-channels', requireRole('admin'), h(async (req, res) => {
  const d = body(req);
  if (!d.name || !d.streamUrl) return res.status(400).json({ error: 'Nombre y URL del stream son obligatorios' });
  if (!/^https?:\/\//i.test(d.streamUrl)) return res.status(400).json({ error: 'La URL del stream debe empezar con http(s)://' });
  const row = await one(
    `INSERT INTO manual_channels (name, logo_url, stream_url, user_agent, referrer, country, category, enabled, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.name, d.logoUrl, d.streamUrl, d.userAgent, d.referrer, d.country, d.category, d.enabled, d.sort]
  );
  res.status(201).json(row);
}));

router.patch('/admin/manual-channels/:id', requireRole('admin'), h(async (req, res) => {
  const d = body(req);
  if (!d.name || !d.streamUrl) return res.status(400).json({ error: 'Nombre y URL del stream son obligatorios' });
  const row = await one(
    `UPDATE manual_channels SET name=$1, logo_url=$2, stream_url=$3, user_agent=$4, referrer=$5,
       country=$6, category=$7, enabled=$8, sort=$9 WHERE id=$10 RETURNING *`,
    [d.name, d.logoUrl, d.streamUrl, d.userAgent, d.referrer, d.country, d.category, d.enabled, d.sort, req.params.id]
  );
  if (!row) return res.status(404).json({ error: 'Canal no encontrado' });
  res.json(row);
}));

router.delete('/admin/manual-channels/:id', requireRole('admin'), h(async (req, res) => {
  await query(`DELETE FROM manual_channels WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

export default router;
