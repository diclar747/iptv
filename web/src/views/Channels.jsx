import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import {useVisibleSignals} from '../useVisibleSignals.js';

// Grilla de canales en vivo para TV en Vivo / Deportes / Documentales.
export default function Channels({ title, fixedCategory, defaultCountry = 'PY', onOpen, onAuthError }) {
  const [meta, setMeta] = useState(null);
  const [country, setCountry] = useState(defaultCountry);
  const [category, setCategory] = useState(fixedCategory || '');
  const [search, setSearch] = useState('');
  const [status,setStatus] = useState('');
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(null);

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
          <select value={status} onChange={e=>{setPage(1);setStatus(e.target.value);}}><option value="">Todos los estados</option><option value="online">Online</option><option value="offline">Offline</option><option value="unchecked">Sin verificar</option></select>
          <input className="search" type="search" placeholder="Buscar canal…"
            value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} />
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}
      {data && (
        <>
          <div className="chan-grid">
            {data.items.map((c) => (
              <button key={c.id} data-signal-id={c.id} className="chan-card" onClick={() => onOpen({ type: 'channel', ...c })}>
                <div className="chan-logo">
                  {c.logo ? <img src={c.logo} alt="" loading="lazy"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span>{c.name[0]}</span>}
                </div>
                <div className="chan-name">{c.name}</div><span className={`signal-status ${c.status||"unchecked"}`}>● {c.status==="online"?"ONLINE":c.status==="offline"?"OFFLINE":"SIN VERIFICAR"}</span>
              </button>
            ))}
          </div>
          {data.items.length === 0 && <div className="banner">Sin canales para ese filtro.</div>}
          {data.pages > 1 && (
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
