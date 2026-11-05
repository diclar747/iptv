import React, { useEffect, useState } from 'react';
import { api, proxyUrl } from '../api.js';
import Player from '../Player.jsx';
import WatchActions from '../WatchActions.jsx';
import { inMyList, toggleMyList, pushContinue, keyOf } from '../library.js';
import { curatedEmbed, curatedDirect, transcodeUrl } from '../curated.js';

// Convierte una URL de YouTube (watch?v= o youtu.be/) en URL de embed.
function toYouTubeEmbed(url) {
  const m = String(url || '').match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0` : null;
}

// Overlay de detalle + reproducción para una película, serie o canal.
// Catálogo (pelis/series): ficha con sinopsis, géneros, reparto y temporadas.
// "Ver ahora" SOLO si hay fuente autorizada (available); si no, el tráiler
// (estrenos) o una ficha informativa.
export default function TitleModal({ item, user, onClose, onAuthError }) {
  const isMovie = item.type === 'movie';
  const isSerie = item.type === 'serie';
  const isChannel = item.type === 'channel';
  const isRadio = item.type === 'radio';
  const embed = curatedEmbed(item.type, item.id);

  const [detail, setDetail] = useState(null); // ficha enriquecida (cine)
  const [streams, setStreams] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [ep, setEp] = useState(null);
  const [activeStream, setActiveStream] = useState(null);
  const [season, setSeason] = useState(1);
  const [checking, setChecking] = useState(false);
  const [limit, setLimit] = useState(null);
  const [inList, setInList] = useState(inMyList(item.type, item.id));
  const [error, setError] = useState(null);
  const [overviewExpanded,setOverviewExpanded]=useState(false);
  useEffect(()=>setOverviewExpanded(false),[item.id]);

  function handleErr(e) {
    if (e.status === 401 || (e.status === 403 && e.data?.reason)) return onAuthError?.(e);
    setError(e.message);
  }

  useEffect(() => {
    if(isMovie||isSerie)return;
    pushContinue({
      type: item.type, id: item.id, title: item.title || item.name,
      poster: item.poster || item.logo,
      meta: item.meta || item.category || item.country || '',
    });
  }, []);

  // Cargar contenido según tipo.
  useEffect(() => {
    if (isRadio) { api.radioPlayback(item.id).then(r=>{const stream={url:r.url,referrer:r.source,format:r.codec==='HLS'?'hls':'audio'};setStreams([stream]);setActiveStream(stream);}).catch(handleErr); } else if (isMovie) {
      api.movie(item.id).then((m) => {
        setDetail(m);
        pushContinue({type:'movie',id:m.id,title:m.title,poster:m.poster,meta:[m.year,m.category].filter(Boolean).join(' · ')});
        if (m.available && m.streams?.length) { setStreams(m.streams); setActiveStream(m.streams[0]); }
      }).catch(handleErr);
    } else if (isSerie) {
      api.serie(item.id).then((s) => {
        setDetail(s);
        pushContinue({type:'serie',id:s.id,title:s.title,poster:s.poster,meta:[s.year,s.category].filter(Boolean).join(' · ')});
        setEpisodes(s.episodes || []);
        const firstPlayable = (s.episodes || []).find((e) => e.available);
        if (firstPlayable) { setEp(firstPlayable); setSeason(firstPlayable.season); setActiveStream({ url: firstPlayable.streamUrl }); }
        else if (s.episodes?.[0]) setSeason(s.episodes[0].season);
      }).catch(handleErr);
    } else if (isChannel) {
      const direct = curatedDirect(item.type, item.id);
      const tc = transcodeUrl(item.type, item.id);
      if (direct) { setStreams([direct]); setActiveStream(direct); }
      else if (tc) { setStreams([{ url: tc }]); setActiveStream({ url: tc }); }
      else {
        api.streams(item.id).then((r) => { setDetail(r.channel || null); setStreams(r.streams); if (r.streams[0]) setActiveStream(r.streams[0]); }).catch(handleErr);
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

  function tryNextStream() {
    const i = streams.indexOf(activeStream);
    const next = streams[i + 1];
    if (next) setActiveStream(next);
  }

  function playEpisode(e) {
    if (!e.available) return;
    setEp(e); setActiveStream({ url: e.streamUrl });
  }

  // Mi Lista: canales → localStorage; pelis/series → favoritos del servidor.
  function toggleList() {
    const next = toggleMyList({ type: item.type, id: item.id, title, poster: backdrop, meta });
    setInList(next);
    if (isMovie || isSerie) {
      if (next) api.addFavorite(item.type, item.id).catch(() => {});
      else api.removeFavorite(item.type, item.id).catch(() => {});
    }
  }

  const d = detail || {};
  const title = detail?.title || detail?.name || item.title || item.name;
  const genres = (d.genres?.length?d.genres:[d.category||item.category]).filter(Boolean).join(' · ');
  const meta = isMovie ? [d.year || item.year, d.runtime ? `${d.runtime} min` : null, d.rating ? `★ ${d.rating}` : null].filter(Boolean).join('  ·  ')
    : isSerie ? [`${episodes.length} episodios`, d.year || item.year, d.status].filter(Boolean).join('  ·  ')
    : `${item.country || ''}${(item.categories || []).length ? ' · ' + item.categories.join(' · ') : ''}`;
  const overview = d.overview || item.description || '';
  const backdrop = d.backdrop || d.poster || item.poster || item.logo;
  const canPlay = isChannel || (activeStream && (isChannel || d.available || item.available));
  const notAvailable = (isMovie || isSerie) && detail && !activeStream;
  // Estrenos: sin fuente completa pero con tráiler oficial de YouTube.
  const trailerEmbed = isMovie ? toYouTubeEmbed(d.trailer || item.trailer) : null;
  const showTrailer = notAvailable && !!trailerEmbed;

  // Agrupar episodios por temporada.
  const seasonsList = [...new Set(episodes.map((e) => e.season))].sort((a, b) => a - b);
  const seasonEps = episodes.filter((e) => e.season === season);

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {backdrop && <div className="modal-bg" style={{ backgroundImage: `url(${backdrop})` }} />}
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>

        <div className="modal-body">
          <div className="modal-head">
            <h2 title={title}>{title}</h2>
            <div className="modal-meta">
              {isChannel && <span className="live-tag">● EN VIVO</span>}
              {showTrailer && <span className="live-tag">▶ TRÁILER</span>}
              {meta}
            </div>
            {genres && <div className="modal-genres">{genres}</div>}
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
          ) : showTrailer ? (
            <div className="player">
              <iframe className="embed-frame" src={trailerEmbed} title={`Tráiler · ${title}`}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen />
            </div>
          ) : notAvailable ? (
            <div className="player placeholder soon">
              <strong>Próximamente</strong>
              <span>Este título está en el catálogo pero todavía no tiene una fuente disponible para reproducir.</span>
            </div>
          ) : activeStream ? (
            <Player url={proxyUrl(activeStream)} stream={activeStream} title={title}
              poster={backdrop} onFail={isChannel ? tryNextStream : undefined} />
          ) : (
            <div className="player placeholder">{error || 'Cargando…'}</div>
          )}

          <div className="modal-actions-top">
            <button className={`mylist-btn ${inList ? 'on' : ''}`} onClick={toggleList}>
              {inList ? '✓ En Mi Lista' : '+ Mi Lista'}
            </button>
          </div>

          {overview && !/^https?:\/\//i.test(overview.trim()) && <div className="synopsis"><p className={`vod-desc ${overviewExpanded?'':'is-collapsed'}`}>{overview}</p>{overview.length>280&&<button className="synopsis-toggle" aria-expanded={overviewExpanded} onClick={()=>setOverviewExpanded(v=>!v)}>{overviewExpanded?'Ver menos':'Leer sinopsis completa'}</button>}</div>}

          {d.originUrl&&<p className="vod-credit"><b>{d.creator||'Autor'}</b> · <a href={d.originUrl} target="_blank" rel="noreferrer">Fuente original en YouTube ↗</a>{d.license?' · '+d.license:''}</p>}
          {d.director?.length > 0 && <p className="vod-credit"><b>Dirección:</b> {d.director.join(', ')}</p>}
          {d.cast?.length > 0 && <p className="vod-credit"><b>Reparto:</b> {d.cast.map((c) => c.name).join(', ')}</p>}

          {(isChannel || isRadio) && (
            <WatchActions
              contentId={keyOf(item.type, item.id)} title={title}
              streams={streams} activeStream={activeStream}
              onSelectStream={(s) => { setLimit(null); setActiveStream(s); }}
              onVerify={verify} checking={checking} user={user} kind={item.type}
            />
          )}

          {isSerie && episodes.length > 0 && (
            <div className="ep-list">
              {seasonsList.length > 1 && (
                <div className="season-tabs">
                  {seasonsList.map((n) => (
                    <button key={n} className={n === season ? 'on' : ''} onClick={() => setSeason(n)}>Temporada {n}</button>
                  ))}
                </div>
              )}
              <div className="label-mono">EPISODIOS</div>
              {seasonEps.map((e) => (
                <button key={e.id} className={`ep ${ep?.id === e.id ? 'on' : ''} ${e.available ? '' : 'locked'}`}
                  onClick={() => playEpisode(e)} disabled={!e.available}>
                  <span className="ep-num">T{e.season}·E{e.episode}</span>
                  <span className="ep-title">{e.title || `Episodio ${e.episode}`}</span>
                  {ep?.id === e.id ? <span className="ep-playing">▶</span>
                    : !e.available ? <span className="ep-soon">próx.</span> : null}
                </button>
              ))}
            </div>
          )}

          {(isMovie || isSerie) && (
            <p className="vod-attrib">Metadatos por TheTVDB</p>
          )}
        </div>
      </div>
    </div>
  );
}
