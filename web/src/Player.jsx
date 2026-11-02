import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { castSupported, castTo, airplaySupported, airplay, loadCast } from './cast.js';
import Icon from './ui/Icon.jsx';

// Arranca SIEMPRE silenciado: así el navegador permite el autoplay y el canal
// se ve al instante (nunca queda negro/pausado). El usuario activa el sonido
// con un toque (botón "Activar sonido").
function playVideo(video) {
  try { video.muted = true; } catch { /* noop */ }
  const p = video.play();
  if (p && p.catch) p.catch(() => {});
}

// Reproductor HLS/MP4. hls.js se carga BAJO DEMANDA (solo al reproducir HLS en
// navegadores sin soporte nativo), para no engordar el bundle inicial.
// Incluye botón de pantalla completa y de proyectar a Smart TV (Chromecast/AirPlay).
export default function Player({ url, stream, title, poster, autoFullscreen = false, onFail }) {
  const videoRef = useRef(null);
  const wrapRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [casting, setCasting] = useState(false);
  const [canCast, setCanCast] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [ctrlsOn, setCtrlsOn] = useState(true);
  const hideTimer = useRef(null);

  // Muestra los controles y los oculta tras unos segundos de inactividad.
  function poke() {
    setCtrlsOn(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setCtrlsOn(false), 3200);
  }

  useEffect(() => {
    setCanCast(castSupported() || airplaySupported(videoRef.current) || Boolean(window.WebKitPlaybackTargetAvailabilityEvent));
    // Precargar el SDK de Chromecast para que el descubrimiento esté listo al tocar.
    if (castSupported()) loadCast();
  }, []);

  // Oculta los controles al inicio tras unos segundos, y al salir de pantalla
  // completa vuelve la orientación normal del teléfono.
  useEffect(() => {
    poke();
    const onFs = () => {
      if (!document.fullscreenElement) {
        try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch { /* noop */ }
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => { clearTimeout(hideTimer.current); document.removeEventListener('fullscreenchange', onFs); };
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
    const onNativeError = () => { setError('No se pudo reproducir el archivo.'); setLoading(false); onFail && onFail(); };
    const onVol = () => setIsMuted(video.muted);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('volumechange', onVol);

    // ¿El stream real (param ?url=) es HLS (.m3u8) o archivo directo (MP4)?
    let realUrl = url;
    try { realUrl = new URLSearchParams(url.split('?')[1]).get('url') || url; } catch { /* noop */ }
    const isHls = /\.m3u8(\?|$)/i.test(realUrl);

    if (!isHls) {
      video.src = url;
      playVideo(video);
      video.addEventListener('error', onNativeError);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url; // Safari / soporte nativo
      playVideo(video);
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
          hls.on(Hls.Events.MANIFEST_PARSED, () => playVideo(video));
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              setError(
                data.type === Hls.ErrorTypes.NETWORK_ERROR
                  ? 'No se pudo cargar el stream (red/CORS o canal caído).'
                  : 'Error de reproducción del stream.'
              );
              setLoading(false);
              if (onFail) onFail(); // intentar el siguiente stream del canal
            }
          });
        })
        .catch(() => { setError('No se pudo cargar el reproductor.'); setLoading(false); });
    }

    return () => {
      destroyed = true;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('volumechange', onVol);
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
      if (el && el.requestFullscreen) el.requestFullscreen().then(lockLandscape).catch(() => {});
      else if (video && video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iOS gira solo
    } catch { /* bloqueado por el navegador */ }
  }

  // En el teléfono, girar a horizontal para que el video ocupe toda la pantalla.
  function lockLandscape() {
    try {
      const o = screen.orientation;
      if (o && o.lock) o.lock('landscape').catch(() => {});
    } catch { /* no soportado */ }
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
    <div className="player" ref={wrapRef} onMouseMove={poke} onTouchStart={poke} onClick={poke}>
      <video ref={videoRef} controls playsInline />
      <div className={`player-ctrls ${ctrlsOn ? '' : 'hidden'}`}>
        {canCast && (
          <button className="pbtn" onClick={onCast} disabled={casting}
            title="Proyectar a Smart TV" aria-label="Proyectar a Smart TV">
            {casting ? '…' : <Icon name="cast" size={20} />}
          </button>
        )}
        <button className="pbtn" onClick={toggleFullscreen}
          title="Pantalla completa" aria-label="Pantalla completa"><Icon name="fullscreen" size={20} /></button>
      </div>
      {isMuted && !error && (
        <button className="unmute-btn" onClick={() => { const v = videoRef.current; if (v) { v.muted = false; setIsMuted(false); } }}>
          🔊 Tocá para activar el sonido
        </button>
      )}
      {loading && !error && <div className="player-overlay">Conectando…</div>}
      {error && <div className="player-overlay error">{error}</div>}
    </div>
  );
}
