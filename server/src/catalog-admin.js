// Panel Super Admin — Gestión de películas y series: conexión, importación
// (start/stop/resume), sincronización manual, estadísticas, errores, vincular
// fuentes de reproducción autorizadas y ocultar títulos. Solo rol admin.
import express from 'express';
import { query, one } from './pg.js';
import { requireAuth, requireRole } from './auth.js';
import {
  getProvider, importStatus, startImport, stopImport, resetCursors, syncUpdates,
} from './catalog/index.js';
import { catalogStats, recentJobs } from './catalog/repo.js';
import { importArchive, archiveStatus } from './catalog/archive.js';

const router = express.Router();
router.use('/admin/catalog', requireAuth, requireRole('admin'));

// Estado general + conteos.
router.get('/admin/catalog/status', async (req, res) => {
  res.json({ ...importStatus(), archive: archiveStatus(), stats: await catalogStats() });
});

// Importar películas de DOMINIO PÚBLICO desde Internet Archive (reproducibles).
router.post('/admin/catalog/import-archive', (req, res) => {
  res.json(importArchive({ perGenre: Number(req.body?.perGenre) || 40 }));
});

// Probar la conexión con TheTVDB (login).
router.post('/admin/catalog/test', async (req, res) => {
  res.json(await getProvider().testConnection());
});

// Importar (en segundo plano). body: { movies, series, maxItems }
router.post('/admin/catalog/import', async (req, res) => {
  const { movies = true, series = true, maxItems } = req.body || {};
  res.json(await startImport({ movies, series, maxItems: maxItems ? Number(maxItems) : undefined }));
});
router.post('/admin/catalog/stop', (req, res) => res.json(stopImport()));
router.post('/admin/catalog/reset', async (req, res) => { await resetCursors(); res.json({ ok: true }); });
router.post('/admin/catalog/sync', async (req, res) => res.json(await syncUpdates()));

// Historial de jobs (errores incluidos).
router.get('/admin/catalog/jobs', async (req, res) => res.json(await recentJobs(25)));

// Ocultar / mostrar un título.
router.post('/admin/catalog/:type/:id/hide', async (req, res) => {
  const table = req.params.type === 'serie' || req.params.type === 'series' ? 'series' : 'movies';
  const r = await one(`UPDATE ${table} SET hidden = NOT hidden WHERE id=$1 RETURNING hidden`, [req.params.id]);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  res.json({ hidden: r.hidden });
});

// Vincular una fuente de reproducción AUTORIZADA a una película o episodio.
// body: { url, kind, referrer, userAgent, quality }
router.post('/admin/catalog/:type/:id/source', async (req, res) => {
  const ct = req.params.type === 'episode' ? 'episode' : 'movie';
  const { url, kind = 'hls', referrer, userAgent, quality } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL inválida' });
  const row = await one(
    `INSERT INTO media_sources (content_type, content_id, url, kind, referrer, user_agent, quality)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [ct, req.params.id, url, kind, referrer || null, userAgent || null, quality || null]);
  res.json({ ok: true, id: row.id });
});
router.delete('/admin/catalog/source/:id', async (req, res) => {
  await query('DELETE FROM media_sources WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
