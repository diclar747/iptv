import './env.js'; // carga .env antes que nada (debe ir primero)
import { exec } from 'node:child_process';
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
import { attachUser, requireAuth, requireActiveViewer } from './auth.js';
import accountsRouter, { ensureSeed } from './accounts.js';
import catalogRouter from './catalog.js';
import catalogAdminRouter from './catalog-admin.js';
import manualChannelsRouter, { manualCards, manualStreams, isManualId, ensureManualSeed } from './manualChannels.js';
import { ensureVodSeed } from './vod.js';
import { retireMetadataOnlyMovies } from './catalog/cleanup.js';

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

// Versión disponible del APK (para el auto-update de la app nativa). Público,
// definido ANTES de los routers que exigen sesión. Subir versionCode/versionName
// en cada release nueva del APK.
app.get('/api/app/version', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ versionCode: 16, versionName: '1.15', url: 'https://live.cd.com.py/cinetv.apk' });
});

// Rutas de cuentas/negocio (login, admin, reseller, paquetes, watch).
app.use('/api', accountsRouter);
// Catálogo de películas y series (metadatos TheTVDB) + panel admin.
app.use('/api', catalogRouter);
app.use('/api', catalogAdminRouter);
// Canales manuales cargados por el admin (CRUD admin).
app.use('/api', manualChannelsRouter);

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

// Chequeo: ¿el servidor tiene ffmpeg? (para decidir si se puede transcodificar
// los canales que no decodifican en el navegador).
app.get('/api/ffmpeg-check', requireAuth, (req, res) => {
  exec('ffmpeg -version', { timeout: 6000 }, (err, stdout) => {
    if (err) return res.json({ available: false, error: (err.message || '').slice(0, 200) });
    res.json({ available: true, version: (String(stdout).split('\n')[0] || '').slice(0, 140) });
  });
});

// Devuelve el país detectado por IP (para que el frontend ajuste la vista TV).
app.get('/api/geo', requireActiveViewer, (req, res) => {
  res.set('Cache-Control', 'private, max-age=600');
  res.json({ country: geoCountry(req) });
});

// Inicio en UN solo pedido: según el país del visitante (por IP), sus canales
// van primero; luego deportes, noticias, un par de países más y documentales.
app.get('/api/home', requireActiveViewer, withData, async (req, res) => {
  const names = new Map(getMeta().countries.map((c) => [c.code, c.name]));
  let country = geoCountry(req);
  if (chRow({ country }).length === 0) country = 'PY'; // sin canales -> PY

  // Canales manuales del admin: los del país del visitante van a su fila; los
  // deportivos (Tigo Sport, etc.) van primero en Deportes.
  const [manPais, manSports] = await Promise.all([
    manualCards({ country }).catch(() => []),
    manualCards({ category: 'sports' }).catch(() => []),
  ]);

  const rows = [
    { key: 'pais', title: `TV en Vivo · ${names.get(country) || country}`, nav: 'tv', items: [...manPais, ...chRow({ country })] },
    { key: 'sports', title: 'Deportes', nav: 'deportes', items: [...manSports, ...chRow({ category: 'sports', prefer: country })] },
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
app.get('/api/channels', requireActiveViewer, withData, async (req, res) => {
  const {
    country,
    category,
    search,
    page = '1',
    pageSize = '40',
    includeNsfw = 'false',
    onlyWithStreams = 'true',
  } = req.query;
  const pageN = Math.max(1, parseInt(page, 10) || 1);
  const result = queryChannels({
    country: country || undefined,
    category: category || undefined,
    search: search || undefined,
    prefer: req.query.prefer || geoCountry(req),
    page: pageN,
    pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 40)),
    includeNsfw: includeNsfw === 'true',
    onlyWithStreams: onlyWithStreams !== 'false',
  });

  // Canales manuales: se anteponen en la primera página cuando coinciden con el
  // filtro de país/categoría (y con el texto buscado, si lo hay).
  if (pageN === 1 && (country || category)) {
    let man = await manualCards({ country: country || undefined, category: category || undefined }).catch(() => []);
    const q = (search || '').trim().toLowerCase();
    if (q) man = man.filter((c) => c.name.toLowerCase().includes(q));
    if (man.length) {
      result.items = [...man, ...result.items];
      result.total += man.length;
    }
  }

  res.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
  res.json(result);
});

// Streams de un canal concreto.
app.get('/api/channels/:id/streams', requireActiveViewer, withData, async (req, res) => {
  try {
    const data = isManualId(req.params.id)
      ? await manualStreams(req.params.id)
      : getChannelStreams(req.params.id);
    if (!data) return res.status(404).json({ error: 'Canal no encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo obtener el canal', detail: err.message });
  }
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
  // El sitio se sirve por HTTPS (detrás de Cloudflare). req.protocol a veces
  // queda en 'http' aunque el borde sea https; si la URL de cast sale en http,
  // el Chromecast recibe un redirect 308 que NO sigue y no reproduce nada.
  // Forzamos https salvo en localhost (desarrollo).
  const host = req.get('host') || '';
  const proto = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host) ? req.protocol : 'https';
  res.json({ url: `${proto}://${host}/api/stream?${qs.toString()}` });
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
    await ensureVodSeed(); // contenido de dominio público (catálogo base reproducible)
    await retireMetadataOnlyMovies();
    await ensureManualSeed(); // canales manuales conocidos (p. ej. TVS por su Twitch)
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
    // Sincronización incremental del catálogo (solo si hay API Key de TheTVDB).

  });
}

start();
