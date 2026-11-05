import ChannelManager from './ChannelManager.jsx';
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import CatalogAdmin from './CatalogAdmin.jsx';

const fmtGs = (n) => (n == null ? '—' : '₲' + new Intl.NumberFormat('es-PY').format(n));

export default function AdminPanel() {
  const [tab, setTab] = useState('resumen');
  const [stats, setStats] = useState(null);
  const [resellers, setResellers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [requests, setRequests] = useState([]);
  const [manual, setManual] = useState([]);
  const [error, setError] = useState(null);

  async function loadAll() {
    setError(null);
    try {
      const [s, r, p] = await Promise.all([api.adminStats(), api.resellers(), api.packages()]);
      setStats(s); setResellers(r); setPackages(p);
    } catch (e) { setError(e.message); }
  }
  async function loadRequests() {
    try { setRequests(await api.adminCreditRequests()); } catch (e) { setError(e.message); }
  }
  async function loadManual() {
    try { setManual(await api.manualChannels()); } catch (e) { setError(e.message); }
  }
  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (tab === 'solicitudes') loadRequests(); }, [tab]);
  useEffect(() => { if (tab === 'canales') loadManual(); }, [tab]);

  const pending = requests.filter((r) => r.status === 'pending').length;

  // --- Resellers ---
  const [nr, setNr] = useState({ username: '', password: '', credits: 10 });
  async function createReseller(e) {
    e.preventDefault(); setError(null);
    try {
      await api.createReseller({ ...nr, credits: Number(nr.credits) || 0 });
      setNr({ username: '', password: '', credits: 10 }); loadAll();
    } catch (e) { setError(e.message); }
  }
  const [editCr, setEditCr] = useState({ id: null, value: '' }); // asignar créditos inline
  async function saveCredits(r) {
    const amount = parseInt(editCr.value, 10);
    if (!amount) { setEditCr({ id: null, value: '' }); return; }
    try { await api.addCredits(r.id, amount, 'Ajuste manual'); setEditCr({ id: null, value: '' }); loadAll(); }
    catch (e) { setError(e.message); }
  }
  async function toggleReseller(r) {
    try { await api.setResellerStatus(r.id, r.status === 'active' ? 'disabled' : 'active'); loadAll(); }
    catch (e) { setError(e.message); }
  }

  // --- Paquetes ---
  const [np, setNp] = useState({ name: '', durationDays: 30, credits: 1, maxConnections: 1, adminPrice: '', suggestedPrice: '' });
  async function createPackage(e) {
    e.preventDefault();
    try {
      await api.createPackage({
        name: np.name, durationDays: Number(np.durationDays), credits: Number(np.credits),
        maxConnections: Number(np.maxConnections),
        adminPrice: np.adminPrice === '' ? null : Number(np.adminPrice),
        suggestedPrice: np.suggestedPrice === '' ? null : Number(np.suggestedPrice),
      });
      setNp({ name: '', durationDays: 30, credits: 1, maxConnections: 1, adminPrice: '', suggestedPrice: '' });
      loadAll();
    } catch (e) { setError(e.message); }
  }
  async function togglePackage(p) {
    try { await api.setPackageActive(p.id, !p.active); loadAll(); }
    catch (e) { setError(e.message); }
  }
  async function savePkgPrice(p, field, value) {
    const num = value === '' ? null : Number(value);
    if ((p[field] ?? null) === num) return;
    try { await api.updatePackage(p.id, { [field]: num }); loadAll(); }
    catch (e) { setError(e.message); }
  }

  // --- Solicitudes ---
  async function resolveReq(r, ok) {
    try {
      await (ok ? api.approveCreditRequest(r.id) : api.rejectCreditRequest(r.id));
      await Promise.all([loadRequests(), loadAll()]);
    } catch (e) { setError(e.message); }
  }

  // --- Canales manuales ---
  const emptyMc = { name: '', streamUrl: '', logoUrl: '', userAgent: '', referrer: '', country: 'PY', category: 'sports' };
  const [nmc, setNmc] = useState(emptyMc);
  // Accesos rápidos: canales de Paraguay precargados (nombre + logo + categoría).
  // Solo falta pegarles la URL .m3u8 oficial y guardar.
  const presetsPY = [
    { name: 'GEN', logoUrl: 'https://i.imgur.com/vEMnZF4.png', category: 'sports' },
    { name: 'Tigo Sports', logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Tigo_Sports_2025.png/960px-Tigo_Sports_2025.png', category: 'sports' },
    { name: 'Conmebol TV 1', logoUrl: 'https://i.imgur.com/0MnTzFK.png', category: 'sports' },
    { name: 'Conmebol TV 2', logoUrl: 'https://i.imgur.com/AeQ1IRU.png', category: 'sports' },
    { name: 'Conmebol TV 3', logoUrl: 'https://i.imgur.com/i7czXKt.png', category: 'sports' },
    { name: 'Conmebol TV 4', logoUrl: 'https://i.imgur.com/GLX8MhD.png', category: 'sports' },
    { name: 'A24 Paraguay', logoUrl: 'https://i.imgur.com/XWBmjBk.png', category: 'news' },
    { name: 'TVS Encarnación', logoUrl: 'https://i.ibb.co/s14qLnR/TVS.png', category: 'general', streamUrl: 'https://twitch.tv/tvs_encarnacion' },
    { name: 'Telequince', logoUrl: 'https://i.imgur.com/og7xuqe.png', category: 'general' },
  ];
  const usePreset = (p) => setNmc({ ...emptyMc, name: p.name, logoUrl: p.logoUrl, streamUrl: p.streamUrl || '', country: 'PY', category: p.category || 'general' });
  async function createManual(e) {
    e.preventDefault(); setError(null);
    try { await api.createManualChannel(nmc); setNmc(emptyMc); loadManual(); }
    catch (e) { setError(e.message); }
  }
  async function toggleManual(c) {
    try { await api.updateManualChannel(c.id, { ...toMc(c), enabled: !c.enabled }); loadManual(); }
    catch (e) { setError(e.message); }
  }
  async function deleteManual(c) {
    if (!window.confirm(`¿Eliminar el canal "${c.name}"?`)) return;
    try { await api.deleteManualChannel(c.id); loadManual(); }
    catch (e) { setError(e.message); }
  }
  // Mapea la fila (snake_case del backend) al cuerpo que espera la API.
  const toMc = (c) => ({
    name: c.name, streamUrl: c.stream_url, logoUrl: c.logo_url, userAgent: c.user_agent,
    referrer: c.referrer, country: c.country, category: c.category, sort: c.sort,
  });

  return (
    <div className="panel">
      <div className="panel-tabs">
        <button className={tab === 'resumen' ? 'on' : ''} onClick={() => setTab('resumen')}>Resumen</button>
        <button className={tab === 'resellers' ? 'on' : ''} onClick={() => setTab('resellers')}>Distribuidores</button>
        <button className={tab === 'solicitudes' ? 'on' : ''} onClick={() => setTab('solicitudes')}>
          Solicitudes{pending ? <span className="tab-badge">{pending}</span> : null}
        </button>
        <button className={tab === 'paquetes' ? 'on' : ''} onClick={() => setTab('paquetes')}>Paquetes</button>
        <button className={tab === 'canales' ? 'on' : ''} onClick={() => setTab('canales')}>Canales</button>
        <button className={tab === 'catalogo' ? 'on' : ''} onClick={() => setTab('catalogo')}>Películas y Series</button>
      </div>

      {tab === 'catalogo' && <CatalogAdmin />}

      {error && <div className="banner error">{error}</div>}

      {tab === 'resumen' && stats && (
        <div className="stat-grid">
          <Stat label="Distribuidores" value={stats.resellers} />
          <Stat label="Clientes" value={stats.clients} />
          <Stat label="Clientes activos" value={stats.clients_active} accent />
          <Stat label="Saldo en circulación" value={stats.credits_in_circulation} />
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
            <input type="number" placeholder="saldo" value={nr.credits} min="0" style={{ width: 90 }}
              onChange={(e) => setNr({ ...nr, credits: e.target.value })} />
            <button className="verify" type="submit">+ Distribuidor</button>
          </form>
          <div className="table">
            <div className="tr th">
              <span>Usuario</span><span>Saldo</span><span>Clientes</span><span>Estado</span><span>Acciones</span>
            </div>
            {resellers.map((r) => (
              <div className="tr" key={r.id}>
                <span className="strong">{r.username}</span>
                <span className="mono">{r.credits}</span>
                <span className="mono">{r.clientCount}</span>
                <span><Badge ok={r.status === 'active'}>{r.status === 'active' ? 'activo' : 'off'}</Badge></span>
                <span className="actions">
                  {editCr.id === r.id ? (
                    <>
                      <input type="number" autoFocus value={editCr.value} placeholder="±saldo" style={{ width: 70 }}
                        onChange={(e) => setEditCr({ id: r.id, value: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && saveCredits(r)} />
                      <button onClick={() => saveCredits(r)}>OK</button>
                      <button onClick={() => setEditCr({ id: null, value: '' })}>✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditCr({ id: r.id, value: '' })}>+ saldo</button>
                      <button onClick={() => toggleReseller(r)}>{r.status === 'active' ? 'Deshab.' : 'Activar'}</button>
                    </>
                  )}
                </span>
              </div>
            ))}
            {resellers.length === 0 && <div className="tr empty">Sin distribuidores todavía.</div>}
          </div>
        </>
      )}

      {tab === 'solicitudes' && (
        <div className="table">
          <div className="tr th">
            <span>Fecha</span><span>Quién</span><span>Tipo</span><span>Saldo</span><span>Estado</span><span>Acciones</span>
          </div>
          {requests.map((r) => (
            <div className="tr" key={r.id}>
              <span className="mono small">{new Date(r.createdAt).toLocaleString('es-PY')}</span>
              <span className="strong">{r.requester}</span>
              <span>{r.kind === 'upgrade' ? 'Alta distribuidor' : 'Saldo'}</span>
              <span className="mono">{r.amount || '—'}</span>
              <span><Badge ok={r.status === 'approved'} off={r.status === 'rejected'}>
                {r.status === 'pending' ? 'pendiente' : r.status === 'approved' ? 'aprobada' : 'rechazada'}</Badge></span>
              <span className="actions">
                {r.status === 'pending' ? (
                  <>
                    <button className="verify" onClick={() => resolveReq(r, true)}>Aprobar</button>
                    <button onClick={() => resolveReq(r, false)}>Rechazar</button>
                  </>
                ) : <span className="small muted">{r.note || '—'}</span>}
              </span>
            </div>
          ))}
          {requests.length === 0 && <div className="tr empty">Sin solicitudes.</div>}
        </div>
      )}

      {tab === 'paquetes' && (
        <>
          <form className="row-form wrap" onSubmit={createPackage}>
            <input placeholder="nombre" value={np.name}
              onChange={(e) => setNp({ ...np, name: e.target.value })} required />
            <input type="number" placeholder="días" value={np.durationDays} min="1" style={{ width: 70 }}
              onChange={(e) => setNp({ ...np, durationDays: e.target.value })} />
            <input type="number" placeholder="saldo" value={np.credits} min="0" style={{ width: 70 }}
              onChange={(e) => setNp({ ...np, credits: e.target.value })} />
            <input type="number" placeholder="conex." value={np.maxConnections} min="1" style={{ width: 70 }}
              onChange={(e) => setNp({ ...np, maxConnections: e.target.value })} />
            <input type="number" placeholder="₲ al admin" value={np.adminPrice} min="0" step="1000" style={{ width: 100 }}
              onChange={(e) => setNp({ ...np, adminPrice: e.target.value })} />
            <input type="number" placeholder="₲ sugerido" value={np.suggestedPrice} min="0" step="1000" style={{ width: 100 }}
              onChange={(e) => setNp({ ...np, suggestedPrice: e.target.value })} />
            <button className="verify" type="submit">+ Paquete</button>
          </form>
          <p className="muted small" style={{ margin: '4px 2px 10px' }}>
            <b>₲ al admin</b> = lo que el distribuidor te paga. <b>₲ sugerido</b> = precio de referencia al público.
          </p>
          <div className="table pkg">
            <div className="tr th">
              <span>Paquete</span><span>Días</span><span>Saldo</span><span>₲ al admin</span><span>₲ sugerido</span><span>Estado</span>
            </div>
            {packages.map((p) => (
              <div className="tr" key={p.id}>
                <span className="strong">{p.name}</span>
                <span className="mono">{p.durationDays}</span>
                <span className="mono">{p.credits}</span>
                <span className="price-cell"><span>₲</span>
                  <input type="number" min="0" step="1000" defaultValue={p.adminPrice ?? ''} placeholder="0"
                    onBlur={(e) => savePkgPrice(p, 'adminPrice', e.target.value)} /></span>
                <span className="price-cell"><span>₲</span>
                  <input type="number" min="0" step="1000" defaultValue={p.suggestedPrice ?? ''} placeholder="0"
                    onBlur={(e) => savePkgPrice(p, 'suggestedPrice', e.target.value)} /></span>
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

      {tab === 'canales' && <ChannelManager />}
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
function Badge({ ok, off, children }) {
  return <span className={`badge ${ok ? 'ok' : off ? 'off' : ''}`}>{children}</span>;
}
