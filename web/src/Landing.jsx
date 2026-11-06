import React, { useEffect, useState } from 'react';
import { useAuth } from './auth.jsx';
import './landing.css';
import './landing-modern.css';
import LandingShowcase from './LandingShowcase.jsx';

// Landing pública (usuarios sin sesión): presenta el servicio al estilo de una
// plataforma de streaming y abre el modal de login/registro real. El acceso
// registro ofrece una prueba personal de 24 horas.

const WA_NUMBER = '595994854167'; // +595 994 854 167
const WA_LINK = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('¡Hola! Quiero suscribirme a LiveTV 📺')}`;
// APK servido desde nuestro propio servidor (web/public/cinetv.apk).
const APK_URL = '/cinetv.apk';

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
  return (
    <div className="lp-modal" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={isReg ? "Crear cuenta en LiveTV" : "Ingresar a LiveTV"} className="lp-auth" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="lp-auth-x" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="lp-auth-brand"><span className="lp-dot" />LiveTV</div>
        <div className="lp-auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!isReg} className={!isReg ? 'on' : ''} onClick={() => onMode('login')}>Iniciar sesión</button>
          <button type="button" role="tab" aria-selected={isReg} className={isReg ? 'on' : ''} onClick={() => onMode('register')}>Crear cuenta</button>
        </div>

        {isReg && <p className="lp-auth-note">Creá tu cuenta y disfrutá 24 horas gratis desde el registro. Después podés renovar por Gs. 27.500 al mes.</p>}

        <label className="lp-field">
          <span>Usuario</span>
          <input autoFocus autoComplete="username" value={username}
            onChange={(e) => setUsername(e.target.value)} placeholder="tu usuario" minLength={isReg?3:undefined} maxLength={40} required />
        </label>
        <label className="lp-field">
          <span>Contraseña</span>
          <input type="password" autoComplete={isReg ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={isReg?8:undefined} maxLength={128} required />
        </label>

        {error && <div className="lp-auth-err">{error}</div>}

        <button className="lp-btn lp-btn-red lp-btn-block" type="submit" disabled={busy || !username || !password}>
          {busy ? (isReg ? 'Creando…' : 'Entrando…') : (isReg ? 'Empezar mis 24 horas gratis' : 'Entrar')}
        </button>

        <button type="button" className="lp-btn lp-btn-ghost lp-btn-block" onClick={() => onMode(isReg?'login':'register')} disabled={busy}>
          {isReg?'Ya tengo cuenta · Iniciar sesión':'Crear mi cuenta · 24 horas gratis'}
        </button>

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
  const text = 'Televisión, películas y radios de Paraguay en LiveTV 📺';
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
  const [auth,setAuth]=useState({open:false,mode:'login',prefill:''});
  const openAuth=(mode,prefill='')=>setAuth({open:true,mode,prefill});
  return <><LandingShowcase openAuth={openAuth} whatsapp={WA_LINK} apk={APK_URL} share={<ShareBar/>}/><WhatsFab/><AuthModal open={auth.open} mode={auth.mode} prefill={auth.prefill} onMode={mode=>setAuth(a=>({...a,mode}))} onClose={()=>setAuth(a=>({...a,open:false}))}/></>;
}
