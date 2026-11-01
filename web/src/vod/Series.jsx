import React, { useEffect, useState } from 'react';
import { api, proxyUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import Player from '../Player.jsx';
import WatchActions from '../WatchActions.jsx';

export default function Series({ onAuthError }) {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);      // serie con episodios
  const [ep, setEp] = useState(null);        // episodio en reproducción
  const [error, setError] = useState(null);

  function handleErr(e) {
    if (e.status === 401 || (e.status === 403 && e.data?.reason)) return onAuthError?.(e);
    setError(e.message);
  }

  useEffect(() => { api.series().then(setList).catch(handleErr); }, []);
  useEffect(() => {
    document.body.classList.toggle('sheet-open', !!sel);
    return () => document.body.classList.remove('sheet-open');
  }, [sel]);

  async function openSeries(s) {
    setEp(null);
    try {
      const full = await api.serie(s.id);
      setSel(full);
      if (full.episodes[0]) setEp(full.episodes[0]);
    } catch (e) { handleErr(e); }
  }

  return (
    <>
      <main className="main" style={{ paddingTop: 16 }}>
        <section className="catalog">
          {error && <div className="banner error">{error}</div>}
          <div className="result-count"><strong>{list.length}</strong> series</div>
          <div className="vod-grid">
            {list.map((s) => (
              <button key={s.id} className="poster-card" onClick={() => openSeries(s)}>
                <div className="poster">
                  <img src={s.poster} alt="" loading="lazy"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                  <span className="poster-play">▶</span>
                </div>
                <div className="poster-title">{s.title}</div>
                <div className="poster-meta">{s.episodeCount} ep · {s.category}</div>
              </button>
            ))}
          </div>
        </section>

        {sel && <div className="scrim" onClick={() => setSel(null)} />}
        <aside className={`viewer ${sel ? 'open' : ''}`}>
          {!sel ? (
            <div className="offair">
              <div className="offair-static" aria-hidden="true" />
              <div className="offair-label">SERIES</div>
              <p>Elegí una serie para verla.</p>
            </div>
          ) : (
            <>
              <div className="viewer-head">
                <div className="viewer-title">
                  <h2>{sel.title}</h2>
                  <div className="viewer-meta">
                    {ep ? `T${ep.season} · E${ep.episode} — ${ep.title}` : sel.category}
                  </div>
                </div>
                <button className="close" onClick={() => setSel(null)} aria-label="Cerrar">✕</button>
              </div>

              {ep ? <Player url={proxyUrl({ url: ep.streamUrl })} /> :
                <div className="player placeholder">Elegí un episodio</div>}

              <WatchActions
                contentId={`serie:${sel.id}`} title={sel.title}
                streams={ep ? [{ url: ep.streamUrl }] : []} activeStream={ep ? { url: ep.streamUrl } : null}
                onSelectStream={() => {}} user={user} kind="serie"
              />

              <div className="ep-list">
                <div className="label-mono">EPISODIOS</div>
                {sel.episodes.map((e) => (
                  <button key={e.id} className={`ep ${ep?.id === e.id ? 'on' : ''}`} onClick={() => setEp(e)}>
                    <span className="ep-num">T{e.season}·E{e.episode}</span>
                    <span className="ep-title">{e.title}</span>
                    {ep?.id === e.id && <span className="ep-playing">▶</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
      </main>
    </>
  );
}
