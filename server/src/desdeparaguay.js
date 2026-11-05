const cache = new Map();
export function isDesdeParaguay(value) {
  try { const u = new URL(value); return /^(www\.)?desdeparaguay\.com$/.test(u.hostname) && /^\/[a-z0-9-]+\/?$/i.test(u.pathname); }
  catch { return false; }
}
export function parseDesdeStream(html) {
  const candidates = [...html.matchAll(/dsdpyStream(?:0|1|0_alta|0_med)\s*=\s*"([^"\r\n]+)"/g)].map(m => m[1].replaceAll('\\/', '/').replaceAll('&amp;', '&'));
  const stream = candidates.find(u => /^https?:\/\//.test(u) && /\.m3u8(?:\?|$)/i.test(u));
  if (!stream) throw Error('Esta emisora no publica una señal disponible');
  return stream;
}
export async function resolveDesdeStream(page, request = fetch) {
  if (!isDesdeParaguay(page)) return page;
  const cached = cache.get(page);
  if (cached && cached.until > Date.now()) return cached.url;
  const fresh = new URL(page);
  fresh.searchParams.set('live', String(Date.now()));
  const response = await request(fresh.href, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 LiveTV/1.20', 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw Error(`La emisora respondió HTTP ${response.status}`);
  if (response.redirected && new URL(response.url).pathname.replace(/\/$/,'') !== new URL(page).pathname.replace(/\/$/,'')) throw Error('La página de esta emisora ya no está disponible');
  const url = parseDesdeStream(await response.text());
  // No interpretar parámetros privados del proveedor como una fecha de
  // caducidad documentada. Se renueva pronto, sin persistir sus credenciales.
  const until = Date.now() + 30000;
  if (cache.size >= 300) cache.delete(cache.keys().next().value);
  cache.set(page, { url, until });
  return url;
}
