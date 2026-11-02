// Proyección a Smart TV: Google Cast (Chromecast) y AirPlay (Apple).
// Carga el SDK de Cast bajo demanda la primera vez que se necesita.

let castReady = false;
let loading = null;
const CAST_SRC = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

function initContext() {
  try {
    const g = window;
    const context = g.cast.framework.CastContext.getInstance();
    context.setOptions({
      // ID del receptor multimedia por defecto de Google (soportado por TODOS
      // los Chromecast). Si quedara indefinido, el selector no lista ningún
      // dispositivo; por eso lo fijamos explícitamente.
      receiverApplicationId: (g.chrome.cast.media && g.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID) || 'CC1AD845',
      autoJoinPolicy: g.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    castReady = true;
  } catch {
    castReady = false;
  }
}

// Carga el SDK de Chromecast. Resuelve a true si quedó disponible.
export function loadCast() {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    if (window.cast && window.chrome && window.chrome.cast) { initContext(); return resolve(castReady); }
    window.__onGCastApiAvailable = (available) => {
      if (available) initContext();
      resolve(castReady);
    };
    const s = document.createElement('script');
    s.src = CAST_SRC;
    s.async = true;
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return loading;
}

export function castSupported() {
  // Chromecast funciona en Chrome/Edge/Android (no en iOS Safari).
  return 'chrome' in window && !/iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Proyecta una URL (HLS/MP4) a un Chromecast. Abre el selector de dispositivos.
export async function castTo(url, title, poster) {
  const ok = await loadCast();
  if (!ok || !window.cast) throw new Error('Chromecast no disponible en este navegador');
  const g = window;
  const context = g.cast.framework.CastContext.getInstance();
  // Re-asegurar las opciones (receptor por defecto) antes de abrir el selector,
  // por si la inicialización quedó a medias.
  try {
    context.setOptions({
      receiverApplicationId: 'CC1AD845',
      autoJoinPolicy: g.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
  } catch { /* ya configurado */ }
  await context.requestSession();
  const session = context.getCurrentSession();
  if (!session) throw new Error('No se pudo conectar al dispositivo');
  const isHls = /\.m3u8(\?|$)/i.test(url);
  const info = new g.chrome.cast.media.MediaInfo(url, isHls ? 'application/x-mpegURL' : 'video/mp4');
  info.streamType = g.chrome.cast.media.StreamType.LIVE;
  const meta = new g.chrome.cast.media.GenericMediaMetadata();
  meta.title = title || 'SEÑAL';
  if (poster) meta.images = [new g.chrome.cast.Image(poster)];
  info.metadata = meta;
  await session.loadMedia(new g.chrome.cast.media.LoadRequest(info));
  return true;
}

// ---- AirPlay (Safari / iOS) ----
export function airplaySupported(video) {
  return Boolean(
    window.WebKitPlaybackTargetAvailabilityEvent ||
    (video && typeof video.webkitShowPlaybackTargetPicker === 'function')
  );
}

export function airplay(video) {
  if (video && typeof video.webkitShowPlaybackTargetPicker === 'function') {
    video.webkitShowPlaybackTargetPicker();
    return true;
  }
  return false;
}
