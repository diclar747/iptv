import React, { useEffect, useState } from 'react';
import { useAuth } from './auth.jsx';
import { subscribePwa, promptInstall } from './pwa.js';
import Login from './Login.jsx';
import Home from './views/Home.jsx';
import Catalog from './views/Catalog.jsx';
import Channels from './views/Channels.jsx';
import Search from './views/Search.jsx';
import Panel from './panel/Panel.jsx';
import TitleModal from './ui/TitleModal.jsx';

const roleLabel = (r) => ({ admin: 'Admin', reseller: 'Reseller', client: 'Cliente' }[r] || r);
const daysLeft = (e) => (e ? Math.ceil((new Date(e).getTime() - Date.now()) / 86400000) : null);

// Por ahora la app es SOLO canales (el VOD —Películas/Series/Infantil/Mi Lista—
// está desactivado). Para reactivarlo, restaurar esas entradas y sus rutas.
const NAV = [
  { k: 'inicio', label: 'Inicio', icon: '🏠' },
  { k: 'tv', label: 'TV en Vivo', icon: '🖥️' },
  { k: 'deportes', label: 'Deportes', icon: '⚽' },
  { k: 'documentales', label: 'Documentales', icon: '🎞️' },
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

  useEffect(() => subscribePwa(setPwa), []);
  useEffect(() => { if (user) { setView('inicio'); } }, [user?.id]);

  if (loading) return <div className="splash"><span className="tally" /><span className="wordmark">CineTV</span></div>;
  if (!user) return <Login />;

  const isStaff = user.role === 'admin' || user.role === 'reseller';
  const sub = user.subscription;
  const subInactive = user.role === 'client' && sub && !sub.active;

  const nav = [...NAV, ...(isStaff ? [{ k: 'panel', label: 'Panel', icon: '⚙️' }] : [])];

  function go(v, p = {}) { setView(v); setParams(p); setDrawer(false); setAccount(false); if (v !== 'buscar') setQuery(''); }
  function onOpen(item) { setModal(item); }
  function onSearch(q) { setQuery(q); setView(q ? 'buscar' : 'inicio'); }

  const content = subInactive ? (
    <div className="sub-blocked">
      <div className="offair-label" style={{ color: 'var(--bad)' }}>{sub.reason === 'expired' ? 'VENCIDA' : 'INACTIVA'}</div>
      <p>Tu suscripción {sub.reason === 'expired' ? 'venció' : 'está deshabilitada'}.<br />Contactá a tu proveedor.</p>
      <button className="hero-play" onClick={logout}>Salir</button>
    </div>
  ) : view === 'inicio' ? <Home onOpen={onOpen} onNavigate={go} onAuthError={refresh} />
    : view === 'tv' ? <Channels title="TV en Vivo" defaultCountry="PY" onOpen={onOpen} onAuthError={refresh} />
    : view === 'deportes' ? <Channels title="Deportes" fixedCategory="sports" defaultCountry="" onOpen={onOpen} onAuthError={refresh} />
    : view === 'documentales' ? <Channels title="Documentales" fixedCategory="documentary" defaultCountry="" onOpen={onOpen} onAuthError={refresh} />
    : view === 'buscar' ? <Search query={query} onOpen={onOpen} onAuthError={refresh} />
    : view === 'panel' && isStaff ? <Panel user={user} />
    : <Home onOpen={onOpen} onNavigate={go} onAuthError={refresh} />;

  return (
    <div className="app">
      {/* Sidebar (escritorio) / drawer (móvil) */}
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="side-logo"><span className="logo">▶</span> CineTV</div>
        <nav className="side-nav">
          {nav.map((n) => (
            <button key={n.k} className={`side-item ${view === n.k ? 'on' : ''}`} onClick={() => go(n.k)}>
              <span className="si-icon">{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {pwa.canInstall && !pwa.installed && (
            <button className="side-item" onClick={promptInstall}><span className="si-icon">↓</span> Instalar app</button>
          )}
          <button className="side-item" onClick={logout}><span className="si-icon">⏻</span> Salir</button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar2">
          <button className="hamb" onClick={() => setDrawer(true)} aria-label="Abrir menú" aria-expanded={drawer}>☰</button>
          <div className="search2">
            <span className="search2-i">🔍</span>
            <input value={query} onChange={(e) => onSearch(e.target.value)}
              aria-label="Buscar canales" placeholder="Buscar canales…" />
          </div>
          <div className="topbar2-right">
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
                    <div className="am-line">Vence en {daysLeft(user.expiresAt)} días</div>
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

      {modal && <TitleModal item={modal} user={user} onClose={() => setModal(null)} onAuthError={refresh} />}
    </div>
  );
}

