import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Row from '../ui/Row.jsx';
import LiveRow from '../ui/LiveRow.jsx';
import { getContinue, getMyList } from '../library.js';

// Inicio centrado en CANALES. Todas las filas vienen en UN solo pedido
// (/api/home) y el service worker las sirve al instante en visitas repetidas.
// "Seguir viendo" y "Mi Lista" salen del dispositivo (localStorage).
export default function Home({ onOpen, onNavigate, onAuthError }) {
  const [rows, setRows] = useState([]);
  const [cont] = useState(getContinue());
  const [mylist] = useState(getMyList());

  useEffect(() => {
    api.home()
      .then((r) => setRows(r.rows || []))
      .catch((e) => { if (e.status === 401 || (e.status === 403 && e.data?.reason)) onAuthError?.(e); });
  }, []);

  return (
    <div className="home">
      <div className="rows">
        {cont.length > 0 && <Row title="Seguir viendo" items={cont} onOpen={onOpen} />}
        {mylist.length > 0 && <Row title="Mi Lista" items={mylist} onOpen={onOpen} />}
        {rows.map((r) => (
          <LiveRow key={r.key} title={r.title} channels={r.items} onOpen={onOpen}
            onSeeAll={r.nav ? () => onNavigate(r.nav) : undefined} />
        ))}
      </div>
    </div>
  );
}
