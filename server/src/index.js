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
import { streamToken, validToken } from './streamToken.js';
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

// Detrás de Cloudflare / proxy del hosting: confiar en X-Forwarded-* para que
// req.protocol sea https (necesario para armar URLs absolutas de cast).
app.set('trust proxy', true);

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

// Autorización del stream: cookie de sesión normal, o un token firmado
// (?t=) para proyectar a Chromecast/Smart TV sin cookie.
function streamAuth(req, res, next) {
  if (validToken(req.query.url, req.query.t)) return next();
  return requireActiveViewer(req, res, next);
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Metadata para filtros (países y categorías con canales).
app.get('/api/meta', requireActiveViewer, withData, (req, res) => {
  res.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
  res.json(getMeta());
});

// País del visitante según su IP (Cloudflare agrega el header cf-ipcountry).
// Sin Cloudflare (local) o país inválido -> Paraguay por defecto.
function geoCountry(req) {
  const cc = String(req.headers['cf-ipcountry'] || '').toUpperCase();
  return /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1' ? cc : 'PY';
}

// Otros países a mostrar en el inicio además del propio.
const EXTRA_COUNTRIES = ['PY', 'AR', 'BR', 'UY', 'CL', 'MX', 'ES', 'US'];
const chRow = (opts) => queryChannels({ page: 1, pageSize: 20, onlyWithStreams: true, ...opts }).items;

// Devuelve el país detectado por IP (para que el frontend ajuste la vista TV).
app.get('/api/geo', requireActiveViewer, (req, res) => {
  res.set('Cache-Control', 'private, max-age=600');
  res.json({ country: geoCountry(req) });
});

// Inicio en UN solo pedido: según el país del visitante (por IP), sus canales
// van primero; luego deportes, noticias, un par de países más y documentales.
app.get('/api/home', requireActiveViewer, withData, (req, res) => {
  const names = new Map(getMeta().countries.map((c) => [c.code, c.name]));
  let country = geoCountry(req);
  if (chRow({ country }).length === 0) country = 'PY'; // sin canales -> PY

  const rows = [
    { key: 'pais', title: `TV en Vivo · ${names.get(country) || country}`, nav: 'tv', items: chRow({ country }) },
    { key: 'sports', title: 'Deportes', nav: 'deportes', items: chRow({ category: 'sports', prefer: country }) },
    { key: 'news', title: 'Noticias', items: chRow({ category: 'news', prefer: country }) },
  ];
  let extras = 0;
  for (const cc of EXTRA_COUNTRIES) {
    if (cc === country || extras >= 2) continue;
    const items = chRow({ country: cc });
    if (items.length) { rows.push({ key: 'c-' + cc, title: names.get(cc) || cc, items }); extras++; }
  }
  rows.push({ key: 'documentary', title: 'Documentales', nav: 'documentales', items: chRow({ category: 'documentary', prefer: country }) });

  res.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
  res.json({ country, rows: rows.filter((r) => r.items.length) });
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
  res.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
  res.json(
    queryChannels({
      country: country || undefined,
      category: category || undefined,
      search: search || undefined,
      prefer: req.query.prefer || geoCountry(req),
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
//   /api/stream?url=...&ua=...&ref=...   (cookie de sesión o token de cast)
app.get('/api/stream', streamAuth, streamHandler());

// URL absoluta y firmada para proyectar el stream a Chromecast/Smart TV.
app.get('/api/cast-url', requireActiveViewer, (req, res) => {
  const { url, ua, ref } = req.query;
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'url inválida' });
  const qs = new URLSearchParams({ url });
  if (ua) qs.set('ua', ua);
  if (ref) qs.set('ref', ref);
  qs.set('t', streamToken(url));
  res.json({ url: `${req.protocol}://${req.get('host')}/api/stream?${qs.toString()}` });
});

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
