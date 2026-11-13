import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import {useVisibleSignals} from '../useVisibleSignals.js';
import ChannelCard from '../ui/ChannelCard.jsx';
import ChannelArtwork from '../ui/ChannelArtwork.jsx';
import LiveRow from '../ui/LiveRow.jsx';
import {useChannelFavorites} from '../channelFavorites.jsx';

const externalSportsChannels = [
  ['ESPN 1', 'espn-1'],
  ['ESPN 2', 'espn-2'],
  ['ESPN 3', 'espn-3'],
  ['FOX Sports 1', 'fox-sports-1'],
  ['FOX Sports 2', 'fox-sports-2'],
  ['FOX Sports 3', 'fox-sports-3'],
  ['FOX Sports Premium', 'fox-sports-premium'],
  ['TUDN', 'tudn-mx'],
];

// Grilla de canales en vivo para TV en Vivo / Deportes / Documentales.
export default function Channels({ title, fixedCategory, defaultCountry = 'PY', onOpen, onAuthError }) {
  const [meta, setMeta] = useState(null);
  const favorites=useChannelFavorites();
  const [country, setCountry] = useState(defaultCountry);
  const [category, setCategory] = useState(fixedCategory || '');
  const [search, setSearch] = useState('');
  const [status,setStatus] = useState('');
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);
  const externalChannels = fixedCategory === 'sports' && page === 1 && !status && (!country || country === 'MX')
    ? externalSportsChannels.filter(([name]) => name.toLowerCase().includes(search.trim().toLowerCase()))
    : [];

  const root=useVisibleSignals(data?.items||[],api.channelStatuses,states=>{const map=new Map(states.map(s=>[s.id,s]));setData(old=>old?{...old,items:old.items.filter(c=>!['blocked','deleted'].includes(map.get(c.id)?.status)).map(c=>({...c,...map.get(c.id)}))}:old);});
  function handleErr(e) {
    if (e.status === 401 || (e.status === 403 && e.data?.reason)) return onAuthError?.(e);
    setError(e.message);
  }

  useEffect(() => { api.meta().then(setMeta).catch(handleErr); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      api.channels({ country, category: fixedCategory || category, search, status, page, pageSize: 48 })
        .then(setData).catch(handleErr);
    }, 250);
    return () => clearTimeout(t);
  }, [country, category, search, status, page, fixedCategory]);

  return (
    <div className="view" ref={root}>
      <div className="view-head">
        <h2>{title} <span className="live-tag sm">● EN VIVO</span></h2>
        <div className="view-filters">
          <select className="pill" value={country} onChange={(e) => { setPage(1); setCountry(e.target.value); }}>
            <option value="">🌎 Todos los países</option>
            {meta?.countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
          {!fixedCategory && (
            <select className="pill" value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }}>
              <option value="">Categorías</option>
              {meta?.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
            </select>
          )}
          <select value={status} onChange={e=>{setPage(1);setStatus(e.target.value);}}><option value="">Todos</option><option value="online">Online</option><option value="offline">Offline</option></select>
          <input className="search" type="search" placeholder="Buscar canal…"
            value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}
      {page===1&&!search&&!status&&<LiveRow title="Mis canales favoritos" channels={favorites.items.filter(c=>(!country||c.country===country)&&(!(fixedCategory||category)||(c.categories||[]).includes(fixedCategory||category)))} onOpen={onOpen}/>}
      {(data || externalChannels.length > 0) && (
        <>
          <div className="chan-grid">
            {externalChannels.map(([name, slug]) => (
              <a key={slug} className="chan-card" href={`https://futbolenvivo.top/en-vivo/${slug}`}
                target="_blank" rel="noopener noreferrer" aria-label={`${name} (abrir en otra pestaña)`}>
                <div className="chan-logo"><ChannelArtwork channel={{ name }} /></div>
                <span className="chan-name">{name} ↗</span>
              </a>
            ))}
            {data?.items.map((c) => (
              <ChannelCard key={c.id} channel={c} onOpen={onOpen}/>
            ))}
          </div>
          {data?.items.length === 0 && externalChannels.length === 0 && <div className="banner">Sin canales para ese filtro.</div>}
          {data?.pages > 1 && (
            <div className="pager">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
              <span className="pager-pos">{page} / {data.pages}</span>
              <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
