// Capa de datos de iptv-org: descarga, cachea en memoria y une
// canales + streams. Fuente: https://iptv-org.github.io/api/
//
// Documentación de los datos:
//   channels.json  -> metadata del canal (id, name, country, categories, ...)
//   streams.json   -> { channel: <id|null>, url, quality, user_agent, referrer }
//   countries.json -> { code, name, flag, ... }
//   categories.json-> { id, name, description }

const API = 'https://iptv-org.github.io/api';
const LOGO = (id) => `https://raw.githubusercontent.com/iptv-org/epg/master`; // placeholder, no usado

// TTL del cache en memoria (6 horas). Pasado ese tiempo se vuelve a bajar.
const TTL_MS = 6 * 60 * 60 * 1000;

const state = {
  loadedAt: 0,
  loading: null, // Promise en curso para evitar descargas paralelas
  channels: [],
  streams: [],
  countries: [],
  categories: [],
  // índices derivados
  channelById: new Map(),
  streamsByChannel: new Map(), // id -> [stream]
  logoByChannel: new Map(), // id -> url del mejor logo
};

async function fetchJson(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`iptv-org ${path}: HTTP ${res.status}`);
  return res.json();
}

// Elige el mejor logo de un canal entre varios candidatos:
// prioriza los marcados "en uso" y, dentro de esos, la mayor resolución.
function pickBestLogo(logos) {
  if (!logos.length) return null;
  const inUse = logos.filter((l) => l.in_use);
  const pool = inUse.length ? inUse : logos;
  const area = (l) => (l.width || 0) * (l.height || 0);
  const best = pool.slice().sort((a, b) => area(b) - area(a))[0];
  return best.url;
}

async function load() {
  const [channels, streams, countries, categories, logos] = await Promise.all([
    fetchJson('channels.json'),
    fetchJson('streams.json'),
    fetchJson('countries.json'),
    fetchJson('categories.json'),
    fetchJson('logos.json'),
  ]);

  const channelById = new Map();
  for (const ch of channels) channelById.set(ch.id, ch);

  // Agrupar logos por canal y elegir el mejor de cada uno.
  const logosByChannel = new Map();
  for (const lg of logos) {
    if (!lg.channel || !lg.url) continue;
    if (!logosByChannel.has(lg.channel)) logosByChannel.set(lg.channel, []);
    logosByChannel.get(lg.channel).push(lg);
  }
  const logoByChannel = new Map();
  for (const [id, list] of logosByChannel) logoByChannel.set(id, pickBestLogo(list));

  const streamsByChannel = new Map();
  for (const st of streams) {
    if (!st.channel) continue; // streams sueltos sin canal asociado
    if (!streamsByChannel.has(st.channel)) streamsByChannel.set(st.channel, []);
    streamsByChannel.get(st.channel).push(st);
  }

  Object.assign(state, {
    loadedAt: Date.now(),
    channels,
    streams,
    countries,
    categories,
    channelById,
    streamsByChannel,
    logoByChannel,
  });
  return state;
}

// Devuelve el estado, descargando si el cache está vacío o vencido.
// Descargas concurrentes comparten la misma promesa.
export async function ensureLoaded({ force = false } = {}) {
  const fresh = state.loadedAt && Date.now() - state.loadedAt < TTL_MS;
  if (fresh && !force) return state;
  if (state.loading) return state.loading;
  state.loading = load().finally(() => {
    state.loading = null;
  });
  return state.loading;
}

// Metadata para los filtros del frontend. Solo países/categorías que
// realmente tienen al menos un canal reproducible.
export function getMeta() {
  const countriesWithChannels = new Set(state.channels.map((c) => c.country).filter(Boolean));
  const catCount = new Map();
  for (const ch of state.channels) {
    for (const cat of ch.categories || []) catCount.set(cat, (catCount.get(cat) || 0) + 1);
  }
  return {
    countries: state.countries
      .filter((c) => countriesWithChannels.has(c.code))
      .map((c) => ({ code: c.code, name: c.name, flag: c.flag }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    categories: state.categories
      .filter((c) => catCount.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, count: catCount.get(c.id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    totals: { channels: state.channels.length, streams: state.streams.length },
    loadedAt: state.loadedAt,
  };
}

// Normaliza un canal para enviarlo al frontend con su conteo de streams.
function toDTO(ch) {
  const streams = state.streamsByChannel.get(ch.id) || [];
  return {
    id: ch.id,
    name: ch.name,
    altNames: ch.alt_names || [],
    country: ch.country,
    categories: ch.categories || [],
    isNsfw: ch.is_nsfw,
    website: ch.website,
    closed: ch.closed,
    logo: state.logoByChannel.get(ch.id) || null,
    streamCount: streams.length,
  };
}

// Relevancia de un canal frente al texto buscado (menor = mejor):
//   0 nombre exacto · 1 alt exacto · 2 nombre empieza con · 3 alt empieza con ·
//   4 palabra completa en el nombre · 5 substring en el nombre · 6 resto (alt).
// Así "TN" ordena a "TN" antes que "ARTN", "CGTN", etc.
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function matchScore(c, q) {
  const name = (c.name || '').toLowerCase();
  const alts = (c.alt_names || []).map((n) => n.toLowerCase());
  if (name === q) return 0;
  if (alts.includes(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (alts.some((n) => n.startsWith(q))) return 3;
  if (new RegExp(`\\b${escapeRe(q)}\\b`).test(name)) return 4;
  if (name.includes(q)) return 5;
  return 6;
}

// Consulta/filtrado paginado de canales.
export function queryChannels({
  country,
  category,
  search,
  prefer, // país a priorizar (sale primero) cuando no se filtra por país
  onlyWithStreams = true,
  includeNsfw = false,
  page = 1,
  pageSize = 40,
} = {}) {
  const q = (search || '').trim().toLowerCase();
  let list = state.channels;

  if (!includeNsfw) list = list.filter((c) => !c.is_nsfw);
  if (country) list = list.filter((c) => c.country === country);
  if (category) list = list.filter((c) => (c.categories || []).includes(category));
  if (onlyWithStreams) list = list.filter((c) => state.streamsByChannel.has(c.id));
  if (q) {
    list = list.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      return (c.alt_names || []).some((n) => n.toLowerCase().includes(q));
    });
  }

  list = list.filter((c) => !c.closed); // ocultar canales cerrados
  // Prioriza el país del usuario (evita, p.ej., abrir "Telefuturo" de otro país).
  const pref = (prefer || '').toUpperCase();
  list = list.slice().sort((a, b) => {
    // En búsquedas, la relevancia manda: exacto/prefijo antes que substring.
    if (q) {
      const sa = matchScore(a, q);
      const sb = matchScore(b, q);
      if (sa !== sb) return sa - sb;
      // Mismo nivel: nombre más corto primero (más específico, p. ej. "TN").
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    }
    if (pref) {
      const ap = a.country === pref ? 0 : 1;
      const bp = b.country === pref ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    return a.name.localeCompare(b.name);
  });

  const total = list.length;
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize).map(toDTO);
  return { total, page, pageSize, pages: Math.ceil(total / pageSize), items };
}

// Streams de un canal, ordenados por calidad descendente.
const QUALITY_ORDER = { '2160p': 5, '1080p': 4, '720p': 3, '576p': 2, '480p': 1, '360p': 0 };
export function getChannelStreams(id) {
  const ch = state.channelById.get(id);
  if (!ch) return null;
  const streams = (state.streamsByChannel.get(id) || [])
    .slice()
    .sort((a, b) => (QUALITY_ORDER[b.quality] ?? -1) - (QUALITY_ORDER[a.quality] ?? -1))
    .map((s) => ({
      url: s.url,
      quality: s.quality || null,
      userAgent: s.user_agent || null,
      referrer: s.referrer || null,
    }));
  return { channel: toDTO(ch), streams };
}

export function getState() {
  return state;
}
