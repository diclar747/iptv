import React from 'react';

// Íconos SVG de línea (estilo app profesional). Usan currentColor, así que
// toman el color del texto (gris normal, rojo cuando está activo).
const BASE = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round',
};

const PATHS = {
  home: (
    <>
      <path d="M3 10.8 12 3.5l9 7.3" />
      <path d="M5.5 9.3V20.5h13V9.3" />
      <path d="M9.8 20.5v-6h4.4v6" />
    </>
  ),
  live: (
    <>
      <rect x="2.5" y="5" width="19" height="13" rx="2" />
      <path d="M8 21h8" />
      <path d="M10.6 9.3v5.4l4.3-2.7z" fill="currentColor" stroke="none" />
    </>
  ),
  sports: (
    <>
      <path d="M7 4.5h10v2.6a5 5 0 0 1-10 0z" />
      <path d="M7 5.3H4.6v1.3A2.8 2.8 0 0 0 7 9.2" />
      <path d="M17 5.3h2.4v1.3A2.8 2.8 0 0 1 17 9.2" />
      <path d="M12 12.2v3.3" />
      <path d="M9 20h6" />
      <path d="M10.2 15.5h3.6l.5 4.5h-4.6z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.3" />
      <path d="M19.5 19.5 15 15" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  film: (
    <>
      <rect x="3.3" y="5.3" width="17.4" height="13.4" rx="2" />
      <path d="M3.3 9.6h17.4M3.3 14.4h17.4M7.6 5.3v13.4M16.4 5.3v13.4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.36 5.64l-1.84 1.84M7.48 16.52l-1.84 1.84M18.36 18.36l-1.84-1.84M7.48 7.48 5.64 5.64" />
    </>
  ),
  cast: (
    <>
      <path d="M3 6h18v12h-6" />
      <path d="M3 12a6 6 0 0 1 6 6" />
      <path d="M3 16a2.5 2.5 0 0 1 2.5 2.5" />
      <circle cx="3.4" cy="18.6" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  download: (
    <>
      <path d="M12 3.5v11" />
      <path d="M7.5 10 12 14.5 16.5 10" />
      <path d="M4.5 20.5h15" />
    </>
  ),
  power: (
    <>
      <path d="M12 3.5v8" />
      <path d="M6.6 6.6a8 8 0 1 0 10.8 0" />
    </>
  ),
};

export default function Icon({ name, size = 24, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...BASE} className={className} aria-hidden="true">
      {PATHS[name] || null}
    </svg>
  );
}
