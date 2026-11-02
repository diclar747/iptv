// Cliente de la API del backend. Incluye cookies de sesión en toda llamada.
const base = '/api';

async function req(method, path, { params, body } = {}) {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')))
    : '';
  const res = await fetch(base + path + qs, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const get = (p, params) => req('GET', p, { params });
const post = (p, body) => req('POST', p, { body });
const patch = (p, body) => req('PATCH', p, { body });
const put = (p, body) => req('PUT', p, { body });
const del = (p, params) => req('DELETE', p, { params });

export const api = {
  // Catálogo / visor
  home: () => get('/home'),
  geo: () => get('/geo'),
  meta: () => get('/meta'),
  channels: (params) => get('/channels', params),
  streams: (id) => get(`/channels/${encodeURIComponent(id)}/streams`),
  checkChannel: (id) => get(`/channels/${encodeURIComponent(id)}/check`),
  // URL absoluta y firmada para proyectar a Chromecast/Smart TV.
  castUrl: (stream) => get('/cast-url', { url: stream.url, ua: stream.userAgent, ref: stream.referrer }),

  // Auth
  me: () => get('/auth/me'),
  login: (username, password) => post('/auth/login', { username, password }),
  register: (username, password, ref) => post('/auth/register', { username, password, ref }),
  logout: () => post('/auth/logout', {}),

  // Perfil (marca/contacto) y precios de reventa
  profile: () => get('/profile'),
  updateProfile: (b) => patch('/profile', b),
  resellerPrices: () => get('/reseller/prices'),
  setResellerPrice: (packageId, price) => patch('/reseller/prices', { packageId, price }),

  // Control de conexiones
  watchStart: (channelId) => post('/watch/start', { channelId }),
  watchBeat: (sessionId) => post('/watch/heartbeat', { sessionId }),
  watchStop: (sessionId) => post('/watch/stop', { sessionId }),

  // Catálogo de películas y series (metadatos TheTVDB + dominio público)
  catalogHome: () => get('/catalog/home'),
  catalogMeta: () => get('/catalog/meta'),
  catalogSearch: (q) => get('/catalog/search', { q }),
  movies: (params) => get('/catalog/movies', params),
  movie: (id) => get(`/catalog/movies/${id}`),
  series: (params) => get('/catalog/series', params),
  serie: (id) => get(`/catalog/series/${id}`),
  favorites: () => get('/catalog/favorites'),
  addFavorite: (type, id) => post('/catalog/favorites', { type, id }),
  removeFavorite: (type, id) => del('/catalog/favorites', { type, id }),
  getProgress: () => get('/catalog/progress'),
  setProgress: (b) => put('/catalog/progress', b),

  // Admin: gestión de catálogo (películas y series)
  catStatus: () => get('/admin/catalog/status'),
  catTest: () => post('/admin/catalog/test', {}),
  catImport: (b) => post('/admin/catalog/import', b),
  catImportArchive: (b) => post('/admin/catalog/import-archive', b || {}),
  catStop: () => post('/admin/catalog/stop', {}),
  catReset: () => post('/admin/catalog/reset', {}),
  catSync: () => post('/admin/catalog/sync', {}),
  catJobs: () => get('/admin/catalog/jobs'),
  catHide: (type, id) => post(`/admin/catalog/${type}/${id}/hide`, {}),
  catSource: (type, id, b) => post(`/admin/catalog/${type}/${id}/source`, b),

  // Paquetes (compartido)
  packages: () => get('/packages'),

  // Admin
  adminStats: () => get('/admin/stats'),
  resellers: () => get('/admin/resellers'),
  createReseller: (b) => post('/admin/resellers', b),
  setResellerStatus: (id, status) => patch(`/admin/resellers/${id}`, { status }),
  addCredits: (id, amount, note) => post(`/admin/resellers/${id}/credits`, { amount, note }),
  createPackage: (b) => post('/admin/packages', b),
  setPackageActive: (id, active) => patch(`/admin/packages/${id}`, { active }),

  // Reseller
  resellerMe: () => get('/reseller/me'),
  clients: () => get('/reseller/clients'),
  createClient: (b) => post('/reseller/clients', b),
  renewClient: (id, packageId) => post(`/reseller/clients/${id}/renew`, { packageId }),
  setClientStatus: (id, status) => patch(`/reseller/clients/${id}`, { status }),
  transactions: () => get('/reseller/transactions'),

  // Sub-vendedores (un vendedor crea y financia a otros vendedores)
  subresellers: () => get('/reseller/subresellers'),
  createSubreseller: (b) => post('/reseller/subresellers', b),
  transferToSub: (id, amount) => post(`/reseller/subresellers/${id}/credits`, { amount }),
};

// URL del proxy de reproducción para un stream (misma cookie de sesión aplica).
export function proxyUrl(stream) {
  if (!stream) return null;
  const qs = new URLSearchParams({ url: stream.url });
  if (stream.userAgent) qs.set('ua', stream.userAgent);
  if (stream.referrer) qs.set('ref', stream.referrer);
  return `/api/stream?${qs.toString()}`;
}
