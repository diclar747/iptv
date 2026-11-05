import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Row from '../ui/Row.jsx';
import LiveRow from '../ui/LiveRow.jsx';
import Banner from '../ui/Banner.jsx';
import { getContinue, getMostWatched, reconcileStoredCatalog } from '../library.js';

// Adapta un ítem de canal guardado al formato de LiveRow.
const toChannel = (it) => ({ ...it, name: it.title, logo: it.poster });

// Portada estilo Netflix: banner destacado + filas de cine (películas/series) y,
// debajo, la TV en vivo. El cine viene de /catalog/home; los canales de /api/home.
export default function Home({ onOpen, onNavigate, onAuthError }) {
  const [cine, setCine] = useState({ featured: [], rows: [] });
  const [live, setLive] = useState([]);
  const [fav, setFav] = useState([]);
  const [most,setMost] = useState([]);
  const [cont,setCont] = useState([]);

  const onErr = (e) => { if (e.status === 401 || (e.status === 403 && e.data?.reason)) onAuthError?.(e); };

  useEffect(() => {
    reconcileStoredCatalog(api.resolveLibrary).catch(()=>{}).finally(()=>{setCont(getContinue());setMost(getMostWatched());});
    api.catalogHome().then(setCine).catch(onErr);
    api.home().then((r) => setLive(r.rows || [])).catch(onErr);
    api.favorites().then(setFav).catch(() => {});
  }, []);

  return (
    <div className="home cine-home">
      <Banner items={cine.featured} onOpen={onOpen} />

      <div className="rows">
        {cont.length > 0 && <Row title="Seguir viendo" items={cont.map(toChannel)} onOpen={onOpen} />}
        {fav.length > 0 && <Row title="Mi Lista" items={fav} onOpen={onOpen} onSeeAll={() => onNavigate('milista')} />}

        {cine.rows.map((r) => (
          <Row key={r.key} title={r.title} items={r.items} onOpen={onOpen}
            onSeeAll={r.nav ? () => onNavigate(r.nav) : undefined} />
        ))}

        {(most.length > 0 || live.length > 0) && (
          <div className="home-sep"><span>📡 TV en Vivo</span></div>
        )}
        {most.length > 0 && <LiveRow title="Los que más ves" live={false} channels={most.map(toChannel)} onOpen={onOpen} />}
        {live.map((r) => (
          <LiveRow key={r.key} title={r.title} channels={r.items} onOpen={onOpen}
            onSeeAll={r.nav ? () => onNavigate(r.nav) : undefined} />
        ))}
      </div>
    </div>
  );
}
