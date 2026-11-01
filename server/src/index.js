import './env.js'; // carga .env antes que nada (debe ir primero)
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import {
  ensureLoaded,
  getMeta,
  queryChannels,
  getChannelStreams,
} from './iptvSource.js';
import { checkStream, checkMany } from './checker.js';
import { streamHandler } from './proxy.js';
import { initSchema, ping } from './pg.js';
import { attachUser, requireActiveViewer } from './auth.js';
import accountsRouter, { ensureSeed } from './accounts.js';
// VOD (películas/series) desactivado por ahora — la app es solo canales.
// Para reactivar: descomentar este import, el app.use y el ensureVodSeed de abajo.
// import vodRouter, { ensureVodSeed } from './vod.js';

// Red de seguridad: el proxy maneja flujos de red inestables. Un error suelto
// (p. ej. un socket que corta) no debe tumbar todo el servidor.
process.on('uncaughtException', (err) => console.error('[api] uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('[api] unhandled:', err?.message || err));

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
// Adjunta req.user (desde la cookie de sesión) en todas las rutas.
app.use(attachUser);

// Rutas de cuentas/negocio (login, admin, reseller, paquetes, watch).
app.use('/api', accountsRouter);
// Rutas de VOD (películas y series) — desactivadas por ahora (solo canales).
// app.use('/api', vodRouter);

// Carga/refresca el cache de iptv-org antes de responder consultas de datos.
async function withData(req, res, next) {
  try {
    await ensureLoaded();
    next();
  } catch (err) {
    res.status(502).json({ error: 'No se pudo cargar iptv-org', detail: err.message });
  }
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Metadata para filtros (países y categorías con canales).
app.get('/api/meta', requireActiveViewer, withData, (req, res) => {
  res.json(getMeta());
});

// Listado de canales con filtros y paginación.
//   ?country=PY&category=sports&search=espn&page=1&pageSize=40
app.get('/api/channels', requireActiveViewer, withData, (req, res) => {
  const {
    country,
    category,
    search,
    page = '1',
    pageSize = '40',
    includeNsfw = 'false',
    onlyWithStreams = 'true',
  } = req.query;
  res.json(
    queryChannels({
      country: country || undefined,
      category: category || undefined,
      search: search || undefined,
      page: Math.max(1, parseInt(page, 10) || 1),
      pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 40)),
      includeNsfw: includeNsfw === 'true',
      onlyWithStreams: onlyWithStreams !== 'false',
    })
  );
});

// Streams de un canal concreto.
app.get('/api/channels/:id/streams', requireActiveViewer, withData, (req, res) => {
  const data = getChannelStreams(req.params.id);
  if (!data) return res.status(404).json({ error: 'Canal no encontrado' });
  res.json(data);
});

// Proxy de reproducción: reenvía el stream con cabeceras y resuelve CORS.
//   /api/stream?url=...&ua=...&ref=...
app.get('/api/stream', requireActiveViewer, streamHandler());

// Verifica si un stream responde. ?url=...&userAgent=...&referrer=...
app.get('/api/check', requireActiveViewer, async (req, res) => {
  const { url, userAgent, referrer } = req.query;
  res.json(await checkStream({ url, userAgent, referrer }));
});

// Verifica todos los streams de un canal y devuelve cuáles responden.
app.get('/api/channels/:id/check', requireActiveViewer, withData, async (req, res) => {
  const data = getChannelStreams(req.params.id);
  if (!data) return res.status(404).json({ error: 'Canal no encontrado' });
  const checked = await checkMany(data.streams, { concurrency: 6 });
  res.json({ channel: data.channel, streams: checked });
});

// Fuerza refresco del cache de iptv-org.
app.post('/api/refresh', async (req, res) => {
  try {
    await ensureLoaded({ force: true });
    res.json({ ok: true, ...getMeta().totals });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// En producción, servir el frontend compilado (web/dist) desde el mismo
// origen que la API y el proxy. Así el PWA tiene un solo origen y el
// service worker cubre todo el sitio.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../../web/dist');
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  // SPA fallback: cualquier ruta que no sea /api devuelve index.html.
  app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
  console.log('[api] sirviendo frontend desde web/dist');
}

// Inicializa la base de datos (esquema + seed) y luego arranca el servidor.
async function start() {
  try {
    await ping();
    await initSchema();
    await ensureSeed();
    // await ensureVodSeed(); // VOD desactivado por ahora (solo canales)
    console.log('[api] PostgreSQL conectado y listo');
  } catch (e) {
    console.error('[api] ERROR conectando a PostgreSQL:', e.message);
    console.error('[api] Verificá que exista la base/usuario (ver README) y las credenciales (PGUSER/PGPASSWORD).');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[api] escuchando en http://localhost:${PORT}`);
    // Precarga en segundo plano para que la primera consulta sea rápida.
    ensureLoaded()
      .then(() => console.log('[api] datos de iptv-org cargados'))
      .catch((e) => console.error('[api] error precargando:', e.message));
  });
}

start();
