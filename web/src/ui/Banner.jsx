import React, { useEffect, useState } from 'react';

// Banner principal de la portada: rota entre títulos destacados con su imagen
// de fondo, sinopsis y acciones. "Ver ahora" solo si hay fuente para reproducir.
export default function Banner({ items = [], onOpen }) {
  const [i, setI] = useState(0);
  const list = items.filter((x) => x.backdrop || x.poster);

  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % list.length), 7000);
    return () => clearInterval(t);
  }, [list.length]);

  if (!list.length) return null;
  const it = list[Math.min(i, list.length - 1)];
  const bg = it.backdrop || it.poster;
  const meta = [it.year, it.rating ? `★ ${it.rating}` : null, it.category].filter(Boolean).join('  ·  ');

  return (
    <section className="cine-banner">
      <div className="cine-banner-bg" style={{ backgroundImage: `url(${bg})` }} key={bg} />
      <div className="cine-banner-fade" />
      <div className="cine-banner-in">
        <span className="cine-banner-tag">{it.type === 'serie' ? 'Serie destacada' : 'Película destacada'}</span>
        <h1 className="cine-banner-title">{it.title}</h1>
        {meta && <div className="cine-banner-meta">{meta}</div>}
        <div className="cine-banner-btns">
          <button className="cine-btn cine-btn-main" onClick={() => onOpen(it)}>
            {it.available ? '▶ Ver ahora' : it.trailer ? '▶ Ver tráiler' : 'Más info'}
          </button>
        </div>
      </div>
      {list.length > 1 && (
        <div className="cine-banner-dots">
          {list.map((_, k) => (
            <button key={k} className={k === i ? 'on' : ''} aria-label={`Destacado ${k + 1}`} onClick={() => setI(k)} />
          ))}
        </div>
      )}
    </section>
  );
}
