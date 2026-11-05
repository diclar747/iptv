import React, { useRef } from 'react';

// Fila de canales en vivo como "chips" de logo (estilo TV en Vivo del mockup).
export default function LiveRow({ title, channels, onOpen, onSeeAll, live = true }) {
  const track = useRef(null);
  if (!channels || channels.length === 0) return null;
  const scroll = (dir) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <section className="row">
      <div className="row-head">
        <h3>{title} {live && <span className="live-tag sm">● EN VIVO</span>}</h3>
        {onSeeAll && <button className="row-seeall" onClick={onSeeAll}>Ver todo ›</button>}
      </div>
      <div className="row-wrap">
        <button className="row-arrow left" onClick={() => scroll(-1)} aria-label="Anterior">‹</button>
        <div className="row-track live" ref={track}>
          {channels.map((c) => (
            <button key={c.id} className="live-chip" onClick={() => onOpen({ type: 'channel', ...c })} title={c.name}>
              <div className="live-logo">
                {c.logo ? <img src={c.logo} alt="" loading="lazy"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span>{c.name[0]}</span>}
              </div>
              <span className="live-name">{c.name}</span><span className={`signal-status ${c.status||"unchecked"}`}>● {c.status==="online"?"ONLINE":c.status==="offline"?"OFFLINE":"SIN VERIFICAR"}</span>
            </button>
          ))}
        </div>
        <button className="row-arrow right" onClick={() => scroll(1)} aria-label="Siguiente">›</button>
      </div>
    </section>
  );
}
