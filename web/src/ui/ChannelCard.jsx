import React from 'react';
import ChannelArtwork from './ChannelArtwork.jsx';
import {FavoriteButton} from '../channelFavorites.jsx';
export default function ChannelCard({channel:c,onOpen,compact=false}){
 return <div className={'channel-tile'+(compact?' compact':'')} data-signal-id={c.id}>
  <button className={compact?'live-chip':'chan-card'} onClick={()=>onOpen({...c,type:'channel'})} aria-label={'Reproducir '+c.name} title={c.name}>
   <div className={compact?'live-logo':'chan-logo'}><ChannelArtwork channel={c}/><span className="channel-play" aria-hidden="true">▶</span></div>
   <span className={compact?'live-name':'chan-name'}>{c.name}</span>
   {['online','offline'].includes(c.status)&&<span className={'signal-status '+c.status}>● {c.status==='online'?'ONLINE':'OFFLINE'}</span>}
  </button><FavoriteButton channel={c}/>
 </div>;
}
