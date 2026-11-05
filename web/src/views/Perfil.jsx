import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { promptInstall, subscribePwa } from '../pwa.js';

const roleLabel = (r) => ({ admin: 'Administrador', reseller: 'Vendedor', client: 'Cliente' }[r] || r);
const fmtGs = (n) => (n == null ? '' : new Intl.NumberFormat('es-PY').format(n));

const EMPTY = {
  displayName: '', phone: '', address: '', logoUrl: '',
  bankName: '', bankHolder: '', bankAccount: '', bankAlias: '', bankDoc: '',
};

// Perfil del usuario. Staff (admin/vendedor) edita marca/contacto y datos
// bancarios; el vendedor comparte su enlace de afiliado y fija precios de
// reventa. Todos ven cómo pagarle a su proveedor; un cliente puede pedir
// convertirse en distribuidor.
export default function Perfil({ user, onLogout, onNavigate, onAuthError }) {
  const isReseller = user.role === 'reseller';
  const isAdmin = user.role === 'admin';
  const isStaff = isAdmin || isReseller;
  const [p, setP] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [prices, setPrices] = useState([]);
  const [provider, setProvider] = useState(null);
  const [upReq, setUpReq] = useState(null); // solicitud de alta como distribuidor
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);
  const [pwa, setPwa] = useState({ canInstall: false, installed: false });

  useEffect(() => subscribePwa(setPwa), []);

  function handleErr(e) { if (e.status === 401) onAuthError?.(e); setMsg(e.message); }
  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api.profile().then((d) => {
      setP(d);
      setForm({
        displayName: d.displayName || '', phone: d.phone || '', address: d.address || '', logoUrl: d.logoUrl || '',
        bankName: d.bankName || '', bankHolder: d.bankHolder || '', bankAccount: d.bankAccount || '',
        bankAlias: d.bankAlias || '', bankDoc: d.bankDoc || '',
      });
    }).catch(handleErr);
    if (isReseller) api.resellerPrices().then(setPrices).catch(() => {});
    if (!isAdmin) api.billingProvider().then(setProvider).catch(() => {});
    if (user.role === 'client') api.myCreditRequests().then((rs) => {
      setUpReq(rs.find((r) => r.kind === 'upgrade' && r.status === 'pending') || null);
    }).catch(() => {});
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try { const d = await api.updateProfile(form); setP(d); setMsg('Perfil guardado ✓'); }
    catch (e) { handleErr(e); } finally { setSaving(false); }
  }

  async function askUpgrade() {
    setMsg(null);
    try {
      const r = await api.createCreditRequest({ kind: 'upgrade', amount: 0, note: 'Quiero vender' });
      setUpReq(r); setMsg('Solicitud enviada ✓');
    } catch (e) { handleErr(e); }
  }

  // Elige una imagen, la redimensiona a ~256px y la guarda como data URL.
  function onLogoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256; let { width, height } = img;
        if (width > height && width > max) { height = (height * max) / width; width = max; }
        else if (height > max) { width = (width * max) / height; height = max; }
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        setForm((f) => ({ ...f, logoUrl: c.toDataURL('image/jpeg', 0.85) }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  const affiliateUrl = p?.affiliateCode ? `${window.location.origin}/?ref=${encodeURIComponent(p.affiliateCode)}` : null;
  function copyAff() {
    if (!affiliateUrl) return;
    navigator.clipboard?.writeText(affiliateUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  async function savePrice(pkg, value) {
    try {
      await api.setResellerPrice(pkg.id, value === '' ? null : value);
      setPrices((xs) => xs.map((x) => (x.id === pkg.id ? { ...x, price: value === '' ? null : Number(value) } : x)));
    } catch (e) { handleErr(e); }
  }

  if (!p) return <div className="view"><div className="view-head"><h2>Perfil</h2></div><div className="banner">Cargando…</div></div>;

  const providerHasBank = provider && (provider.bankName || provider.bankAccount || provider.bankAlias);

  return (
    <div className="view perfil">
      <div className="view-head"><h2>Perfil</h2></div>

      <div className="profile-card">
        <div className="profile-id">
          <div className="profile-avatar">
            {form.logoUrl ? <img src={form.logoUrl} alt="" /> : <span>{(p.displayName || p.username)[0].toUpperCase()}</span>}
          </div>
          <div>
            <div className="profile-name">{p.displayName || p.username}</div>
            <div className="profile-role">{roleLabel(p.role)} · {p.username}</div>
            {p.role === 'reseller' && <div className="profile-sub">{fmtGs(p.credits)} créditos</div>}
            {p.role === 'client' && p.expiresAt && (
              <div className="profile-sub">Vence: {new Date(p.expiresAt).toLocaleString('es-PY')}</div>
            )}
          </div>
        </div>
      </div>

      {isStaff && (
        <div className="profile-card">
          <h3 className="card-title">Mis datos</h3>
          <label className="fld">Nombre / Negocio
            <input value={form.displayName} onChange={upd('displayName')} placeholder="Ej: LiveTV Paraguay" /></label>
          <label className="fld">Teléfono / WhatsApp
            <input value={form.phone} onChange={upd('phone')} placeholder="Ej: 0981 123 456" /></label>
          <label className="fld">Dirección
            <input value={form.address} onChange={upd('address')} placeholder="Ciudad, dirección" /></label>
          <div className="fld">Logo / Imagen
            <div className="logo-row">
              <div className="logo-prev">{form.logoUrl ? <img src={form.logoUrl} alt="" /> : <span>sin logo</span>}</div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onLogoFile} hidden />
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Elegir imagen</button>
              {form.logoUrl && <button className="btn-ghost" onClick={() => setForm({ ...form, logoUrl: '' })}>Quitar</button>}
            </div>
          </div>

          <h3 className="card-title" style={{ marginTop: 18 }}>Datos bancarios</h3>
          <p className="muted">
            {isAdmin ? 'Tus distribuidores verán estos datos para pagarte el saldo por transferencia.'
              : 'Tus clientes verán estos datos para pagarte por transferencia.'}
          </p>
          <label className="fld">Banco
            <input value={form.bankName} onChange={upd('bankName')} placeholder="Ej: Banco Itaú" /></label>
          <label className="fld">Titular
            <input value={form.bankHolder} onChange={upd('bankHolder')} placeholder="Nombre del titular" /></label>
          <label className="fld">Nº de cuenta
            <input value={form.bankAccount} onChange={upd('bankAccount')} placeholder="Número de cuenta" /></label>
          <label className="fld">Alias
            <input value={form.bankAlias} onChange={upd('bankAlias')} placeholder="Alias de la cuenta" /></label>
          <label className="fld">Cédula / RUC
            <input value={form.bankDoc} onChange={upd('bankDoc')} placeholder="CI o RUC del titular" /></label>

          <button className="btn-primary wide" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar datos'}</button>
          {msg && <div className="profile-msg">{msg}</div>}
        </div>
      )}

      {/* Cómo pagarle a mi proveedor (distribuidor ve al admin; cliente ve a su vendedor) */}
      {!isAdmin && (
        <div className="profile-card">
          <h3 className="card-title">Cómo pagar{isReseller ? ' tu saldo' : ''}</h3>
          {providerHasBank ? (
            <>
              <p className="muted">Transferí a {provider.displayName || provider.username} y avisale con el comprobante.</p>
              <div className="bank-box">
                {provider.bankName && <div><span>Banco</span><b>{provider.bankName}</b></div>}
                {provider.bankHolder && <div><span>Titular</span><b>{provider.bankHolder}</b></div>}
                {provider.bankAccount && <div><span>Cuenta</span><b>{provider.bankAccount}</b></div>}
                {provider.bankAlias && <div><span>Alias</span><b>{provider.bankAlias}</b></div>}
                {provider.bankDoc && <div><span>CI/RUC</span><b>{provider.bankDoc}</b></div>}
                {provider.phone && <div><span>WhatsApp</span><b>{provider.phone}</b></div>}
              </div>
            </>
          ) : (
            <p className="muted">
              {provider?.phone
                ? <>Tu proveedor todavía no cargó sus datos bancarios. Contactalo: <b>{provider.phone}</b>.</>
                : 'Tu proveedor todavía no cargó sus datos de pago. Contactalo para renovar o ampliar tu acceso.'}
            </p>
          )}
        </div>
      )}

      {isReseller && (
        <>
          {affiliateUrl && (
            <div className="profile-card">
              <h3 className="card-title">Enlace de afiliado</h3>
              <p className="muted">Compartí este enlace: quien se registre por acá queda asignado a vos como cliente.</p>
              <div className="aff-row">
                <input readOnly value={affiliateUrl} onFocus={(e) => e.target.select()} />
                <button className="btn-primary" onClick={copyAff}>{copied ? '¡Copiado!' : 'Copiar'}</button>
              </div>
            </div>
          )}

          <div className="profile-card">
            <h3 className="card-title">Mis precios de reventa</h3>
            <p className="muted">Lo que le pagás al admin figura como referencia; poné el precio en guaraníes que le cobrás a tu cliente.</p>
            <div className="price-list">
              {prices.map((pk) => (
                <div className="price-row" key={pk.id}>
                  <div className="price-pkg">
                    <strong>{pk.name}</strong>
                    <span>
                      {pk.credits} créd · {pk.durationDays} días · {pk.maxConnections} pant.
                      {pk.adminPrice != null && <> · pagás ₲{fmtGs(pk.adminPrice)}</>}
                    </span>
                  </div>
                  <div className="price-in">
                    <span>₲</span>
                    <input type="number" min="0" step="1000"
                      defaultValue={pk.price ?? pk.suggestedPrice ?? ''} placeholder={fmtGs(pk.suggestedPrice) || '0'}
                      onBlur={(e) => savePrice(pk, e.target.value)} />
                  </div>
                </div>
              ))}
              {prices.length === 0 && <div className="muted">No hay paquetes activos todavía.</div>}
            </div>
          </div>
        </>
      )}

      {p.role === 'client' && (
        <div className="profile-card">
          <h3 className="card-title">¿Querés vender LiveTV?</h3>
          <p className="muted">Convertite en distribuidor: comprás saldo y revendés a tus propios clientes al precio que quieras.</p>
          {upReq
            ? <div className="profile-msg">Solicitud enviada ⏳ — esperando aprobación del administrador.</div>
            : <button className="btn-primary wide" onClick={askUpgrade}>Quiero ser distribuidor</button>}
          {msg && <div className="profile-msg">{msg}</div>}
        </div>
      )}

      <div className="profile-card actions">
        {isStaff && <button className="btn-ghost wide" onClick={() => onNavigate('panel')}>⚙️ Panel de gestión</button>}
        {pwa.canInstall && !pwa.installed && <button className="btn-ghost wide" onClick={promptInstall}>↓ Instalar app</button>}
        <button className="btn-danger wide" onClick={onLogout}>Cerrar sesión</button>
      </div>
    </div>
  );
}
