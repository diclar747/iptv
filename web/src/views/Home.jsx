import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Row from '../ui/Row.jsx';
import LiveRow from '../ui/LiveRow.jsx';
import { getContinue, getMyList, getMostWatched } from '../library.js';

// Adapta un ítem guardado (Seguir viendo / Mi Lista) al formato de LiveRow,
// para que se vea con el MISMO estilo unificado que el resto de los canales.
const toChannel = (it) => ({ ...it, name: it.title, logo: it.poster });

// Inicio centrado en CANALES. Todas las filas vienen en UN solo pedido
// (/api/home) y el service worker las sirve al instante en visitas repetidas.
// "Seguir viendo" y "Mi Lista" salen del dispositivo (localStorage).
export default function Home({ onOpen, onNavigate, onAuthError }) {
  const [rows, setRows] = useState([]);
  const [most] = useState(getMostWatched());
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
        {most.length > 0 && <LiveRow title="Los que más ves" live={false} channels={most.map(toChannel)} onOpen={onOpen} />}
        {cont.length > 0 && <LiveRow title="Seguir viendo" live={false} channels={cont.map(toChannel)} onOpen={onOpen} />}
        {mylist.length > 0 && <LiveRow title="Mi Lista" live={false} channels={mylist.map(toChannel)} onOpen={onOpen} />}
        {rows.map((r) => (
          <LiveRow key={r.key} title={r.title} channels={r.items} onOpen={onOpen}
            onSeeAll={r.nav ? () => onNavigate(r.nav) : undefined} />
        ))}
      </div>
    </div>
  );
}
