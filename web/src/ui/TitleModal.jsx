import React, { useEffect, useMemo, useState } from 'react';
import { api, proxyUrl } from '../api.js';
import Player from '../Player.jsx';
import WatchActions from '../WatchActions.jsx';
import { inMyList, toggleMyList, pushContinue, keyOf } from '../library.js';
import { curatedEmbed, transcodeUrl } from '../curated.js';

// Overlay de detalle + reproducción para una película, serie o canal.
export default function TitleModal({ item, user, onClose, onAuthError }) {
  const isMovie = item.type === 'movie';
  const isSerie = item.type === 'serie';
  const isChannel = item.type === 'channel';
  const embed = curatedEmbed(item.type, item.id); // reproductor oficial embebido

  const [streams, setStreams] = useState(isMovie ? [{ url: item.streamUrl }] : []);
  const [episodes, setEpisodes] = useState([]);
  const [ep, setEp] = useState(null);
  const [activeStream, setActiveStream] = useState(isMovie ? { url: item.streamUrl } : null);
  const [checking, setChecking] = useState(false);
  const [limit, setLimit] = useState(null);
  const [inList, setInList] = useState(inMyList(item.type, item.id));
  const [error, setError] = useState(null);

  function handleErr(e) {
    if (e.status === 401 || (e.status === 403 && e.data?.reason)) return onAuthError?.(e);
    setError(e.message);
  }

  // Registrar en "Seguir viendo" al abrir.
  useEffect(() => {
    pushContinue({
      type: item.type, id: item.id,
      title: item.title || item.name,
      poster: item.poster || item.logo,
      meta: item.meta || item.category || item.country || '',
    });
  }, []);

  // Cargar contenido según tipo.
  useEffect(() => {
    if (isSerie) {
      api.serie(item.id).then((s) => {
        setEpisodes(s.episodes);
        if (s.episodes[0]) { setEp(s.episodes[0]); setActiveStream({ url: s.episodes[0].streamUrl }); }
      }).catch(handleErr);
    } else if (isChannel) {
      // Canales curados para transcodificar: usan el stream del transcodificador.
      const tc = transcodeUrl(item.type, item.id);
      if (tc) {
        setStreams([{ url: tc }]);
        setActiveStream({ url: tc });
      } else {
        api.streams(item.id).then((r) => {
          setStreams(r.streams);
          if (r.streams[0]) setActiveStream(r.streams[0]);
        }).catch(handleErr);
      }
    }
  }, [item.id]);

  // Control de conexiones (solo canales en vivo).
  useEffect(() => {
    if (!isChannel) return;
    let sid = null, beat = null, cancelled = false;
    setLimit(null);
    (async () => {
      try {
        const r = await api.watchStart(item.id);
        if (cancelled) return api.watchStop(r.sessionId).catch(() => {});
        sid = r.sessionId;
        beat = setInterval(() => api.watchBeat(sid).catch(() => {}), 20000);
      } catch (e) {
        if (e.status === 429) { setLimit(e.data || { max: '?' }); setActiveStream(null); }
        else handleErr(e);
      }
    })();
    return () => { cancelled = true; if (beat) clearInterval(beat); if (sid) api.watchStop(sid).catch(() => {}); };
  }, [item.id]);

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); };
  }, []);

  async function verify() {
    setChecking(true);
    try {
      const res = await api.checkChannel(item.id);
      setStreams(res.streams);
      const ok = res.streams.find((s) => s.ok);
      if (ok) setActiveStream(ok);
    } catch (e) { handleErr(e); } finally { setChecking(false); }
  }

  const activeCount = useMemo(
    () => (streams.some((s) => 'ok' in s) ? streams.filter((s) => s.ok).length : null),
    [streams]
  );

  // Si el stream actual falla, pasa automáticamente al siguiente del canal.
  function tryNextStream() {
    const i = streams.indexOf(activeStream);
    const next = streams[i + 1];
    if (next) setActiveStream(next);
  }

  const title = item.title || item.name;
  const meta = isMovie ? `${item.year || ''} · ${item.category || ''}`
    : isSerie ? `${episodes.length} episodios · ${item.category || 'Serie'}`
    : `${item.country || ''}${(item.categories || []).length ? ' · ' + item.categories.join(' · ') : ''}`;
  const backdrop = item.poster || item.logo;

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {backdrop && <div className="modal-bg" style={{ backgroundImage: `url(${backdrop})` }} />}
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <div className="modal-body">
          <div className="modal-head">
            <h2>{title}</h2>
            <div className="modal-meta">
              {isChannel && <span className="live-tag">● EN VIVO</span>}
              {meta}
            </div>
          </div>

          {embed ? (
            <div className="player">
              <iframe className="embed-frame" src={embed} title={title}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen />
            </div>
          ) : limit ? (
            <div className="player placeholder limit">
              Límite de conexiones alcanzado ({limit.max}).<br />Cerrá otra pantalla e intentá de nuevo.
            </div>
          ) : activeStream ? (
            <Player url={proxyUrl(activeStream)} stream={activeStream} title={title}
              poster={backdrop} onFail={isChannel ? tryNextStream : undefined} />
          ) : (
            <div className="player placeholder">{error || 'Cargando…'}</div>
          )}

          <div className="modal-actions-top">
            <button className={`mylist-btn ${inList ? 'on' : ''}`}
              onClick={() => setInList(toggleMyList({
                type: item.type, id: item.id, title, poster: backdrop, meta,
              }))}>
              {inList ? '✓ En Mi Lista' : '+ Mi Lista'}
            </button>
          </div>

          {item.description && !/^https?:\/\//i.test(item.description.trim()) && (
            <p className="vod-desc">{item.description}</p>
          )}

          <WatchActions
            contentId={keyOf(item.type, item.id)} title={title}
            streams={streams} activeStream={activeStream}
            onSelectStream={(s) => { setLimit(null); setActiveStream(s); }}
            onVerify={isChannel ? verify : undefined}
            checking={checking} activeCount={activeCount}
            user={user} kind={item.type}
          />

          {isSerie && episodes.length > 0 && (
            <div className="ep-list">
              <div className="label-mono">EPISODIOS</div>
              {episodes.map((e) => (
                <button key={e.id} className={`ep ${ep?.id === e.id ? 'on' : ''}`}
                  onClick={() => { setEp(e); setActiveStream({ url: e.streamUrl }); }}>
                  <span className="ep-num">T{e.season}·E{e.episode}</span>
                  <span className="ep-title">{e.title}</span>
                  {ep?.id === e.id && <span className="ep-playing">▶</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
