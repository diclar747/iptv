import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import CatalogAdmin from './CatalogAdmin.jsx';

export default function AdminPanel() {
  const [tab, setTab] = useState('resumen');
  const [stats, setStats] = useState(null);
  const [resellers, setResellers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [error, setError] = useState(null);

  async function loadAll() {
    setError(null);
    try {
      const [s, r, p] = await Promise.all([api.adminStats(), api.resellers(), api.packages()]);
      setStats(s); setResellers(r); setPackages(p);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { loadAll(); }, []);

  // --- Formularios ---
  const [nr, setNr] = useState({ username: '', password: '', credits: 10 });
  async function createReseller(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createReseller({ ...nr, credits: Number(nr.credits) || 0 });
      setNr({ username: '', password: '', credits: 10 });
      loadAll();
    } catch (e) { setError(e.message); }
  }

  async function addCredits(r) {
    const v = window.prompt(`Créditos a sumar a "${r.username}" (negativo para restar):`, '10');
    if (v == null) return;
    try { await api.addCredits(r.id, parseInt(v, 10), 'Ajuste manual'); loadAll(); }
    catch (e) { setError(e.message); }
  }
  async function toggleReseller(r) {
    try { await api.setResellerStatus(r.id, r.status === 'active' ? 'disabled' : 'active'); loadAll(); }
    catch (e) { setError(e.message); }
  }

  const [np, setNp] = useState({ name: '', durationDays: 30, credits: 1, maxConnections: 1 });
  async function createPackage(e) {
    e.preventDefault();
    try {
      await api.createPackage({
        name: np.name,
        durationDays: Number(np.durationDays),
        credits: Number(np.credits),
        maxConnections: Number(np.maxConnections),
      });
      setNp({ name: '', durationDays: 30, credits: 1, maxConnections: 1 });
      loadAll();
    } catch (e) { setError(e.message); }
  }
  async function togglePackage(p) {
    try { await api.setPackageActive(p.id, !p.active); loadAll(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="panel">
      <div className="panel-tabs">
        <button className={tab === 'resumen' ? 'on' : ''} onClick={() => setTab('resumen')}>Resumen</button>
        <button className={tab === 'resellers' ? 'on' : ''} onClick={() => setTab('resellers')}>Resellers</button>
        <button className={tab === 'paquetes' ? 'on' : ''} onClick={() => setTab('paquetes')}>Paquetes</button>
        <button className={tab === 'catalogo' ? 'on' : ''} onClick={() => setTab('catalogo')}>Películas y Series</button>
      </div>

      {tab === 'catalogo' && <CatalogAdmin />}

      {error && <div className="banner error">{error}</div>}

      {tab === 'resumen' && stats && (
        <div className="stat-grid">
          <Stat label="Resellers" value={stats.resellers} />
          <Stat label="Clientes" value={stats.clients} />
          <Stat label="Clientes activos" value={stats.clients_active} accent />
          <Stat label="Créditos en circulación" value={stats.credits_in_circulation} />
          <Stat label="Paquetes activos" value={stats.packages} />
        </div>
      )}

      {tab === 'resellers' && (
        <>
          <form className="row-form" onSubmit={createReseller}>
            <input placeholder="usuario" value={nr.username}
              onChange={(e) => setNr({ ...nr, username: e.target.value })} required />
            <input placeholder="contraseña" value={nr.password}
              onChange={(e) => setNr({ ...nr, password: e.target.value })} required />
            <input type="number" placeholder="créditos" value={nr.credits} min="0" style={{ width: 90 }}
              onChange={(e) => setNr({ ...nr, credits: e.target.value })} />
            <button className="verify" type="submit">+ Reseller</button>
          </form>
          <div className="table">
            <div className="tr th">
              <span>Usuario</span><span>Créditos</span><span>Clientes</span><span>Estado</span><span>Acciones</span>
            </div>
            {resellers.map((r) => (
              <div className="tr" key={r.id}>
                <span className="strong">{r.username}</span>
                <span className="mono">{r.credits}</span>
                <span className="mono">{r.clientCount}</span>
                <span><Badge ok={r.status === 'active'}>{r.status === 'active' ? 'activo' : 'off'}</Badge></span>
                <span className="actions">
                  <button onClick={() => addCredits(r)}>+ créd.</button>
                  <button onClick={() => toggleReseller(r)}>{r.status === 'active' ? 'Deshab.' : 'Activar'}</button>
                </span>
              </div>
            ))}
            {resellers.length === 0 && <div className="tr empty">Sin resellers todavía.</div>}
          </div>
        </>
      )}

      {tab === 'paquetes' && (
        <>
          <form className="row-form" onSubmit={createPackage}>
            <input placeholder="nombre" value={np.name}
              onChange={(e) => setNp({ ...np, name: e.target.value })} required />
            <input type="number" placeholder="días" value={np.durationDays} min="1" style={{ width: 80 }}
              onChange={(e) => setNp({ ...np, durationDays: e.target.value })} />
            <input type="number" placeholder="créditos" value={np.credits} min="0" style={{ width: 90 }}
              onChange={(e) => setNp({ ...np, credits: e.target.value })} />
            <input type="number" placeholder="conex." value={np.maxConnections} min="1" style={{ width: 80 }}
              onChange={(e) => setNp({ ...np, maxConnections: e.target.value })} />
            <button className="verify" type="submit">+ Paquete</button>
          </form>
          <div className="table">
            <div className="tr th">
              <span>Paquete</span><span>Días</span><span>Créditos</span><span>Conex.</span><span>Estado</span>
            </div>
            {packages.map((p) => (
              <div className="tr" key={p.id}>
                <span className="strong">{p.name}</span>
                <span className="mono">{p.durationDays}</span>
                <span className="mono">{p.credits}</span>
                <span className="mono">{p.maxConnections}</span>
                <span className="actions">
                  <button onClick={() => togglePackage(p)}>
                    <Badge ok={p.active}>{p.active ? 'activo' : 'off'}</Badge>
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`stat ${accent ? 'accent' : ''}`}>
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
function Badge({ ok, children }) {
  return <span className={`badge ${ok ? 'ok' : 'off'}`}>{children}</span>;
}
