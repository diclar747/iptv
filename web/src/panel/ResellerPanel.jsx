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

  // --- Solicitar saldo (al admin / vendedor padre) ---
  const [myReqs, setMyReqs] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [askAmt, setAskAmt] = useState('');
  const [asking, setAsking] = useState(false);
  async function loadReqs() {
    try {
      const [mine, inc] = await Promise.all([api.myCreditRequests(), api.resellerCreditRequests()]);
      setMyReqs(mine); setIncoming(inc);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { if (!isAdmin) loadReqs(); }, []);
  useEffect(() => { if (tab === 'solicitudes') loadReqs(); }, [tab]);
  const myPending = myReqs.find((r) => r.kind === 'credits' && r.status === 'pending');
  const incPending = incoming.filter((r) => r.status === 'pending').length;

  async function requestCredits(e) {
    e?.preventDefault();
    const amount = parseInt(askAmt, 10);
    if (!amount || amount <= 0) return;
    setError(null);
    try { await api.createCreditRequest({ kind: 'credits', amount }); setAskAmt(''); setAsking(false); await loadReqs(); }
    catch (e) { setError(e.message); }
  }
  async function resolveReq(r, ok) {
    try {
      await (ok ? api.approveCreditRequest(r.id) : api.rejectCreditRequest(r.id));
      await Promise.all([loadReqs(), loadAll()]); await refresh();
    } catch (e) { setError(e.message); }
  }

  // --- Sub-vendedores ---
  const [subs, setSubs] = useState([]);
  const [ns, setNs] = useState({ username: '', password: '', credits: '' });
  const [editSell, setEditSell] = useState({ id: null, value: '' });
  useEffect(() => { if (tab === 'subvendedores') api.subresellers().then(setSubs).catch(() => {}); }, [tab]);

  async function createSub(e) {
    e.preventDefault(); setError(null);
    try {
      await api.createSubreseller({ username: ns.username, password: ns.password, credits: Number(ns.credits) || 0 });
      setNs({ username: '', password: '', credits: '' });
      const [s, m] = await Promise.all([api.subresellers(), api.resellerMe()]);
      setSubs(s); setMe(m); await refresh();
    } catch (e) { setError(e.message); }
  }
  async function sellCredits(sub) {
    const v = parseInt(editSell.value, 10);
    if (!v) { setEditSell({ id: null, value: '' }); return; }
    try {
      await api.transferToSub(sub.id, v);
      setEditSell({ id: null, value: '' });
      const [s, m] = await Promise.all([api.subresellers(), api.resellerMe()]);
      setSubs(s); setMe(m); await refresh();
    } catch (e) { setError(e.message); }
  }

  // --- Clientes ---
  const [nc, setNc] = useState({ username: '', password: '', packageId: '' });
  const [editRenew, setEditRenew] = useState({ id: null, packageId: '' });
  useEffect(() => {
    if (packages.length && !nc.packageId) setNc((v) => ({ ...v, packageId: String(packages[0].id) }));
  }, [packages]);

  async function createClient(e) {
    e.preventDefault(); setError(null);
    try {
      await api.createClient({ ...nc, packageId: Number(nc.packageId) });
      setNc({ username: '', password: '', packageId: String(packages[0]?.id || '') });
      await loadAll(); await refresh();
    } catch (e) { setError(e.message); }
  }
  async function doRenew(cli) {
    const pid = Number(editRenew.packageId || packages[0]?.id);
    if (!pid) return;
    try { await api.renewClient(cli.id, pid); setEditRenew({ id: null, packageId: '' }); await loadAll(); await refresh(); }
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
          <div className="stat-label">Saldo</div>
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

      {!isAdmin && (
        <div className="ask-credits">
          {myPending ? (
            <span className="muted">Solicitud de <b>{myPending.amount}</b> de saldo pendiente ⏳</span>
          ) : asking ? (
            <form className="ask-row" onSubmit={requestCredits}>
              <input type="number" min="1" autoFocus placeholder="cantidad de saldo" value={askAmt}
                onChange={(e) => setAskAmt(e.target.value)} />
              <button className="verify" type="submit">Enviar solicitud</button>
              <button type="button" className="btn-ghost" onClick={() => { setAsking(false); setAskAmt(''); }}>Cancelar</button>
            </form>
          ) : (
            <button className="verify" onClick={() => setAsking(true)}>+ Solicitar saldo</button>
          )}
        </div>
      )}

      <div className="panel-tabs">
        <button className={tab === 'clientes' ? 'on' : ''} onClick={() => setTab('clientes')}>Clientes</button>
        <button className={tab === 'subvendedores' ? 'on' : ''} onClick={() => setTab('subvendedores')}>Sub-vendedores</button>
        {!isAdmin && (
          <button className={tab === 'solicitudes' ? 'on' : ''} onClick={() => setTab('solicitudes')}>
            Solicitudes{incPending ? <span className="tab-badge">{incPending}</span> : null}
          </button>
        )}
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
                <option key={p.id} value={p.id}>{p.name} · {p.credits} saldo</option>
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
                    {editRenew.id === c.id ? (
                      <>
                        <select value={editRenew.packageId || String(packages[0]?.id || '')}
                          onChange={(e) => setEditRenew({ id: c.id, packageId: e.target.value })}>
                          {packages.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.credits})</option>)}
                        </select>
                        <button onClick={() => doRenew(c)}>OK</button>
                        <button onClick={() => setEditRenew({ id: null, packageId: '' })}>✕</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditRenew({ id: c.id, packageId: String(packages[0]?.id || '') })}>Renovar</button>
                        <button onClick={() => toggle(c)}>{c.status === 'active' ? 'Deshab.' : 'Activar'}</button>
                      </>
                    )}
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
            <input type="number" min="0" placeholder="saldo" value={ns.credits}
              onChange={(e) => setNs({ ...ns, credits: e.target.value })} />
            <button className="verify" type="submit">+ Vendedor</button>
          </form>
          <div className="table">
            <div className="tr th">
              <span>Usuario</span><span>Saldo</span><span>Clientes</span><span>Estado</span><span>Acciones</span>
            </div>
            {subs.map((s) => (
              <div className="tr" key={s.id}>
                <span className="strong">{s.username}</span>
                <span className="mono">{s.credits}</span>
                <span className="mono">{s.clientCount}</span>
                <span><span className={`badge ${s.status === 'active' ? 'ok' : 'off'}`}>{s.status === 'active' ? 'activo' : 'off'}</span></span>
                <span className="actions">
                  {editSell.id === s.id ? (
                    <>
                      <input type="number" autoFocus value={editSell.value} placeholder="±saldo" style={{ width: 70 }}
                        onChange={(e) => setEditSell({ id: s.id, value: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && sellCredits(s)} />
                      <button onClick={() => sellCredits(s)}>OK</button>
                      <button onClick={() => setEditSell({ id: null, value: '' })}>✕</button>
                    </>
                  ) : (
                    <button onClick={() => setEditSell({ id: s.id, value: '' })}>Vender saldo</button>
                  )}
                </span>
              </div>
            ))}
            {subs.length === 0 && <div className="tr empty">Sin sub-vendedores todavía.</div>}
          </div>
        </>
      )}

      {tab === 'solicitudes' && !isAdmin && (
        <>
          <div className="label-mono" style={{ marginBottom: 8 }}>SOLICITUDES RECIBIDAS</div>
          <div className="table">
            <div className="tr th"><span>Fecha</span><span>Quién</span><span>Tipo</span><span>Saldo</span><span>Estado</span><span>Acciones</span></div>
            {incoming.map((r) => (
              <div className="tr" key={r.id}>
                <span className="mono small">{new Date(r.createdAt).toLocaleString('es-PY')}</span>
                <span className="strong">{r.requester}</span>
                <span>{r.kind === 'upgrade' ? 'Alta distribuidor' : 'Saldo'}</span>
                <span className="mono">{r.amount || '—'}</span>
                <span><span className={`badge ${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'off' : ''}`}>
                  {r.status === 'pending' ? 'pendiente' : r.status === 'approved' ? 'aprobada' : 'rechazada'}</span></span>
                <span className="actions">
                  {r.status === 'pending'
                    ? <><button className="verify" onClick={() => resolveReq(r, true)}>Aprobar</button>
                        <button onClick={() => resolveReq(r, false)}>Rechazar</button></>
                    : <span className="small muted">{r.note || '—'}</span>}
                </span>
              </div>
            ))}
            {incoming.length === 0 && <div className="tr empty">Sin solicitudes recibidas.</div>}
          </div>

          <div className="label-mono" style={{ margin: '18px 0 8px' }}>MIS SOLICITUDES</div>
          <div className="table">
            <div className="tr th"><span>Fecha</span><span>Tipo</span><span>Saldo</span><span>Estado</span></div>
            {myReqs.map((r) => (
              <div className="tr" key={r.id}>
                <span className="mono small">{new Date(r.createdAt).toLocaleString('es-PY')}</span>
                <span>{r.kind === 'upgrade' ? 'Alta distribuidor' : 'Saldo'}</span>
                <span className="mono">{r.amount || '—'}</span>
                <span><span className={`badge ${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'off' : ''}`}>
                  {r.status === 'pending' ? 'pendiente' : r.status === 'approved' ? 'aprobada' : 'rechazada'}</span></span>
              </div>
            ))}
            {myReqs.length === 0 && <div className="tr empty">No enviaste solicitudes.</div>}
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
