import React from 'react';

// Tarjeta de póster (película / serie / ítem de lista).
export default function PosterCard({ item, onOpen }) {
  const title = item.title || item.name;
  const poster = item.poster || item.logo;
  const meta = item.meta || [item.year, item.category].filter(Boolean).join(' · ');
  return (
    <button className="pcard" onClick={() => onOpen(item)} title={title}>
      <div className="pcard-img">
        {poster
          ? <img src={poster} alt="" loading="lazy"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
          : <span className="pcard-ph">{title?.[0]}</span>}
        <span className="pcard-play">{item.available === false ? 'Ver ficha' : '▶'}</span>
        {item.available === false && <span className="pcard-status">{item.trailer ? 'Tráiler' : 'Ficha'}</span>}
      </div>
      <div className="pcard-title">{title}</div>
      {meta && <div className="pcard-meta">{meta}</div>}
    </button>
  );
}
