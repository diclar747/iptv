import React, { useRef } from 'react';
import PosterCard from './PosterCard.jsx';

// Fila horizontal de pósters, con flechas de desplazamiento (escritorio).
export default function Row({ title, items, onOpen, onSeeAll }) {
  const track = useRef(null);
  if (!items || items.length === 0) return null;

  const scroll = (dir) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className="row">
      <div className="row-head">
        <h3>{title}</h3>
        {onSeeAll && <button className="row-seeall" onClick={onSeeAll}>Ver todo ›</button>}
      </div>
      <div className="row-wrap">
        <button className="row-arrow left" onClick={() => scroll(-1)} aria-label="Anterior">‹</button>
        <div className="row-track" ref={track}>
          {items.slice(0, 20).map((it) => (
            <PosterCard key={it.key || `${it.type || ''}${it.id}`} item={it} onOpen={onOpen} />
          ))}
        </div>
        <button className="row-arrow right" onClick={() => scroll(1)} aria-label="Siguiente">›</button>
      </div>
    </section>
  );
}
