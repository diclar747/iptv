import React,{useState,useEffect} from 'react';

// Tarjeta de póster (película / serie / ítem de lista).
export default function PosterCard({ item, onOpen }) {
  const title = item.title || item.name;
  const poster = item.poster || item.logo;
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[poster]);
  const meta = item.meta || [item.year, item.category].filter(Boolean).join(' · ');
  return (
    <button className="pcard" onClick={() => onOpen(item)} title={title}>
      <div className="pcard-img">
        {poster&&!failed
          ? <img src={poster} alt="" loading="lazy"
              onError={() => setFailed(true)} />
          : <span className="pcard-fallback"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4M10 9l5 3-5 3z"/></svg><small>Carátula pendiente</small></span>}
        <span className="pcard-play">{item.available === false ? 'Ver ficha' : '▶'}</span>
        {item.available === false && <span className="pcard-status">{item.trailer ? 'Tráiler' : 'Ficha'}</span>}
      </div>
      <div className="pcard-title">{title}</div>
      {meta && <div className="pcard-meta">{meta}</div>}
    </button>
  );
}
