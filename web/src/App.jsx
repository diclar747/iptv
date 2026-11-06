import React, { useEffect, useState } from 'react';
import { useAuth } from './auth.jsx';
import { api } from './api.js';
import { subscribePwa, promptInstall } from './pwa.js';
import Landing from './Landing.jsx';
import Home from './views/Home.jsx';
import Catalog from './views/Catalog.jsx';
import Channels from './views/Channels.jsx';
import Search from './views/Search.jsx';
import Perfil from './views/Perfil.jsx';
import Panel from './panel/Panel.jsx';
import Radios from './views/Radios.jsx';
import TitleModal from './ui/TitleModal.jsx';
import Icon from './ui/Icon.jsx';

const roleLabel = (r) => ({ admin: 'Admin', reseller: 'Reseller', client: 'Cliente' }[r] || r);
// Tiempo restante legible: horas si falta poco (prueba 24h), si no días.
const timeLeft = (e) => {
  if (!e) return null;
  const ms = new Date(e).getTime() - Date.now();
  if (ms <= 0) return 'vencido';
  const h = Math.ceil(ms / 3600000);
  return h <= 48 ? `${h} h` : `${Math.ceil(h / 24)} días`;
};

// Por ahora la app es SOLO canales (el VOD —Películas/Series/Infantil/Mi Lista—
// está desactivado). Para reactivarlo, restaurar esas entradas y sus rutas.
const NAV = [
  { k: 'inicio', label: 'Inicio', icon: 'home' },
  { k: 'peliculas', label: 'Películas', icon: 'film' },
  { k: 'tv', label: 'TV en Vivo', icon: 'live' },
  { k: 'radios', label: 'Radios', icon: 'live' },
  { k: 'deportes', label: 'Deportes', icon: 'sports' },
  { k: 'milista', label: 'Mi Lista', icon: 'list' },
  { k: 'perfil', label: 'Perfil', icon: 'user' },
];

// Barra de navegación inferior (móvil, estilo app).
const BOTTOM = [
  { k: 'inicio', label: 'Inicio', icon: 'home' },
  { k: 'peliculas', label: 'Pelis', icon: 'film' },
  { k: 'tv', label: 'En Vivo', icon: 'live' },
  { k: 'radios', label: 'Radios', icon: 'live' },
];

export default function App() {
  const { user, loading, logout, refresh } = useAuth();
  const [view, setView] = useState('inicio');
  const [params, setParams] = useState({});
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [account, setAccount] = useState(false);
  const [pwa, setPwa] = useState({ canInstall: false, installed: false });
  const [geo, setGeo] = useState('PY'); // país detectado por IP (para TV en Vivo)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('cinetv:nav') === '1'; } catch { return false; }
  });
  const [fs, setFs] = useState(false); // pantalla completa

  useEffect(() => subscribePwa(setPwa), []);
  useEffect(() => {
    if (user) {
      setView('inicio');
      api.geo().then((r) => r?.country && setGeo(r.country)).catch(() => {});
    }
  }, [user?.id]);

  useEffect(()=>{if(!user)return;let alive=true;const q=new URLSearchParams(window.location.search),id=q.get('play'),type=q.get('type');if(id&&type==='channel')setModal({type:'channel',id,name:id});if(id&&type==='radio')api.radioStatuses(id).then(r=>{const radio=r.find(s=>s.id===id);if(alive&&radio)setModal({...radio,type:'radio'});}).catch(()=>{});return()=>{alive=false;};},[user?.id]);
  // Pantalla completa de toda la app.
  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  // Minimizar / expandir el menú lateral (solo iconos).
  function toggleCollapsed() {
    setCollapsed((v) => {
      const n = !v;
      try { localStorage.setItem('cinetv:nav', n ? '1' : '0'); } catch { /* noop */ }
      return n;
    });
  }

  if (loading) return (
    <div className="splash">
      <div className="splash-logo"><span className="tally" /><span className="wordmark">LIVE</span></div>
      <div className="splash-tag">TV EN VIVO</div>
    </div>
  );
  if (!user) return <Landing />;

  const isStaff = user.role === 'admin' || user.role === 'reseller';
  const sub = user.subscription;
  const subInactive = user.role === 'client' && sub && !sub.active;

  const nav = [...NAV, ...(isStaff ? [{ k: 'panel', label: 'Panel', icon: 'gear' }] : [])];

  // Al navegar, cerrar el reproductor abierto (si no, el canal sigue sonando por detrás).
  function go(v, p = {}) { setView(v); setParams(p); setModal(null); setDrawer(false); setAccount(false); if (v !== 'buscar') setQuery(''); }
  function onOpen(item) { setModal(item); }
  function onSearch(q) { setQuery(q); setView(q ? 'buscar' : 'inicio'); }

  const content = subInactive ? (
    <div className="sub-blocked">
      <div className="offair-label" style={{ color: 'var(--bad)' }}>{sub.reason === 'expired' ? 'VENCIDA' : 'INACTIVA'}</div>
      <p>Tu suscripción {sub.reason === 'expired' ? 'venció' : 'está deshabilitada'}.<br />Contactá a tu proveedor.</p>
      <button className="hero-play" onClick={logout}>Salir</button>
    </div>
  ) : view === 'inicio' ? <Home onOpen={onOpen} onNavigate={go} onAuthError={refresh} />
    : view === 'peliculas' ? <Catalog mode="movies" title="Películas" onOpen={onOpen} onAuthError={refresh} />
    : view === 'series' ? <Catalog mode="series" title="Series" onOpen={onOpen} onAuthError={refresh} />
    : view === 'milista' ? <Catalog mode="mylist" title="Mi Lista" onOpen={onOpen} onAuthError={refresh} />
    : view === 'radios' ? <Radios onOpen={onOpen} />
    : view === 'tv' ? <Channels title="TV en Vivo" defaultCountry={geo} onOpen={onOpen} onAuthError={refresh} />
    : view === 'deportes' ? <Channels title="Deportes" fixedCategory="sports" defaultCountry="" onOpen={onOpen} onAuthError={refresh} />
    : view === 'documentales' ? <Channels title="Documentales" fixedCategory="documentary" defaultCountry="" onOpen={onOpen} onAuthError={refresh} />
    : view === 'perfil' ? <Perfil user={user} onLogout={logout} onNavigate={go} onAuthError={refresh} />
    : view === 'buscar' ? <Search query={query} onOpen={onOpen} onAuthError={refresh} />
    : view === 'panel' && isStaff ? <Panel user={user} />
    : <Home onOpen={onOpen} onNavigate={go} onAuthError={refresh} />;

  return (
    <div className={`app ${collapsed ? 'nav-collapsed' : ''}`}>
      {/* Sidebar (escritorio) / drawer (móvil) */}
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="side-head">
          <div className="side-logo"><span className="logo">▶</span><span className="side-brand">LiveTV</span></div>
          <button className="side-collapse" onClick={toggleCollapsed}
            title={collapsed ? 'Expandir menú' : 'Minimizar menú'}
            aria-label={collapsed ? 'Expandir menú' : 'Minimizar menú'}>
            <Icon name="collapse" size={20} />
          </button>
        </div>
        <nav className="side-nav">
          {nav.map((n) => (
            <button key={n.k} className={`side-item ${view === n.k ? 'on' : ''}`} onClick={() => go(n.k)} title={n.label}>
              <span className="si-icon"><Icon name={n.icon} size={22} /></span>
              <span className="si-label">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {pwa.canInstall && !pwa.installed && (
            <button className="side-item" onClick={promptInstall} title="Instalar app">
              <span className="si-icon"><Icon name="download" size={22} /></span><span className="si-label">Instalar app</span>
            </button>
          )}
          <button className="side-item" onClick={logout} title="Salir">
            <span className="si-icon"><Icon name="power" size={22} /></span><span className="si-label">Salir</span>
          </button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar2">
          <button className="hamb" onClick={() => setDrawer(true)} aria-label="Abrir menú" aria-expanded={drawer}>☰</button>
          <div className="search2">
            <span className="search2-i"><Icon name="search" size={18} /></span>
            <input value={query} onChange={(e) => onSearch(e.target.value)}
              aria-label="Buscar canales" placeholder="Buscar canales…" />
          </div>
          <div className="topbar2-right">
            <button className="icon-btn fs-btn" onClick={toggleFullscreen}
              title={fs ? 'Salir de pantalla completa' : 'Pantalla completa'}
              aria-label={fs ? 'Salir de pantalla completa' : 'Pantalla completa'}>
              <Icon name="fullscreen" size={20} />
            </button>
            <div className="account">
              <button className="account-btn" aria-expanded={account} aria-label="Mi cuenta" onClick={() => setAccount((v) => !v)}>
                <span className="avatar">{user.username[0].toUpperCase()}</span>
                <span className="account-name">{user.username}</span>
                <span className="caret">▾</span>
              </button>
              {account && (
                <div className="account-menu">
                  <div className="am-head">
                    <strong>{user.username}</strong>
                    <span className="u-role">{roleLabel(user.role)}</span>
                  </div>
                  {user.role === 'reseller' && <div className="am-line">{user.credits} créditos</div>}
                  {user.role === 'client' && user.expiresAt && (
                    <div className="am-line">Vence en {timeLeft(user.expiresAt)}</div>
                  )}
                  {isStaff && <button onClick={() => go('panel')}>Panel de gestión</button>}
                  <button onClick={logout}>Cerrar sesión</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">{content}</main>
      </div>

      {/* Barra inferior estilo app (solo móvil; en escritorio manda el sidebar). */}
      <nav className="bottom-nav">
        {BOTTOM.map((n) => (
          <button key={n.k} className={`bn-item ${view === n.k ? 'on' : ''}`} onClick={() => go(n.k)}>
            <span className="bn-icon"><Icon name={n.icon} size={24} /></span>
            <span className="bn-label">{n.label}</span>
          </button>
        ))}
      </nav>

      {modal && <TitleModal item={modal} user={user} onClose={() => setModal(null)} onAuthError={refresh} />}
    </div>
  );
}
