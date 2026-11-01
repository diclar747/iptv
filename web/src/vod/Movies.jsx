import React, { useEffect, useState } from 'react';
import { api, proxyUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import Player from '../Player.jsx';
import WatchActions from '../WatchActions.jsx';

export default function Movies({ onAuthError }) {
  const { user } = useAuth();
  const [movies, setMovies] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [cats, setCats] = useState([]);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState(null);

  // Categorías disponibles (de una carga inicial sin filtro).
  useEffect(() => {
    api.movies({}).then((all) => {
      const c = {};
      all.forEach((m) => { if (m.category) c[m.category] = (c[m.category] || 0) + 1; });
      setCats(Object.entries(c).sort((a, b) => a[0].localeCompare(b[0])));
    }).catch(() => {});
  }, []);

  function handleErr(e) {
    if (e.status === 401 || (e.status === 403 && e.data?.reason)) return onAuthError?.(e);
    setError(e.message);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      api.movies({ search, category }).then(setMovies).catch(handleErr);
    }, 300);
    return () => clearTimeout(t);
  }, [search, category]);

  useEffect(() => {
    document.body.classList.toggle('sheet-open', !!sel);
    return () => document.body.classList.remove('sheet-open');
  }, [sel]);

  return (
    <>
      <div className="filters">
        <div className="filter-row">
          <select className="pill" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {cats.map(([c, n]) => (
              <option key={c} value={c}>{c} ({n})</option>
            ))}
          </select>
        </div>
        <input
          className="search" type="search" placeholder="Buscar película…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <main className="main">
        <section className="catalog">
          {error && <div className="banner error">{error}</div>}
          <div className="result-count"><strong>{movies.length}</strong> películas</div>
          <div className="vod-grid">
            {movies.map((m) => (
              <button key={m.id} className="poster-card" onClick={() => setSel(m)}>
                <div className="poster">
                  <img src={m.poster} alt="" loading="lazy"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                  <span className="poster-play">▶</span>
                </div>
                <div className="poster-title">{m.title}</div>
                <div className="poster-meta">{m.year} · {m.category}</div>
              </button>
            ))}
          </div>
        </section>

        {sel && <div className="scrim" onClick={() => setSel(null)} />}
        <aside className={`viewer ${sel ? 'open' : ''}`}>
          {!sel ? (
            <div className="offair">
              <div className="offair-static" aria-hidden="true" />
              <div className="offair-label">CINE</div>
              <p>Elegí una película para verla.</p>
            </div>
          ) : (
            <>
              <div className="viewer-head">
                <div className="viewer-title">
                  <h2>{sel.title}</h2>
                  <div className="viewer-meta">{sel.year} · {sel.category}</div>
                </div>
                <button className="close" onClick={() => setSel(null)} aria-label="Cerrar">✕</button>
              </div>
              <Player url={proxyUrl({ url: sel.streamUrl })} />
              {sel.description && <p className="vod-desc">{sel.description}</p>}
              <WatchActions
                contentId={`movie:${sel.id}`} title={sel.title}
                streams={[{ url: sel.streamUrl }]} activeStream={{ url: sel.streamUrl }}
                onSelectStream={() => {}} user={user} kind="pelicula"
              />
            </>
          )}
        </aside>
      </main>
    </>
  );
}
