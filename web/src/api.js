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
  resolveLibrary:items=>post('/catalog/resolve',{items}),
  mediaDevices:()=>get('/admin/media-devices'),
  pairMediaDevice:()=>post('/admin/media-devices/pair',{}),
  revokeMediaDevice:id=>del('/admin/media-devices/'+encodeURIComponent(id)),
  createMediaTransfer:body=>post('/admin/media-transfers',body),
  mediaTransfer:id=>get('/admin/media-transfers/'+encodeURIComponent(id)),
  finishMediaTransfer:id=>post('/admin/media-transfers/'+encodeURIComponent(id)+'/finish',{}),
  cancelMediaTransfer:id=>post('/admin/media-transfers/'+encodeURIComponent(id)+'/cancel',{}),
  retryMediaTransfer:id=>post('/admin/media-transfers/'+encodeURIComponent(id)+'/retry',{}),
  uploadMediaChunk:async(id,offset,bytes,signal)=>{
    const sum=await crypto.subtle.digest('SHA-256',bytes);
    const sha=[...new Uint8Array(sum)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const r=await fetch('/api/admin/media-transfers/'+encodeURIComponent(id)+'/chunk',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/octet-stream','X-Upload-Offset':String(offset),'X-Chunk-SHA256':sha},body:bytes,signal});
    const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'No se pudo enviar el fragmento'),{status:r.status});return data;
  },
  adminChannels: p => get('/admin/channels',p),
  adminChannel: id => get('/admin/channels/'+encodeURIComponent(id)),
  editAdminChannel: (id,b) => patch('/admin/channels/'+encodeURIComponent(id),b),
  deleteAdminChannel: id => del('/admin/channels/'+encodeURIComponent(id)),
  restoreAdminChannel: id => post('/admin/channels/'+encodeURIComponent(id)+'/restore',{}),
  resetAdminChannel: id => post('/admin/channels/'+encodeURIComponent(id)+'/reset',{}),
  verifyAdminChannel: id => post('/admin/channels/'+encodeURIComponent(id)+'/verify',{}),
  verifyAdminChannels: b => post('/admin/channels/verify',b),
  stopAdminChannelChecks: () => post('/admin/channels/stop',{}),
  adminMovies: p => get('/admin/movies',p),
  adminMovie: id => get('/admin/movies/'+id),
  saveAdminMovie: (id,b) => id ? put('/admin/movies/'+id,b) : post('/admin/movies',b),
  stateAdminMovie: (id,b) => patch('/admin/movies/'+id+'/state',b),
  verifyAdminMovie: id => post('/admin/movies/'+id+'/verify',{}),
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
  // Datos de pago del proveedor al que le pago (admin para un distribuidor,
  // distribuidor para un cliente).
  billingProvider: () => get('/billing/provider'),

  // Solicitudes de saldo / de alta como distribuidor
  createCreditRequest: (b) => post('/credit-requests', b),
  myCreditRequests: () => get('/credit-requests/mine'),
  resellerCreditRequests: (status) => get('/reseller/credit-requests', { status }),
  adminCreditRequests: (status) => get('/admin/credit-requests', { status }),
  approveCreditRequest: (id) => post(`/credit-requests/${id}/approve`, {}),
  rejectCreditRequest: (id) => post(`/credit-requests/${id}/reject`, {}),

  // Control de conexiones
  watchStart: (channelId) => post('/watch/start', { channelId }),
  watchBeat: (sessionId) => post('/watch/heartbeat', { sessionId }),
  watchStop: (sessionId) => post('/watch/stop', { sessionId }),

  // Catálogo de películas y series (metadatos TheTVDB + dominio público)
  youtubeImports: () => get('/admin/youtube'),
  youtubePreview: (url) => post('/admin/youtube/preview',{url}),
  youtubeImport: (body) => post('/admin/youtube',body),
  cancelYoutubeImport: (id) => post(`/admin/youtube/${id}/cancel`,{}),
  mediaCategories: () => get('/admin/media-categories'),
  createMediaCategory: (name) => post('/admin/media-categories',{name}),
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

  // Me gusta y comentarios (compartidos entre usuarios)
  reactions: (type, id) => get('/catalog/reactions', { type, id }),
  toggleLike: (type, id, value=1) => post('/catalog/likes', { type, id, value }),
  reactComment: (id, emoji) => post(`/catalog/comments/${id}/reaction`, {emoji}),
  radios: (params) => get('/radios', params),
  radioPlayback: (id) => get(`/radios/${encodeURIComponent(id)}/playback`),
  radioStatuses: (ids) => get('/radios/status',{ids}),
  channelStatuses: (ids) => get('/channels/status',{ids}),
  addComment: (type, id, body) => post('/catalog/comments', { type, id, body }),
  deleteComment: (id) => del(`/catalog/comments/${id}`),

  // Admin: gestión de catálogo (películas y series)
  catStatus: () => get('/admin/catalog/status'),
  catTest: () => post('/admin/catalog/test', {}),
  catImport: (b) => post('/admin/catalog/import', b),
  catImportArchive: (b) => post('/admin/catalog/import-archive', b || {}),
  catImportTmdb: (b) => post('/admin/catalog/import-tmdb', b || {}),
  catImportTrailers: (b) => post('/admin/catalog/import-trailers', b || {}),
  catTmdbTest: () => post('/admin/catalog/tmdb-test', {}),
  catCleanArchive: () => post('/admin/catalog/clean-archive', {}),
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
  updatePackage: (id, b) => patch(`/admin/packages/${id}`, b),

  // Canales manuales (Tigo Sport y otros que iptv-org no trae)
  manualChannels: () => get('/admin/manual-channels'),
  createManualChannel: (b) => post('/admin/manual-channels', b),
  updateManualChannel: (id, b) => patch(`/admin/manual-channels/${id}`, b),
  deleteManualChannel: (id) => del(`/admin/manual-channels/${id}`),

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
