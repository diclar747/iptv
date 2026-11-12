import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { castSupported, castTo, airplaySupported, airplay, loadCast } from './cast.js';
import Icon from './ui/Icon.jsx';
import {getAppSettings} from './appSettings.js';

// Arranca silenciado (así el navegador permite el autoplay y el canal se ve al
// instante) y el sonido se activa con el PRIMER toque. El volumen y la pantalla
// completa son los controles NATIVOS del <video> (no se duplican). Solo se suma
// el botón de proyectar a TV (cast), que el reproductor nativo no trae.
function playVideo(video) {
  try { video.muted = true; } catch { /* noop */ }
  const p = video.play();
  if (p && p.catch) p.catch(() => {});
}

export default function Player({ url, stream, title, poster, onFail, isLive = false }) {
  const videoRef = useRef(null);
  const unmutedRef = useRef(false);
  const hideTimer = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [retry, setRetry] = useState(0);
  const resumeAt = useRef(null);
  const [casting, setCasting] = useState(false);
  const [canCast, setCanCast] = useState(false);
  const [ctrlsOn, setCtrlsOn] = useState(true);
  useEffect(()=>{
    const video=videoRef.current;if(!video)return;
    let lock=null,disposed=false,requesting=false;
    async function screen(){
      const prefs=getAppSettings();
      if(document.hidden&&!prefs.background)video.pause();
      if(disposed||!prefs.keepScreenOn||document.hidden||video.paused){await lock?.release().catch(()=>{});lock=null;return;}
      if(!lock&&!requesting&&navigator.wakeLock){requesting=true;try{const next=await navigator.wakeLock.request('screen');if(disposed||document.hidden||video.paused||!getAppSettings().keepScreenOn)await next.release();else{lock=next;next.addEventListener('release',()=>{if(lock===next)lock=null;});}}catch{}finally{requesting=false;}}
    }
    video.addEventListener('playing',screen);video.addEventListener('pause',screen);video.addEventListener('ended',screen);document.addEventListener('visibilitychange',screen);window.addEventListener('livetv-settings',screen);
    if('mediaSession' in navigator){
      if(typeof MediaMetadata!=='undefined')navigator.mediaSession.metadata=new MediaMetadata({title:title||'LiveTV',artist:'LiveTV'});
      for(const [action,handler] of Object.entries({play:()=>video.play().catch(()=>{}),pause:()=>video.pause(),stop:()=>video.pause()}))try{navigator.mediaSession.setActionHandler(action,handler);}catch{}
    }
    return()=>{disposed=true;lock?.release().catch(()=>{});video.removeEventListener('playing',screen);video.removeEventListener('pause',screen);video.removeEventListener('ended',screen);document.removeEventListener('visibilitychange',screen);window.removeEventListener('livetv-settings',screen);if('mediaSession' in navigator){for(const action of ['play','pause','stop'])try{navigator.mediaSession.setActionHandler(action,null);}catch{}navigator.mediaSession.metadata=null;}};
  },[url,title]);

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
    setWaiting(false);
    unmutedRef.current = false;
    let hls;
    let transportPlayer;
    const probeController = new AbortController();
    let destroyed = false;
    let recoverTries = 0;
    let waitTimer;
    let stalledOnce = false;
    let hasPlayed = false;
    let failed = false;
    const startupTimer = setTimeout(() => playbackFailed('El video está tardando demasiado en responder.'), 25000);

    const clearWait = () => {
      clearTimeout(waitTimer);
      waitTimer = undefined;
      setWaiting(false);
    };
    const onPlaying = () => {
      clearTimeout(startupTimer);
      hasPlayed = true;
      stalledOnce = false;
      if (failed) { failed = false; setError(null); }
      clearWait();
      setLoading(false);
    };
    const playbackFailed = (message) => {
      if (destroyed || failed) return;
      failed = true;
      clearTimeout(startupTimer);
      clearWait();
      setError(message);
      setLoading(false);
      onFail?.();
    };
    const onCanPlay = () => {
      clearTimeout(startupTimer);
      if (video.paused) setLoading(false);
    };
    const onWaiting = () => {
      if (!hasPlayed || video.paused || waitTimer) return;
      waitTimer = setTimeout(() => {
        if (video.paused || video.readyState >= 3) { clearWait(); return; }
        setWaiting(true);
        waitTimer = setTimeout(() => {
          waitTimer = undefined;
          if (!isLive || video.paused || video.readyState >= 3) return;
          if (stalledOnce || (!hls && !transportPlayer)) {
            playbackFailed('La señal dejó de responder.');
            return;
          }
          stalledOnce = true;
          if (hls) {
            hls.stopLoad();
            hls.startLoad();
            const livePosition = hls.liveSyncPosition;
            if (Number.isFinite(livePosition)) video.currentTime = livePosition;
          } else {
            transportPlayer.unload();
            transportPlayer.load();
            video.play().catch(() => {});
          }
          onWaiting();
        }, 8500);
      }, 1500);
    };
    const restorePosition = () => {
      const saved = resumeAt.current;
      resumeAt.current = null;
      if (!isLive && saved?.url === url && Number.isFinite(saved.time) && saved.time < video.duration) {
        video.currentTime = saved.time;
      }
    };

    async function playTransportStream() {
      const { default: mpegts } = await import('mpegts.js');
      if (destroyed) return;
      if (!mpegts.getFeatureList().mseLivePlayback) {
        playbackFailed('Tu navegador no admite esta señal en vivo.');
        return;
      }
      video.removeAttribute('src');
      video.load();
      transportPlayer = mpegts.createPlayer({ type: 'mpegts', isLive: true, url }, {
        autoCleanupSourceBuffer: true,
      });
      transportPlayer.on(mpegts.Events.ERROR, () => playbackFailed('No se pudo reproducir la señal en vivo.'));
      transportPlayer.attachMediaElement(video);
      transportPlayer.load();
      playVideo(video);
    }

    const onNativeError = async () => {
      try {
        if (video.error?.code === 4 && stream && url.startsWith('/api/stream?')) {
          const response = await fetch(url, {
            signal: AbortSignal.any([probeController.signal, AbortSignal.timeout(12000)]),
          });
          const isTransportStream = response.ok && /^video\/mp2t(?:;|$)/i.test(response.headers.get('content-type') || '');
          void response.body?.cancel().catch(() => {});
          if (isTransportStream) {
            await playTransportStream();
            return;
          }
        }
      } catch { /* Report failure and let the caller try the next source. */ }
      playbackFailed('No se pudo reproducir el archivo.');
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('pause', clearWait);
    video.addEventListener('loadedmetadata', restorePosition, { once: true });

    let realUrl = url;
    try { realUrl = new URLSearchParams(url.split('?')[1]).get('url') || url; } catch { /* noop */ }
    const isHls = stream?.format === 'hls' || /\.m3u8(\?|$)/i.test(realUrl) || /\/\/www\.desdepylabs\.com\/External\/tvaccion\/npy/i.test(realUrl);
    const nativeHls = isHls && video.canPlayType('application/vnd.apple.mpegurl');
    const playNative = () => {
      video.addEventListener('error', onNativeError, { once: true });
      video.src = url;
      playVideo(video);
    };

    if (stream?.format === 'mpegts') {
      playTransportStream().catch(() => playbackFailed('No se pudo cargar la señal en vivo.'));
    } else if (!isHls || (nativeHls && airplaySupported(video))) {
      playNative();
    } else {
      Promise.all([import('hls.js'), import('hls.js/dist/hls.worker.js?url')])
        .then(([{ default: Hls }, { default: workerPath }]) => {
          if (destroyed) return;
          if (!Hls.isSupported()) {
            if (nativeHls) playNative();
            else playbackFailed('Tu navegador no admite esta señal.');
            return;
          }
          hls = new Hls({
            enableWorker: true,
            workerPath,
            backBufferLength: 30,
            // Colchón de buffer: mantenerse unos segmentos atrás del vivo para que
            // un bajón momentáneo de red no corte la reproducción ("se tranca").
            liveSyncDurationCount: 4,
            liveMaxLatencyDurationCount: 12,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            // Si queda atrás, acelera suave para alcanzar el vivo sin cortar.
            maxLiveSyncPlaybackRate: 1.5,
            // Reintentos ante segmentos/manifiestos lentos en vez de rendirse.
            fragLoadingMaxRetry: 6,
            manifestLoadingMaxRetry: 4,
          });
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
            playbackFailed(
              data.type === Hls.ErrorTypes.NETWORK_ERROR
                ? 'No se pudo cargar el stream (red/CORS o canal caído).'
                : 'Error de reproducción del stream.'
            );
          });
        })
        .catch(() => playbackFailed('No se pudo cargar el reproductor.'));
    }

    return () => {
      destroyed = true;
      clearTimeout(startupTimer);
      clearTimeout(waitTimer);
      probeController.abort();
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('pause', clearWait);
      video.removeEventListener('loadedmetadata', restorePosition);
      video.removeEventListener('error', onNativeError);
      if (hls) hls.destroy();
      if (transportPlayer) transportPlayer.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [url, retry, isLive]);

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
      {(loading || waiting) && !error && <div className="player-overlay player-loading" role="status">{waiting ? 'Cargando video…' : 'Conectando…'}</div>}
      {error && <div className="player-overlay error"><div className="player-error-detail"><span role="status">{error}</span><button type="button" onClick={e => {
        e.stopPropagation();
        resumeAt.current = { url, time: videoRef.current?.currentTime };
        setRetry(count => count + 1);
      }}>Reintentar</button></div></div>}
    </div>
  );
}
