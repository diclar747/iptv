import React, { useEffect, useRef, useState } from 'react';
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
  const [retry,setRetry]=useState(0);
  const generation=useRef(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Refs para el scroll infinito: evitan disparos solapados y páginas
  // desfasadas sin depender del ciclo de render.
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(false);

  async function loadMore() {
    if(loadingRef.current||!hasMoreRef.current)return;
    loadingRef.current=true;setLoadingMore(true);setError(null);
    const epoch=generation.current,nextPage=pageRef.current+1;
    try{
      const rows=await (mode==='series'?api.series({search,page:nextPage,pageSize:10}):api.movies({search,category:fixedCategory||category,page:nextPage,pageSize:10}));
      if(epoch!==generation.current)return;
      const next=rows.map(x=>({...x,type:mode==='series'?'serie':'movie'}));
      setItems(old=>[...old,...next.filter(x=>!old.some(y=>y.id===x.id))]);pageRef.current=nextPage;
      hasMoreRef.current=rows.length===10;setHasMore(hasMoreRef.current);
    }catch(e){if(epoch===generation.current)handleErr(e);}finally{if(epoch===generation.current){loadingRef.current=false;setLoadingMore(false);}}
  }

  function handleErr(e) {
    if (e.status === 401 || (e.status === 403 && e.data?.reason)) return onAuthError?.(e);
    setError(e.message);
  }

  useEffect(()=>{
    const epoch=++generation.current;let alive=true;
    loadingRef.current=true;hasMoreRef.current=false;setHasMore(false);setItems([]);setLoadingMore(true);setError(null);
    const timer=setTimeout(async()=>{
      try{
        const rows=mode==='mylist'?await api.favorites().catch(()=>getMyList()):mode==='series'?await api.series({search,page:1,pageSize:10}):await api.movies({search,category:fixedCategory||category,page:1,pageSize:10});
        if(!alive)return;
        setItems(rows.map(x=>mode==='mylist'?x:{...x,type:mode==='series'?'serie':'movie'}));pageRef.current=1;
        hasMoreRef.current=mode!=='mylist'&&rows.length===10;setHasMore(hasMoreRef.current);
      }catch(e){if(alive)handleErr(e);}finally{if(alive&&epoch===generation.current){loadingRef.current=false;setLoadingMore(false);}}
    },300);
    return()=>{alive=false;clearTimeout(timer);};
  },[mode,search,category,fixedCategory,retry]);

  useEffect(()=>{
    if(mode==='mylist'||!hasMore||loadingMore||error)return;
    const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))loadMore();},{rootMargin:'200px'});
    if(sentinelRef.current)io.observe(sentinelRef.current);return()=>io.disconnect();
  },[mode,search,category,fixedCategory,hasMore,loadingMore,items.length,error]);

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

  const showFilters = mode !== 'mylist';

  return (
    <div className="view">
      <div className="view-head">
        <h2>{title}</h2>
        {showFilters && (
          <div className="view-filters">
            {mode==='movies'&&!fixedCategory && (
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

      {error && <div className="banner error">{error} <button onClick={()=>items.length?loadMore():setRetry(x=>x+1)}>Reintentar</button></div>}
      {items.length === 0 && !error && !loadingMore && <div className="banner">Nada por acá todavía.</div>}

      <div className="vod-grid">
        {items.map((it) => <PosterCard key={it.key || `${it.type}${it.id}`} item={it} onOpen={onOpen} />)}
      </div>
      {mode !== 'mylist' && (
        <div ref={sentinelRef} className="vod-sentinel">
          {loadingMore && <span className="vod-loading">Cargando…</span>}
        </div>
      )}
    </div>
  );
}
