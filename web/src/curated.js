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
