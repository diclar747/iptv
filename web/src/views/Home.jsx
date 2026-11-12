import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Row from '../ui/Row.jsx';
import LiveRow from '../ui/LiveRow.jsx';
import Banner from '../ui/Banner.jsx';
import {useChannelFavorites} from '../channelFavorites.jsx';
import {useVisibleSignals} from '../useVisibleSignals.js';
import { getContinue, getMostWatched, reconcileStoredCatalog } from '../library.js';

// Adapta un ítem de canal guardado al formato de LiveRow.
const toChannel = (it) => ({ ...it, name: it.title, logo: it.poster });

// Portada estilo Netflix: banner destacado + filas de cine (películas/series) y,
// debajo, la TV en vivo. El cine viene de /catalog/home; los canales de /api/home.
export default function Home({ onOpen, onNavigate, onAuthError }) {
  const channelFavorites=useChannelFavorites();
  const [cine, setCine] = useState({ featured: [], rows: [] });
  const [live, setLive] = useState([]);
  const [fav, setFav] = useState([]);
  const [most,setMost] = useState([]);
  const [cont,setCont] = useState([]);
  const [signals,setSignals] = useState({});
  const watchedChannels = most.filter(c=>c.type==='channel').map(toChannel);
  const root = useVisibleSignals(
    [...channelFavorites.items,...live.flatMap(row=>row.items),...watchedChannels],
    api.channelStatuses,
    states=>setSignals(previous=>({...previous,...Object.fromEntries(states.map(state=>[state.id,state]))})),
  );
  const withSignals = channels => channels
    .filter(channel=>!['blocked','deleted'].includes(signals[channel.id]?.status))
    .map(channel=>({...channel,...signals[channel.id]}));

  const onErr = (e) => { if (e.status === 401 || (e.status === 403 && e.data?.reason)) onAuthError?.(e); };

  useEffect(() => {
    reconcileStoredCatalog(api.resolveLibrary).catch(()=>{}).finally(()=>{setCont(getContinue());setMost(getMostWatched());});
    api.catalogHome().then(setCine).catch(onErr);
    api.home().then((r) => setLive(r.rows || [])).catch(onErr);
    api.favorites().then(setFav).catch(() => {});
  }, []);

  return (
    <div className="home cine-home" ref={root}>
      <div className="favorites-top"><LiveRow title={channelFavorites.items.length?'Mis canales favoritos':'Canales destacados'} channels={withSignals(channelFavorites.items.length?channelFavorites.items:(live.find(r=>r.key==='pais')?.items||[]).slice(0,6))} onOpen={onOpen} onSeeAll={()=>onNavigate(channelFavorites.items.length?'favoritos':'tv')}/></div><Banner items={cine.featured} onOpen={onOpen} />

      <div className="rows">
        {cont.length > 0 && <Row title="Seguir viendo" items={cont.map(toChannel)} onOpen={onOpen} />}
        {fav.length > 0 && <Row title="Mi Lista" items={fav} onOpen={onOpen} onSeeAll={() => onNavigate('milista')} />}

        {cine.rows.filter(r=>r.nav!=='series'&&r.key!=='series').map((r) => (
          <Row key={r.key} title={r.title} items={r.items} onOpen={onOpen}
            onSeeAll={r.nav ? () => onNavigate(r.nav) : undefined} />
        ))}

        {(most.length > 0 || live.length > 0) && (
          <div className="home-sep"><span>📡 TV en Vivo</span></div>
        )}
        {watchedChannels.length > 0 && <LiveRow title="Los que más ves" live={false} channels={withSignals(watchedChannels)} onOpen={onOpen} />}
        {live.map((r) => (
          <LiveRow key={r.key} title={r.title} channels={withSignals(r.items)} onOpen={onOpen}
            onSeeAll={r.nav ? () => onNavigate(r.nav) : undefined} />
        ))}
      </div>
    </div>
  );
}
