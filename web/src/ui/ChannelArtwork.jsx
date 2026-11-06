import React,{useEffect,useState} from 'react';

export default function ChannelArtwork({channel}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[channel.logo]);
 const name=channel.name||'Canal';
 return channel.logo&&!failed?<img src={channel.logo} alt={name} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span className="channel-art-fallback" aria-label={`Logo no disponible de ${name}`}>{name.slice(0,2).toUpperCase()}</span>;
}
