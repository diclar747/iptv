import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import PosterCard from '../ui/PosterCard.jsx';
import { getMyList } from '../library.js';

// Grilla de pósters para Películas / Series / Infantil / Mi Lista.
export default function Catalog({ mode, title, fixedCategory, onOpen, onAuthError, initialCategory = '' }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(initialCategory || '');
  const [cats, setCats] = useState([]);
  const [error, setError] = useState(null);

  function handleErr(e) {
    if (e.status === 401 || (e.status === 403 && e.data?.reason)) return onAuthError?.(e);
    setError(e.message);
  }

  // Carga según modo.
  useEffect(() => {
    if (mode === 'mylist') { setItems(getMyList()); return; }
    if (mode === 'series') {
      api.series().then((s) => setItems(s.map((x) => ({ type: 'serie', ...x })))).catch(handleErr);
      return;
    }
    // movies
    const t = setTimeout(() => {
      api.movies({ search, category: fixedCategory || category })
        .then((m) => setItems(m.map((x) => ({ type: 'movie', ...x })))).catch(handleErr);
    }, 300);
    return () => clearTimeout(t);
  }, [mode, search, category, fixedCategory]);

  // Categorías (solo películas sin categoría fija).
  useEffect(() => {
    if (mode !== 'movies' || fixedCategory) return;
    api.movies({}).then((all) => {
      const c = {};
      all.forEach((m) => { if (m.category) c[m.category] = (c[m.category] || 0) + 1; });
      setCats(Object.entries(c).sort((a, b) => a[0].localeCompare(b[0])));
    }).catch(() => {});
  }, [mode, fixedCategory]);

  const showFilters = mode === 'movies';

  return (
    <div className="view">
      <div className="view-head">
        <h2>{title}</h2>
        {showFilters && (
          <div className="view-filters">
            {!fixedCategory && (
              <select className="pill" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas las categorías</option>
                {cats.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
              </select>
            )}
            <input className="search" type="search" placeholder="Buscar…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      {error && <div className="banner error">{error}</div>}
      {items.length === 0 && !error && <div className="banner">Nada por acá todavía.</div>}

      <div className="vod-grid">
        {items.map((it) => <PosterCard key={it.key || `${it.type}${it.id}`} item={it} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
