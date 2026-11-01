import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Row from '../ui/Row.jsx';
import LiveRow from '../ui/LiveRow.jsx';
import { getContinue, getMyList } from '../library.js';

// Inicio centrado en CANALES (el VOD está desactivado por ahora). Cada fila
// trae canales por país o categoría; "Seguir viendo" y "Mi Lista" salen del
// dispositivo (localStorage).
const ROWS = [
  { key: 'py', title: 'TV en Vivo · Paraguay', params: { country: 'PY', pageSize: 20 }, nav: 'tv' },
  { key: 'sports', title: 'Deportes', params: { category: 'sports', pageSize: 20 }, nav: 'deportes' },
  { key: 'news', title: 'Noticias', params: { category: 'news', pageSize: 20 } },
  { key: 'ar', title: 'Argentina', params: { country: 'AR', pageSize: 20 } },
  { key: 'br', title: 'Brasil', params: { country: 'BR', pageSize: 20 } },
  { key: 'documentary', title: 'Documentales', params: { category: 'documentary', pageSize: 20 }, nav: 'documentales' },
];

export default function Home({ onOpen, onNavigate, onAuthError }) {
  const [rows, setRows] = useState({});
  const [cont] = useState(getContinue());
  const [mylist] = useState(getMyList());

  function handleErr(e) { if (e.status === 401 || (e.status === 403 && e.data?.reason)) onAuthError?.(e); }

  useEffect(() => {
    ROWS.forEach((r) => {
      api.channels(r.params)
        .then((res) => setRows((prev) => ({ ...prev, [r.key]: res.items })))
        .catch(handleErr);
    });
  }, []);

  return (
    <div className="home">
      <div className="rows">
        {cont.length > 0 && <Row title="Seguir viendo" items={cont} onOpen={onOpen} />}
        {mylist.length > 0 && <Row title="Mi Lista" items={mylist} onOpen={onOpen} />}
        {ROWS.map((r) => (
          <LiveRow key={r.key} title={r.title} channels={rows[r.key] || []} onOpen={onOpen}
            onSeeAll={r.nav ? () => onNavigate(r.nav) : undefined} />
        ))}
      </div>
    </div>
  );
}
