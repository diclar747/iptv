// Canales con REPRODUCTOR OFICIAL EMBEBIDO. Para algunos canales el stream de
// iptv-org falla o no decodifica en el navegador, pero el canal tiene un embed
// oficial que SÍ reproduce. En esos casos usamos el iframe oficial en vez de
// nuestro reproductor hls.js.
// NOTA: el reproductor oficial de desdepylabs.com (Telefuturo, Latele, NPY, etc.)
// NO se puede embeber: su CSP frame-ancestors solo permite sus propios dominios
// (telefuturo.com.py, latele.com.py, etc.), no live.cd.com.py. Acá van embeds
// que SÍ permitan iframing (p. ej. YouTube live: youtube.com/embed/<id>).
export const CURATED_EMBED = {
  // 'Canal.id': 'https://www.youtube.com/embed/XXXX?autoplay=1',
};

export function curatedEmbed(type, id) {
  return type === 'channel' ? (CURATED_EMBED[id] || null) : null;
}

// TRANSCODIFICACIÓN: canales cuyo stream no decodifica en el navegador se
// re-encodean en el VPS (vps-transcoder/transcoder.mjs, mismo server que la app).
// La app lo pide por su proxy a localhost:8787, así que nunca sale al navegador.
const TRANSCODER = 'http://194.163.138.20:8787';
export const CURATED_TRANSCODE = {
  'Telefuturo.py': {
    src: 'https://copacotf.desdeparaguay.net/telefuturo/telefuturo_py_alta/playlist.m3u8',
    ref: 'https://www.telefuturo.com.py',
  },
  'SNT.py': {
    src: 'https://ddycmnicl95kp.cloudfront.net/live/25646ipbno2g/master.m3u8',
    ref: 'https://www.snt.com.py',
  },
};

export function transcodeUrl(type, id) {
  if (type !== 'channel') return null;
  const c = CURATED_TRANSCODE[id];
  if (!c) return null;
  const qs = new URLSearchParams({ src: c.src });
  if (c.ref) qs.set('ref', c.ref);
  return `${TRANSCODER}/tc.m3u8?${qs.toString()}`;
}
