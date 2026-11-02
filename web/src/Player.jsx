import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { castSupported, castTo, airplaySupported, airplay, loadCast } from './cast.js';
import Icon from './ui/Icon.jsx';

// Arranca silenciado (así el navegador permite el autoplay y el canal se ve al
// instante) y el sonido se activa con el PRIMER toque. El volumen y la pantalla
// completa son los controles NATIVOS del <video> (no se duplican). Solo se suma
// el botón de proyectar a TV (cast), que el reproductor nativo no trae.
function playVideo(video) {
  try { video.muted = true; } catch { /* noop */ }
  const p = video.play();
  if (p && p.catch) p.catch(() => {});
}

export default function Player({ url, stream, title, poster, onFail }) {
  const videoRef = useRef(null);
  const unmutedRef = useRef(false);
  const hideTimer = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [casting, setCasting] = useState(false);
  const [canCast, setCanCast] = useState(false);
  const [ctrlsOn, setCtrlsOn] = useState(true);

  // Muestra el botón de cast y lo oculta tras unos segundos de inactividad.
  function poke() {
    setCtrlsOn(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setCtrlsOn(false), 3200);
  }

  // Primer toque sobre el video: activa el sonido (venía silenciado del autoplay).
  function onPlayerClick() {
    const v = videoRef.current;
    if (v && v.muted && !unmutedRef.current) { v.muted = false; unmutedRef.current = true; }
    poke();
  }

  useEffect(() => {
    setCanCast(castSupported() || airplaySupported(videoRef.current) || Boolean(window.WebKitPlaybackTargetAvailabilityEvent));
    if (castSupported()) loadCast(); // precargar el SDK para que el cast liste la TV al toque
    poke();
    return () => clearTimeout(hideTimer.current);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    setError(null);
    setLoading(true);
    unmutedRef.current = false;
    let hls;
    let destroyed = false;
    let recoverTries = 0;

    const onPlaying = () => setLoading(false);
    const onNativeError = () => { setError('No se pudo reproducir el archivo.'); setLoading(false); onFail && onFail(); };
    video.addEventListener('playing', onPlaying);

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
          if (!Hls.isSupported()) { setError('Tu navegador no soporta la reproducción de este formato.'); setLoading(false); return; }
          hls = new Hls({ enableWorker: true, backBufferLength: 30 });
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => playVideo(video));
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            // Error de decodificación/buffer: intentar recuperar re-sincronizando.
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoverTries < 2) {
              recoverTries++;
              try { hls.recoverMediaError(); return; } catch { /* sigue abajo */ }
            }
            setError(
              data.type === Hls.ErrorTypes.NETWORK_ERROR
                ? 'No se pudo cargar el stream (red/CORS o canal caído).'
                : 'Error de reproducción del stream.'
            );
            setLoading(false);
            if (onFail) onFail(); // intentar el siguiente stream del canal
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

  async function onCast(e) {
    e.stopPropagation();
    setError(null);
    setCasting(true);
    try {
      if (airplaySupported(videoRef.current) && airplay(videoRef.current)) return;
      const target = stream ? (await api.castUrl(stream)).url : url;
      await castTo(target, title, poster);
    } catch (err) {
      setError(err.message || 'No se pudo proyectar a la TV.');
    } finally {
      setCasting(false);
    }
  }

  return (
    <div className="player" onMouseMove={poke} onClick={onPlayerClick}>
      <video ref={videoRef} controls playsInline />
      {canCast && (
        <div className={`player-ctrls ${ctrlsOn ? '' : 'hidden'}`}>
          <button className="pbtn" onClick={onCast} disabled={casting}
            title="Proyectar a Smart TV" aria-label="Proyectar a Smart TV">
            {casting ? '…' : <Icon name="cast" size={20} />}
          </button>
        </div>
      )}
      {loading && !error && <div className="player-overlay">Conectando…</div>}
      {error && <div className="player-overlay error">{error}</div>}
    </div>
  );
}
