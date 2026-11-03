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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await api.movies({ search, category: fixedCategory || category, page: page + 1 });
      setItems(old => [...old, ...next.filter(x => !old.some(y => y.id === x.id))]);
      setPage(page + 1); setHasMore(next.length === 48);
    } catch (e) { handleErr(e); }
    finally { setLoadingMore(false); }
  }

  function handleErr(e) {
    if (e.status === 401 || (e.status === 403 && e.data?.reason)) return onAuthError?.(e);
    setError(e.message);
  }

  // Carga según modo.
  useEffect(() => {
    if (mode === 'mylist') {
      api.favorites().then(setItems).catch(() => setItems(getMyList()));
      return;
    }
    if (mode === 'series') {
      api.series().then((s) => setItems(s.map((x) => ({ type: 'serie', ...x })))).catch(handleErr);
      return;
    }
    // movies
    const t = setTimeout(() => {
      api.movies({ search, category: fixedCategory || category })
        .then((m) => { setItems(m.map((x) => ({ type: 'movie', ...x }))); setPage(1); setHasMore(m.length === 48); setError(null); }).catch(handleErr);
    }, 300);
    return () => clearTimeout(t);
  }, [mode, search, category, fixedCategory]);

  // Categorías (solo películas sin categoría fija).
  useEffect(() => {
    if (mode !== 'movies' || fixedCategory) return;
    // Usa /catalog/meta: cuenta TODOS los géneros reproducibles (no solo la
    // primera página de películas, que eran todas "Clásicos" por popularidad).
    api.catalogMeta().then((meta) => {
      const list = (meta.genres || [])
        .map((g) => [g.value, g.count])
        .sort((a, b) => a[0].localeCompare(b[0]));
      setCats(list);
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
      {mode === 'movies' && hasMore && <button className="pill" disabled={loadingMore} onClick={loadMore} style={{ marginTop: 24 }}>{loadingMore ? 'Cargando…' : 'Cargar más películas'}</button>}
    </div>
  );
}
