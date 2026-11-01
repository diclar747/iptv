import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { castSupported, castTo, airplaySupported, airplay } from './cast.js';
import Icon from './ui/Icon.jsx';

// Reproductor HLS/MP4. hls.js se carga BAJO DEMANDA (solo al reproducir HLS en
// navegadores sin soporte nativo), para no engordar el bundle inicial.
// Incluye botón de pantalla completa y de proyectar a Smart TV (Chromecast/AirPlay).
export default function Player({ url, stream, title, poster, autoFullscreen = false }) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [casting, setCasting] = useState(false);
  const [canCast, setCanCast] = useState(false);

  useEffect(() => {
    setCanCast(castSupported() || airplaySupported(videoRef.current) || Boolean(window.WebKitPlaybackTargetAvailabilityEvent));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    setError(null);
    setLoading(true);
    let hls;
    let destroyed = false;

    const onPlaying = () => {
      setLoading(false);
      // Pantalla completa automática solo en móvil (best-effort; puede requerir gesto).
      if (autoFullscreen && window.matchMedia('(max-width: 900px)').matches) tryFullscreen();
    };
    const onNativeError = () => { setError('No se pudo reproducir el archivo.'); setLoading(false); };
    video.addEventListener('playing', onPlaying);

    // ¿El stream real (param ?url=) es HLS (.m3u8) o archivo directo (MP4)?
    let realUrl = url;
    try { realUrl = new URLSearchParams(url.split('?')[1]).get('url') || url; } catch { /* noop */ }
    const isHls = /\.m3u8(\?|$)/i.test(realUrl);

    if (!isHls) {
      video.src = url;
      video.play().catch(() => {});
      video.addEventListener('error', onNativeError);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url; // Safari / soporte nativo
      video.play().catch(() => {});
    } else {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (destroyed) return;
          if (!Hls.isSupported()) {
            setError('Tu navegador no soporta la reproducción de este formato.');
            setLoading(false);
            return;
          }
          hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              setError(
                data.type === Hls.ErrorTypes.NETWORK_ERROR
                  ? 'No se pudo cargar el stream (red/CORS o canal caído).'
                  : 'Error de reproducción del stream.'
              );
              setLoading(false);
            }
          });
        })
        .catch(() => { setError('No se pudo cargar el reproductor.'); setLoading(false); });
    }

    return () => {
      destroyed = true;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onNativeError);
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [url]);

  function tryFullscreen() {
    const el = wrapRef.current;
    const video = videoRef.current;
    try {
      if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (video && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch { /* bloqueado por el navegador */ }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); return; }
    tryFullscreen();
  }

  async function onCast() {
    setError(null);
    setCasting(true);
    try {
      // Apple: AirPlay nativo sobre el <video>.
      if (airplaySupported(videoRef.current) && airplay(videoRef.current)) return;
      // Chromecast: URL absoluta firmada (el dispositivo no tiene la cookie).
      const target = stream ? (await api.castUrl(stream)).url : url;
      await castTo(target, title, poster);
    } catch (e) {
      setError(e.message || 'No se pudo proyectar a la TV.');
    } finally {
      setCasting(false);
    }
  }

  return (
    <div className="player" ref={wrapRef}>
      <video ref={videoRef} controls playsInline />
      <div className="player-ctrls">
        {canCast && (
          <button className="pbtn" onClick={onCast} disabled={casting}
            title="Proyectar a Smart TV" aria-label="Proyectar a Smart TV">
            {casting ? '…' : <Icon name="cast" size={20} />}
          </button>
        )}
        <button className="pbtn" onClick={toggleFullscreen}
          title="Pantalla completa" aria-label="Pantalla completa"><Icon name="fullscreen" size={20} /></button>
      </div>
      {loading && !error && <div className="player-overlay">Conectando…</div>}
      {error && <div className="player-overlay error">{error}</div>}
    </div>
  );
}
