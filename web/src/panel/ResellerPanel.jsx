import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

function daysLeft(expiresAt) {
  if (!expiresAt) return '∞';
  const d = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  return d;
}

export default function ResellerPanel({ user }) {
  const { refresh } = useAuth();
  const [tab, setTab] = useState('clientes');
  const [me, setMe] = useState(null);
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]);
  const [txs, setTxs] = useState([]);
  const [error, setError] = useState(null);

  const isAdmin = user.role === 'admin';

  async function loadAll() {
    setError(null);
    try {
      const [m, c, p] = await Promise.all([api.resellerMe(), api.clients(), api.packages()]);
      setMe(m); setClients(c); setPackages(p);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (tab === 'movimientos') api.transactions().then(setTxs).catch(() => {}); }, [tab]);

  const [subs, setSubs] = useState([]);
  const [ns, setNs] = useState({ username: '', password: '', credits: '' });
  useEffect(() => { if (tab === 'subvendedores') api.subresellers().then(setSubs).catch(() => {}); }, [tab]);

  async function createSub(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createSubreseller({ username: ns.username, password: ns.password, credits: Number(ns.credits) || 0 });
      setNs({ username: '', password: '', credits: '' });
      const [s, m] = await Promise.all([api.subresellers(), api.resellerMe()]);
      setSubs(s); setMe(m); await refresh();
    } catch (e) { setError(e.message); }
  }
  async function sellCredits(sub) {
    const v = window.prompt(`Vender saldo a "${sub.username}" (créditos). Negativo para recuperar.`, '10');
    if (v == null || v === '') return;
    try {
      await api.transferToSub(sub.id, Number(v));
      const [s, m] = await Promise.all([api.subresellers(), api.resellerMe()]);
      setSubs(s); setMe(m); await refresh();
    } catch (e) { setError(e.message); }
  }

  const [nc, setNc] = useState({ username: '', password: '', packageId: '' });
  useEffect(() => {
    if (packages.length && !nc.packageId) setNc((v) => ({ ...v, packageId: String(packages[0].id) }));
  }, [packages]);

  async function createClient(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createClient({ ...nc, packageId: Number(nc.packageId) });
      setNc({ username: '', password: '', packageId: String(packages[0]?.id || '') });
      await loadAll();
      await refresh();
    } catch (e) { setError(e.message); }
  }

  async function renew(cli) {
    const list = packages.map((p) => `${p.id}: ${p.name} (${p.credits} créd, ${p.durationDays}d)`).join('\n');
    const v = window.prompt(`Renovar "${cli.username}". Elegí paquete (id):\n${list}`, String(packages[0]?.id || ''));
    if (v == null) return;
    try { await api.renewClient(cli.id, Number(v)); await loadAll(); await refresh(); }
    catch (e) { setError(e.message); }
  }
  async function toggle(cli) {
    try { await api.setClientStatus(cli.id, cli.status === 'active' ? 'disabled' : 'active'); loadAll(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="panel">
      <div className="stat-grid compact">
        <div className="stat accent">
          <div className="stat-value">{isAdmin ? '∞' : (me?.credits ?? '—')}</div>
          <div className="stat-label">Créditos</div>
        </div>
        <div className="stat">
          <div className="stat-value">{me?.clients ?? '—'}</div>
          <div className="stat-label">Clientes</div>
        </div>
        <div className="stat">
          <div className="stat-value">{me?.clientsActive ?? '—'}</div>
          <div className="stat-label">Activos</div>
        </div>
      </div>

      <div className="panel-tabs">
        <button className={tab === 'clientes' ? 'on' : ''} onClick={() => setTab('clientes')}>Clientes</button>
        <button className={tab === 'subvendedores' ? 'on' : ''} onClick={() => setTab('subvendedores')}>Sub-vendedores</button>
        <button className={tab === 'movimientos' ? 'on' : ''} onClick={() => setTab('movimientos')}>Movimientos</button>
      </div>

      {error && <div className="banner error">{error}</div>}

      {tab === 'clientes' && (
        <>
          <form className="row-form" onSubmit={createClient}>
            <input placeholder="usuario" value={nc.username}
              onChange={(e) => setNc({ ...nc, username: e.target.value })} required />
            <input placeholder="contraseña" value={nc.password}
              onChange={(e) => setNc({ ...nc, password: e.target.value })} required />
            <select value={nc.packageId} onChange={(e) => setNc({ ...nc, packageId: e.target.value })}>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.credits} créd</option>
              ))}
            </select>
            <button className="verify" type="submit">+ Cliente</button>
          </form>
          <div className="table clients">
            <div className="tr th">
              <span>Usuario</span><span>Paquete</span><span>Vence</span><span>Conex.</span><span>Estado</span><span>Acciones</span>
            </div>
            {clients.map((c) => {
              const dl = daysLeft(c.expiresAt);
              const expired = typeof dl === 'number' && dl <= 0;
              return (
                <div className="tr" key={c.id}>
                  <span className="strong">{c.username}</span>
                  <span>{c.packageName || '—'}</span>
                  <span className={`mono ${expired ? 'danger' : ''}`}>{expired ? 'vencida' : `${dl}d`}</span>
                  <span className="mono">{c.maxConnections}</span>
                  <span><span className={`badge ${c.status === 'active' && !expired ? 'ok' : 'off'}`}>
                    {c.status === 'active' ? (expired ? 'vencido' : 'activo') : 'off'}</span></span>
                  <span className="actions">
                    <button onClick={() => renew(c)}>Renovar</button>
                    <button onClick={() => toggle(c)}>{c.status === 'active' ? 'Deshab.' : 'Activar'}</button>
                  </span>
                </div>
              );
            })}
            {clients.length === 0 && <div className="tr empty">Sin clientes todavía.</div>}
          </div>
        </>
      )}

      {tab === 'subvendedores' && (
        <>
          <form className="row-form" onSubmit={createSub}>
            <input placeholder="usuario" value={ns.username}
              onChange={(e) => setNs({ ...ns, username: e.target.value })} required />
            <input placeholder="contraseña" value={ns.password}
              onChange={(e) => setNs({ ...ns, password: e.target.value })} required />
            <input type="number" min="0" placeholder="créditos" value={ns.credits}
              onChange={(e) => setNs({ ...ns, credits: e.target.value })} />
            <button className="verify" type="submit">+ Vendedor</button>
          </form>
          <div className="table">
            <div className="tr th">
              <span>Usuario</span><span>Créditos</span><span>Clientes</span><span>Estado</span><span>Acciones</span>
            </div>
            {subs.map((s) => (
              <div className="tr" key={s.id}>
                <span className="strong">{s.username}</span>
                <span className="mono">{s.credits}</span>
                <span className="mono">{s.clientCount}</span>
                <span><span className={`badge ${s.status === 'active' ? 'ok' : 'off'}`}>{s.status === 'active' ? 'activo' : 'off'}</span></span>
                <span className="actions"><button onClick={() => sellCredits(s)}>Vender saldo</button></span>
              </div>
            ))}
            {subs.length === 0 && <div className="tr empty">Sin sub-vendedores todavía.</div>}
          </div>
        </>
      )}

      {tab === 'movimientos' && (
        <div className="table tx">
          <div className="tr th"><span>Fecha</span><span>Tipo</span><span>Monto</span><span>Detalle</span></div>
          {txs.map((t) => (
            <div className="tr" key={t.id}>
              <span className="mono small">{new Date(t.at).toLocaleString('es')}</span>
              <span><span className={`badge ${t.type === 'spend' ? 'off' : 'ok'}`}>{t.type}</span></span>
              <span className="mono">{t.type === 'spend' ? '-' : '+'}{t.amount}</span>
              <span className="small">{t.note || '—'}</span>
            </div>
          ))}
          {txs.length === 0 && <div className="tr empty">Sin movimientos.</div>}
        </div>
      )}
    </div>
  );
}
