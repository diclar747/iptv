// Pluto TV (LATAM): servicio FAST gratuito. Trae el lineup de canales en vivo
// (incluidos los 24/7 de cine) y arma la URL HLS del momento. Los canales se
// inyectan en los listados y se reproducen por el mismo proxy.
//
// NOTA: Pluto geolocaliza por IP. Si el servidor está fuera de LATAM, puede
// servir otra región o bloquear. Todo falla en silencio (devuelve vacío) para
// no romper el resto del inicio.

import { randomUUID } from 'node:crypto';

const BOOT = 'https://boot.pluto.tv/v4/start';
const GUIDE = 'https://service-channels.clusters.pluto.tv/v2/guide/channels';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const REF = 'https://pluto.tv/';
const PREFIX = 'pluto:';
const CLIENT_ID = randomUUID(); // estable mientras viva el proceso

const SESSION_TTL = 25 * 60 * 1000; // el JWT dura ~horas; refrescamos seguido
const CHANNELS_TTL = 60 * 60 * 1000;

let session = null; // { token, stitcherParams, stitcher, exp }
let channels = null; // { list, byId, exp }

export const isPlutoId = (id) => typeof id === 'string' && id.startsWith(PREFIX);

async function getSession() {
  if (session && session.exp > Date.now()) return session;
  const qs = new URLSearchParams({
    appName: 'web', appVersion: '9.9.0', deviceVersion: '120.0.0', deviceModel: 'web',
    deviceMake: 'chrome', deviceType: 'web', clientID: CLIENT_ID, clientModelNumber: '1.0.0',
    serverSideAds: 'false',
  });
  const r = await fetch(`${BOOT}?${qs}`, { headers: { 'User-Agent': UA, Referer: REF } });
  if (!r.ok) throw new Error('pluto boot HTTP ' + r.status);
  const j = await r.json();
  session = {
    token: j.sessionToken,
    stitcherParams: j.stitcherParams || '',
    stitcher: (j.servers && j.servers.stitcher) || '',
    exp: Date.now() + SESSION_TTL,
  };
  return session;
}

// Mapea la categoría de Pluto a las nuestras (para filtros/orden).
function mapCategory(name, plutoCat) {
  const s = ((name || '') + ' ' + (plutoCat || '')).toLowerCase();
  if (/cine|movie|pelicul|film/.test(s)) return 'movies';
  if (/noticia|news/.test(s)) return 'news';
  if (/deporte|sport/.test(s)) return 'sports';
  if (/infantil|kids|niñ/.test(s)) return 'kids';
  if (/music|música/.test(s)) return 'music';
  if (/document/.test(s)) return 'documentary';
  return 'entertainment';
}

function logoOf(c) {
  const imgs = c.images || [];
  const color = imgs.find((i) => /color/i.test(i.type || '') || /colorLogo/i.test(i.url || ''));
  return (color && color.url) || (imgs[0] && imgs[0].url) || c.colorLogoPNG || c.logo || null;
}

// Card con la MISMA forma que toDTO() de iptvSource.
function toCard(c) {
  const id = c.id || c._id;
  return {
    id: PREFIX + id,
    name: c.name,
    altNames: [],
    country: 'XX', // LATAM, sin país único
    categories: [mapCategory(c.name, c.category)],
    isNsfw: false,
    website: null,
    closed: false,
    logo: logoOf(c),
    streamCount: 1,
    pluto: true,
  };
}

// Lineup de Pluto (cacheado). Devuelve [] si falla (no rompe el inicio).
export async function plutoCards() {
  if (channels && channels.exp > Date.now()) return channels.list;
  try {
    const s = await getSession();
    const r = await fetch(`${GUIDE}?offset=0&limit=1000&sort=number:asc`, {
      headers: { 'User-Agent': UA, Referer: REF, Authorization: 'Bearer ' + s.token },
    });
    if (!r.ok) throw new Error('pluto guide HTTP ' + r.status);
    const j = await r.json();
    const arr = Array.isArray(j) ? j : j.data || j.channels || [];
    const list = arr.filter((c) => c.id || c._id).map(toCard);
    const byId = new Map(list.map((c) => [c.id, c]));
    channels = { list, byId, exp: Date.now() + CHANNELS_TTL };
    return list;
  } catch (e) {
    console.error('[pluto] lineup:', e.message);
    channels = { list: [], byId: new Map(), exp: Date.now() + 5 * 60 * 1000 }; // backoff corto
    return [];
  }
}

// Solo los canales de cine (24/7 de películas).
export async function plutoCineCards() {
  return (await plutoCards()).filter((c) => c.categories.includes('movies'));
}

// Streams de un canal de Pluto ("pluto:<id>"): arma la URL HLS del momento.
export async function plutoStreams(publicId) {
  const chId = publicId.slice(PREFIX.length);
  const s = await getSession();
  if (!s.stitcher || !s.token) return null;
  const url = `${s.stitcher}/v2/stitch/hls/channel/${chId}/master.m3u8?${s.stitcherParams}&jwt=${s.token}`;
  const card =
    (channels && channels.byId.get(publicId)) ||
    { id: publicId, name: 'Pluto TV', altNames: [], country: 'XX', categories: ['movies'], logo: null, streamCount: 1, pluto: true };
  return { channel: card, streams: [{ url, quality: null, userAgent: UA, referrer: REF }] };
}
