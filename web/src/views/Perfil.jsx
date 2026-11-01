import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { promptInstall, subscribePwa } from '../pwa.js';

const roleLabel = (r) => ({ admin: 'Administrador', reseller: 'Vendedor', client: 'Cliente' }[r] || r);
const fmtGs = (n) => (n == null ? '' : new Intl.NumberFormat('es-PY').format(n));

// Perfil del usuario. El vendedor edita su marca/contacto, comparte su enlace
// de afiliado y fija sus precios de reventa (en guaraníes).
export default function Perfil({ user, onLogout, onNavigate, onAuthError }) {
  const isReseller = user.role === 'reseller';
  const isStaff = user.role === 'admin' || user.role === 'reseller';
  const [p, setP] = useState(null);
  const [form, setForm] = useState({ displayName: '', phone: '', address: '', logoUrl: '' });
  const [prices, setPrices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);
  const [pwa, setPwa] = useState({ canInstall: false, installed: false });

  useEffect(() => subscribePwa(setPwa), []);

  function handleErr(e) { if (e.status === 401) onAuthError?.(e); setMsg(e.message); }

  useEffect(() => {
    api.profile().then((d) => {
      setP(d);
      setForm({ displayName: d.displayName || '', phone: d.phone || '', address: d.address || '', logoUrl: d.logoUrl || '' });
    }).catch(handleErr);
    if (isReseller) api.resellerPrices().then(setPrices).catch(() => {});
  }, []);

  async function save() {
    setSaving(true); setMsg(null);
    try { const d = await api.updateProfile(form); setP(d); setMsg('Perfil guardado ✓'); }
    catch (e) { handleErr(e); } finally { setSaving(false); }
  }

  // Elige una imagen, la redimensiona a ~256px y la guarda como data URL
  // (así no hace falta un servidor de archivos aparte).
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

      {isReseller && (
        <>
          <div className="profile-card">
            <h3 className="card-title">Mis datos</h3>
            <label className="fld">Nombre / Negocio
              <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Ej: SEÑAL Paraguay" /></label>
            <label className="fld">Teléfono / WhatsApp
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Ej: 0981 123 456" /></label>
            <label className="fld">Dirección
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Ciudad, dirección" /></label>
            <div className="fld">Logo / Imagen
              <div className="logo-row">
                <div className="logo-prev">{form.logoUrl ? <img src={form.logoUrl} alt="" /> : <span>sin logo</span>}</div>
                <input ref={fileRef} type="file" accept="image/*" onChange={onLogoFile} hidden />
                <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Elegir imagen</button>
                {form.logoUrl && <button className="btn-ghost" onClick={() => setForm({ ...form, logoUrl: '' })}>Quitar</button>}
              </div>
            </div>
            <button className="btn-primary wide" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar datos'}</button>
            {msg && <div className="profile-msg">{msg}</div>}
          </div>

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
            <p className="muted">Tu costo es en créditos; poné el precio en guaraníes que le cobrás a tu cliente.</p>
            <div className="price-list">
              {prices.map((pk) => (
                <div className="price-row" key={pk.id}>
                  <div className="price-pkg">
                    <strong>{pk.name}</strong>
                    <span>{pk.credits} créd · {pk.durationDays} días · {pk.maxConnections} pant.</span>
                  </div>
                  <div className="price-in">
                    <span>₲</span>
                    <input type="number" min="0" step="1000" defaultValue={pk.price ?? ''} placeholder="0"
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
          <p className="muted">Para renovar o ampliar tu acceso, contactá a tu proveedor.</p>
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
