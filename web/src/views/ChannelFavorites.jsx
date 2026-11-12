import React from 'react';
import {useChannelFavorites} from '../channelFavorites.jsx';
import ChannelCard from '../ui/ChannelCard.jsx';
export default function ChannelFavorites({onOpen,onNavigate}){
 const {items,loading,error}=useChannelFavorites();
 return <div className="view"><div className="view-head"><h2>Mis canales favoritos <span className="live-tag sm">★ {items.length}</span></h2><button className="pill" onClick={()=>onNavigate('tv')}>Explorar canales</button></div><p className="favorites-intro">Tus canales a un toque. Usá la estrella de cada tarjeta para agregar o quitar favoritos. Se guardan en tu cuenta.</p>{loading?<p role="status">Cargando favoritos…</p>:items.length?<div className="chan-grid">{items.map(c=><ChannelCard key={c.id} channel={c} onOpen={onOpen}/>)}</div>:!error&&<div className="favorites-empty">Todavía no tenés canales favoritos. Abrí TV en Vivo y tocá ☆ en los canales que más mirás.</div>}</div>;
}
