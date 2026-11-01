import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

// Reproductor HLS. Usa hls.js donde el navegador no soporta HLS nativo
// (Chrome/Firefox) y el soporte nativo en Safari.
export default function Player({ url }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    setError(null);
    setLoading(true);
    let hls;

    const onPlaying = () => setLoading(false);
    video.addEventListener('playing', onPlaying);

    // Detecta si el stream real (parámetro ?url=) es HLS (.m3u8) o un archivo
    // directo (MP4 de VOD). Los archivos se reproducen nativamente.
    let realUrl = url;
    try { realUrl = new URLSearchParams(url.split('?')[1]).get('url') || url; } catch { /* noop */ }
    const isHls = /\.m3u8(\?|$)/i.test(realUrl);

    if (!isHls) {
      // Archivo directo (MP4): reproducción nativa con seeking.
      video.src = url;
      video.play().catch(() => {});
      video.addEventListener('error', () => {
        setError('No se pudo reproducir el archivo.');
        setLoading(false);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / soporte nativo
      video.src = url;
      video.play().catch(() => {});
    } else if (Hls.isSupported()) {
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
    } else {
      setError('Tu navegador no soporta la reproducción de este formato.');
      setLoading(false);
    }

    return () => {
      video.removeEventListener('playing', onPlaying);
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [url]);

  return (
    <div className="player">
      <video ref={videoRef} controls playsInline />
      {loading && !error && <div className="player-overlay">Conectando…</div>}
      {error && <div className="player-overlay error">{error}</div>}
    </div>
  );
}
