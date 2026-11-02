// Canales CURADOS: para canales cuyo stream de iptv-org murió o no decodifica en
// el navegador, definimos acá la fuente OFICIAL que sí funciona. Hay tres modos:
//
//   1. EMBED     -> reproductor oficial embebido (iframe de YouTube live por
//                   canal; el canal no cambia aunque reinicien la transmisión).
//   2. DIRECT    -> stream HLS oficial que decodifica solo. Se sirve por nuestro
//                   proxy (resuelve CORS y aplica Referer). Sin transcodificar.
//   3. TRANSCODE -> stream que NO decodifica en el navegador (p. ej. H.264 que se
//                   une a mitad de GOP): se re-encodea en el VPS (vps-transcoder)
//                   a HLS limpio. Es lo más pesado; solo cuando no hay opción.
//
// NOTA: muchos reproductores oficiales (desdepylabs, etc.) NO se pueden embeber
// por su CSP frame-ancestors; por eso ahí vamos por DIRECT o TRANSCODE.

const TRANSCODER = 'http://194.163.138.20:8787';

// 1) EMBEBIDOS: YouTube live por canal -> youtube.com/embed/live_stream?channel=UC…
export const CURATED_EMBED = {
  'ElNueve.ar': 'https://www.youtube.com/embed/live_stream?channel=UCUT4NmGqjrVpKf2JyiS_bbA&autoplay=1',
};

// 2) DIRECTOS: HLS oficial que decodifica nativo (reemplaza el stream muerto de
//    iptv-org). { url, ref }.
export const CURATED_DIRECT = {
  'TN.ar': { url: 'https://live-01-01-tn.vodgc.net/TN_DAI_Beta/index.m3u8', ref: 'https://tn.com.ar' },
};

// 3) TRANSCODIFICADOS: no decodifican en el navegador -> re-encode en el VPS.
//    { src, ref }. (desdeparaguay / getadjacent-cloudfront: se unen mid-GOP.)
export const CURATED_TRANSCODE = {
  'Telefuturo.py': {
    src: 'https://copacotf.desdeparaguay.net/telefuturo/telefuturo_py_alta/playlist.m3u8',
    ref: 'https://www.telefuturo.com.py',
  },
  'SNT.py': {
    src: 'https://ddycmnicl95kp.cloudfront.net/live/25646ipbno2g/master.m3u8',
    ref: 'https://www.snt.com.py',
  },
  'C9N.py': {
    src: 'https://ddycmnicl95kp.cloudfront.net/live/qnxsy62odjyb/master.m3u8',
    ref: 'https://www.c9n.com.py',
  },
};

// Reproductor oficial embebido (iframe) o null.
export function curatedEmbed(type, id) {
  return type === 'channel' ? (CURATED_EMBED[id] || null) : null;
}

// Stream directo curado como objeto de stream { url, referrer } o null.
export function curatedDirect(type, id) {
  if (type !== 'channel') return null;
  const c = CURATED_DIRECT[id];
  return c ? { url: c.url, referrer: c.ref } : null;
}

// URL del transcodificador para un canal curado, o null.
export function transcodeUrl(type, id) {
  if (type !== 'channel') return null;
  const c = CURATED_TRANSCODE[id];
  if (!c) return null;
  const qs = new URLSearchParams({ src: c.src });
  if (c.ref) qs.set('ref', c.ref);
  return `${TRANSCODER}/tc.m3u8?${qs.toString()}`;
}
