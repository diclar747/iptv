import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

// Búsqueda de CANALES (el VOD está desactivado por ahora).
export default function Search({ query, onOpen, onAuthError }) {
  const [channels, setChannels] = useState([]);

  function handleErr(e) { if (e.status === 401 || (e.status === 403 && e.data?.reason)) onAuthError?.(e); }

  useEffect(() => {
    const q = query.trim();
    if (!q) { setChannels([]); return; }
    const t = setTimeout(() => {
      api.channels({ search: q, country: '', pageSize: 40 }).then((r) => setChannels(r.items)).catch(handleErr);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const empty = !query.trim();
  const nothing = !empty && channels.length === 0;

  return (
    <div className="view">
      <div className="view-head"><h2>{empty ? 'Buscar' : `Resultados de "${query}"`}</h2></div>
      {empty && <div className="banner">Escribí para buscar canales.</div>}
      {nothing && <div className="banner">Sin resultados.</div>}

      {channels.length > 0 && (
        <div className="chan-grid">
          {channels.map((c) => (
            <button key={c.id} className="chan-card" onClick={() => onOpen({ type: 'channel', ...c })}>
              <div className="chan-logo">{c.logo ? <img src={c.logo} alt=""
                onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span>{c.name[0]}</span>}</div>
              <div className="chan-name">{c.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
