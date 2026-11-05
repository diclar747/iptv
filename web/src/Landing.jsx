import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth.jsx';
import './landing.css';

// Landing pública (usuarios sin sesión): presenta el servicio al estilo de una
// plataforma de streaming y abre el modal de login/registro real. El acceso
// demo sigue disponible para probar.

const WA_NUMBER = '595994860527'; // +595 994 860 527
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('¡Hola! Quiero suscribirme a LiveTV 📺')}`;
const PRICE = '27.500';
// APK servido desde nuestro propio servidor (web/public/cinetv.apk).
const APK_URL = '/cinetv.apk';

// Muro de canales: nombres reales de aire de varios países + algunos "en vivo".
// Es la firma visual (videowall). Sin imágenes externas: tiles de marca.
const WALL = [
  ['Telefuturo', '🇵🇾', 1], ['SNT', '🇵🇾', 1], ['C9N', '🇵🇾', 1], ['Latele', '🇵🇾', 0], ['Paraguay TV', '🇵🇾', 0], ['Unicanal', '🇵🇾', 0],
  ['TN', '🇦🇷', 1], ['El Trece', '🇦🇷', 0], ['Telefe', '🇦🇷', 0], ['El Nueve', '🇦🇷', 1], ['C5N', '🇦🇷', 1], ['TyC Sports', '🇦🇷', 1], ['América', '🇦🇷', 0],
  ['Globo', '🇧🇷', 0], ['Band', '🇧🇷', 0], ['SBT', '🇧🇷', 0], ['Record', '🇧🇷', 0],
  ['Canal 10', '🇺🇾', 0], ['Teledoce', '🇺🇾', 0], ['Canal 4', '🇺🇾', 0],
  ['TVN', '🇨🇱', 0], ['Mega', '🇨🇱', 0], ['Chilevisión', '🇨🇱', 0],
  ['Las Estrellas', '🇲🇽', 0], ['Azteca', '🇲🇽', 0], ['Canal 5', '🇲🇽', 0],
  ['La 1', '🇪🇸', 0], ['Antena 3', '🇪🇸', 0], ['Telecinco', '🇪🇸', 0], ['La Sexta', '🇪🇸', 0],
  ['CNN', '🇺🇸', 1], ['ESPN', '🇺🇸', 1], ['Fox', '🇺🇸', 0], ['NBC', '🇺🇸', 0],
  ['DAZN', '🌎', 1], ['Gol', '🌎', 0], ['DW', '🇩🇪', 0], ['RT', '🌎', 0],
];

const FEATURES = [
  { icon: 'globe', title: 'Canales de aire del mundo', desc: 'Los canales abiertos de Paraguay, Argentina, Brasil, España, EE.UU. y más países, todos en un solo lugar.' },
  { icon: 'ball', title: 'Deportes en vivo', desc: 'El fútbol, los grandes partidos y el deporte las 24 horas, sin perderte nada.' },
  { icon: 'screens', title: 'En cualquier pantalla', desc: 'Teléfono, tablet, computadora y Smart TV. Proyectá a tu televisor con un toque.' },
  { icon: 'bolt', title: 'Sin instalación', desc: 'Sin antena, sin cables, sin decodificador. Entrás y mirás al instante.' },
];

const COUNTRIES = [
  ['🇵🇾', 'Paraguay'], ['🇦🇷', 'Argentina'], ['🇧🇷', 'Brasil'], ['🇺🇾', 'Uruguay'],
  ['🇨🇱', 'Chile'], ['🇲🇽', 'México'], ['🇪🇸', 'España'], ['🇺🇸', 'EE.UU.'],
];

const PLAN = [
  'Todos los canales de aire del mundo',
  'Deportes y noticias las 24 horas',
  'Mirá en teléfono, tablet, PC y Smart TV',
  'Proyección a Chromecast / Smart TV',
  'Sin contratos — cancelás cuando quieras',
  'Soporte directo por WhatsApp',
];

const FAQS = [
  ['¿Qué necesito para mirar?', 'Solo tu cuenta y conexión a internet. Funciona en el navegador del teléfono, la tablet, la computadora y la Smart TV. No hace falta instalar nada ni poner antena.'],
  ['¿Funciona en Smart TV?', 'Sí. Podés proyectar cualquier canal a tu televisor con Chromecast o AirPlay desde el botón de proyectar, estando en la misma red de wifi.'],
  ['¿Cuánto cuesta?', `El plan mensual cuesta ${PRICE} guaraníes e incluye todos los canales. Sin costos ocultos.`],
  ['¿Puedo probar antes de pagar?', 'Sí. Entrá con el acceso de prueba y recorré la plataforma antes de suscribirte.'],
  ['¿Cómo pago?', 'Escribinos por WhatsApp y te pasamos las formas de pago disponibles. Activamos tu cuenta al momento.'],
];

function LpIcon({ name }) {
  const p = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'globe': return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" /></svg>);
    case 'ball': return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7l4.5 3.3-1.7 5.3H9.2L7.5 10.3 12 7z" /></svg>);
    case 'screens': return (<svg {...p}><rect x="2.5" y="4.5" width="14" height="10" rx="1.5" /><rect x="15" y="9" width="6.5" height="10.5" rx="1.5" /><path d="M6 18h6" /></svg>);
    case 'bolt': return (<svg {...p}><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z" /></svg>);
    case 'check': return (<svg {...p} strokeWidth="2.4"><path d="M20 6L9 17l-5-5" /></svg>);
    default: return null;
  }
}

// Modal de login / registro conectado a la API real.
function AuthModal({ open, mode, onMode, onClose, prefill }) {
  const { login, register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const isReg = mode === 'register';

  useEffect(() => { if (open && prefill) setUsername(prefill); }, [open, prefill]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (isReg) await register(username.trim(), password);
      else await login(username.trim(), password);
    } catch (err) { setError(err.message); setBusy(false); }
  }
  async function demo() {
    setBusy(true); setError(null);
    try { await login('demo', 'demo'); }
    catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <div className="lp-modal" onClick={onClose}>
      <form className="lp-auth" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="lp-auth-x" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="lp-auth-brand"><span className="lp-dot" />LiveTV</div>
        <div className="lp-auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!isReg} className={!isReg ? 'on' : ''} onClick={() => onMode('login')}>Iniciar sesión</button>
          <button type="button" role="tab" aria-selected={isReg} className={isReg ? 'on' : ''} onClick={() => onMode('register')}>Crear cuenta</button>
        </div>

        {isReg && <p className="lp-auth-note">Creá tu cuenta y empezá a mirar. Probá la plataforma antes de suscribirte.</p>}

        <label className="lp-field">
          <span>Usuario</span>
          <input autoFocus autoComplete="username" value={username}
            onChange={(e) => setUsername(e.target.value)} placeholder="tu usuario" />
        </label>
        <label className="lp-field">
          <span>Contraseña</span>
          <input type="password" autoComplete={isReg ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </label>

        {error && <div className="lp-auth-err">{error}</div>}

        <button className="lp-btn lp-btn-red lp-btn-block" type="submit" disabled={busy || !username || !password}>
          {busy ? (isReg ? 'Creando…' : 'Entrando…') : (isReg ? 'Crear cuenta' : 'Entrar')}
        </button>

        <button type="button" className="lp-btn lp-btn-ghost lp-btn-block" onClick={demo} disabled={busy}>
          ▶ Entrar como prueba
        </button>

        <a className="lp-auth-wa" href={WA_LINK} target="_blank" rel="noopener noreferrer">
          ¿Querés suscribirte? Escribinos por WhatsApp
        </a>
      </form>
    </div>
  );
}

// Botón flotante de WhatsApp.
function WhatsFab() {
  return (
    <a className="lp-wa-fab" href={WA_LINK} target="_blank" rel="noopener noreferrer" aria-label="Escribinos por WhatsApp">
      <svg width="30" height="30" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
        <path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.6 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-4.9 1 1-4.8-.3-.4A9.8 9.8 0 016.2 15C6.2 9.6 10.6 5.2 16 5.2S25.8 9.6 25.8 15 21.4 24.8 16 24.8zm5.4-7.3c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.3 5.1 4.6 1.9.8 2.6.9 3.5.8.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4z" />
      </svg>
      <span className="lp-wa-txt">Escribinos</span>
    </a>
  );
}

// Barra para compartir la página en redes.
function ShareBar() {
  const url = (typeof window !== 'undefined' && window.location.origin) || 'https://live.cd.com.py';
  const text = 'Mirá toda la TV del mundo en vivo con LiveTV 📺';
  const enc = encodeURIComponent;
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title: 'LiveTV', text, url }); return; }
    } catch { /* usuario canceló */ }
    copy();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* noop */ }
  }

  const links = [
    { k: 'fb', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { k: 'wa', label: 'WhatsApp', href: `https://wa.me/?text=${enc(text + ' ' + url)}` },
    { k: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
  ];

  return (
    <div className="lp-share">
      <span className="lp-share-lbl">Compartí LiveTV</span>
      <div className="lp-share-row">
        {links.map((l) => (
          <a key={l.k} className={`lp-share-btn lp-sh-${l.k}`} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={`Compartir en ${l.label}`}>
            <ShareIcon name={l.k} />
          </a>
        ))}
        <button className="lp-share-btn lp-sh-ig" onClick={share} aria-label="Compartir en Instagram u otra app">
          <ShareIcon name="ig" />
        </button>
        <button className="lp-share-btn lp-sh-copy" onClick={copy} aria-label="Copiar enlace">
          <ShareIcon name="link" />
        </button>
      </div>
      {copied && <span className="lp-share-copied">¡Enlace copiado!</span>}
    </div>
  );
}

function ShareIcon({ name }) {
  const s = { width: 20, height: 20, viewBox: '0 0 24 24' };
  if (name === 'fb') return (<svg {...s} fill="currentColor"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1z" /></svg>);
  if (name === 'wa') return (<svg {...s} fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1112 20zm4.5-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 01-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.8.8-1 1.9-.6 3.1a11 11 0 004.9 4.4c1.6.7 2.3.6 3.1.5.5-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1l-.5-.3z" /></svg>);
  if (name === 'x') return (<svg {...s} fill="currentColor"><path d="M17.5 3h3l-6.6 7.6L22 21h-5.9l-4.3-5.6L6.8 21H3.8l7-8L2.5 3h6l3.9 5.1L17.5 3zm-1 16h1.6L8 4.6H6.3L16.5 19z" /></svg>);
  if (name === 'ig') return (<svg {...s} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg>);
  if (name === 'link') return (<svg {...s} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1" /><path d="M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1" /></svg>);
  return null;
}

export default function Landing() {
  const [auth, setAuth] = useState({ open: false, mode: 'login', prefill: '' });
  const [quick, setQuick] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [faq, setFaq] = useState(-1);
  const [appVer, setAppVer] = useState(''); // versión real del APK hospedado
  const revealRefs = useRef([]);

  const openAuth = (mode, prefill = '') => setAuth({ open: true, mode, prefill });

  // Versión del APK que está realmente arriba (misma que descarga el usuario).
  useEffect(() => {
    fetch('/api/app/version')
      .then((r) => r.json())
      .then((v) => v?.versionName && setAppVer(String(v.versionName)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Reveal al hacer scroll (respeta prefers-reduced-motion vía CSS).
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.14 });
    revealRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  const reveal = (el) => el && !revealRefs.current.includes(el) && revealRefs.current.push(el);

  // Columnas del muro de canales (reparte y duplica para loop sin cortes).
  const cols = [[], [], [], []];
  WALL.forEach((c, i) => cols[i % 4].push(c));

  function startQuick(e) {
    e.preventDefault();
    openAuth('register', quick.trim());
  }

  return (
    <div className="lp">
      {/* NAV */}
      <header className={`lp-nav ${scrolled ? 'solid' : ''}`}>
        <div className="lp-nav-in">
          <div className="lp-logo"><span className="lp-dot" />LiveTV</div>
          <div className="lp-nav-actions">
            <a className="lp-nav-link" href="#planes">Planes</a>
            <button className="lp-btn lp-btn-red" onClick={() => openAuth('login')}>Iniciar sesión</button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-wall" aria-hidden="true">
          {cols.map((col, ci) => (
            <div className={`lp-wall-col c${ci}`} key={ci}>
              {[...col, ...col, ...col].map((c, i) => (
                <div className="lp-bug" key={i}>
                  <span className="lp-bug-flag">{c[1]}</span>
                  <span className="lp-bug-name">{c[0]}</span>
                  {c[2] ? <span className="lp-bug-live">● VIVO</span> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="lp-hero-veil" aria-hidden="true" />

        <div className="lp-hero-in">
          <span className="lp-kicker">● TV en vivo · todo el mundo</span>
          <h1 className="lp-h1">Toda la TV<br />del mundo,<br /><em>en vivo.</em></h1>
          <p className="lp-lead">
            Canales de aire de todos los países, deportes y noticias las 24 horas.
            Sin antena, sin instalación. En tu teléfono, tablet, compu y Smart TV.
          </p>
          <form className="lp-quick" onSubmit={startQuick}>
            <input value={quick} onChange={(e) => setQuick(e.target.value)}
              placeholder="Elegí tu usuario para empezar" aria-label="Usuario" />
            <button className="lp-btn lp-btn-red lp-btn-lg" type="submit">Comenzar ›</button>
          </form>
          <div className="lp-hero-price">
            Desde <strong>{PRICE} Gs</strong> por mes · <button className="lp-link" onClick={() => openAuth('login')}>probá gratis</button>
          </div>
          <a className="lp-apk" href={APK_URL} download rel="noopener noreferrer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3.5v9m0 0 3.5-3.5M12 12.5 8.5 9M5 16.5v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Descargar app para Android
            {appVer && <span className="lp-apk-ver">versión {appVer}</span>}
          </a>
        </div>
      </section>

      {/* TIRA DE PAÍSES */}
      <section className="lp-strip">
        <span className="lp-strip-lbl">Canales de</span>
        <div className="lp-strip-row">
          {COUNTRIES.map(([f, n]) => (
            <span className="lp-flag" key={n}><b>{f}</b>{n}</span>
          ))}
          <span className="lp-flag lp-flag-more">+ muchos más</span>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-sec">
        <div className="lp-sec-head" ref={reveal}>
          <span className="lp-eyebrow">Por qué LiveTV</span>
          <h2 className="lp-h2">Todo lo que mirás, en un solo lugar</h2>
        </div>
        <div className="lp-feats">
          {FEATURES.map((f, i) => (
            <article className="lp-feat" key={f.title} ref={reveal} style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="lp-feat-ic"><LpIcon name={f.icon} /></span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* PRECIO */}
      <section className="lp-sec lp-price-sec" id="planes">
        <div className="lp-sec-head" ref={reveal}>
          <span className="lp-eyebrow">Un solo plan, todo incluido</span>
          <h2 className="lp-h2">Simple y sin vueltas</h2>
        </div>
        <div className="lp-plan" ref={reveal}>
          <div className="lp-plan-top">
            <span className="lp-plan-name">Plan LiveTV</span>
            <div className="lp-plan-price"><span className="lp-plan-amt">{PRICE}</span><span className="lp-plan-cur">Gs<br />/ mes</span></div>
          </div>
          <ul className="lp-plan-list">
            {PLAN.map((b) => (<li key={b}><span className="lp-tick"><LpIcon name="check" /></span>{b}</li>))}
          </ul>
          <button className="lp-btn lp-btn-red lp-btn-block lp-btn-lg" onClick={() => openAuth('register')}>Crear mi cuenta</button>
          <a className="lp-plan-wa" href={WA_LINK} target="_blank" rel="noopener noreferrer">o suscribite por WhatsApp</a>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-sec lp-faq-sec">
        <div className="lp-sec-head" ref={reveal}>
          <span className="lp-eyebrow">Preguntas frecuentes</span>
          <h2 className="lp-h2">¿Dudas? Te contamos</h2>
        </div>
        <div className="lp-faq">
          {FAQS.map(([q, a], i) => (
            <div className={`lp-faq-item ${faq === i ? 'open' : ''}`} key={q}>
              <button className="lp-faq-q" onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}>
                {q}<span className="lp-faq-ic">{faq === i ? '–' : '+'}</span>
              </button>
              <div className="lp-faq-a"><p>{a}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="lp-cta" ref={reveal}>
        <h2 className="lp-cta-h">Listo para mirar.<br />Empezá hoy.</h2>
        <button className="lp-btn lp-btn-red lp-btn-lg" onClick={() => openAuth('register')}>Crear cuenta gratis</button>
        <ShareBar />
      </section>

      {/* FOOTER */}
      <footer className="lp-foot">
        <div className="lp-foot-in">
          <div className="lp-logo"><span className="lp-dot" />LiveTV</div>
          <p className="lp-foot-tag">Toda la TV del mundo, en vivo.</p>
          <div className="lp-foot-links">
            <button className="lp-link" onClick={() => openAuth('login')}>Iniciar sesión</button>
            <button className="lp-link" onClick={() => openAuth('register')}>Crear cuenta</button>
            <a className="lp-link" href={WA_LINK} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a className="lp-link" href="#planes">Planes</a>
            <a className="lp-link" href={APK_URL} download>Descargar app{appVer ? ` (v${appVer})` : ''}</a>
          </div>
          <p className="lp-foot-copy">© {new Date().getFullYear()} LiveTV · Hecho en Paraguay 🇵🇾</p>
        </div>
      </footer>

      <WhatsFab />
      <AuthModal
        open={auth.open} mode={auth.mode} prefill={auth.prefill}
        onMode={(m) => setAuth((a) => ({ ...a, mode: m }))}
        onClose={() => setAuth((a) => ({ ...a, open: false }))}
      />
    </div>
  );
}
