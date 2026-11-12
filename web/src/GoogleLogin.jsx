import React, { useEffect, useState } from 'react';
import './google-login.css';

const googleErrors = {
 unavailable: 'El ingreso con Google todavía no está configurado.',
 cancelled: 'Cancelaste el ingreso con Google. Podés volver a intentarlo.',
 existing: 'Ya existe una cuenta de LiveTV con ese correo. Ingresá con tu usuario y contraseña.',
 disabled: 'Esa cuenta de LiveTV está deshabilitada.',
 failed: 'No pudimos completar el ingreso con Google. Volvé a intentar.',
};
export function googleErrorMessage() {
 const code = new URLSearchParams(window.location.search).get('google');
 return Object.hasOwn(googleErrors, code) ? googleErrors[code] : null;
}

export default function GoogleLogin({ disabled }) {
 const [enabled, setEnabled] = useState(null);
 useEffect(() => {
  const controller = new AbortController();
  fetch('/api/auth/google/status', { signal: controller.signal }).then(response => response.json())
   .then(result => setEnabled(Boolean(result.enabled))).catch(() => { if (!controller.signal.aborted) setEnabled(false); });
  return () => controller.abort();
 }, []);
 function openGoogle() {
  const params = new URLSearchParams();
  try {
   const referral = new URLSearchParams(window.location.search).get('ref') || localStorage.getItem('senal_ref');
   if (referral) params.set('ref', referral);
  } catch { /* Referrals are optional. */ }
  window.location.assign('/api/auth/google/start?' + params);
 }
 return <div className="google-login">
  <button type="button" className="google-login-button" disabled={disabled || enabled !== true} onClick={openGoogle}>
   <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.7-.4-4H24v7.6h11a9.4 9.4 0 0 1-4.1 6.2v5h6.5c3.8-3.5 6.2-8.6 6.2-14.8z"/>
    <path fill="#34A853" d="M24 44c5.4 0 10-1.8 13.4-4.9l-6.5-5a12 12 0 0 1-6.9 2c-5.3 0-9.7-3.6-11.3-8.4H6v5.2A20 20 0 0 0 24 44z"/>
    <path fill="#FBBC05" d="M12.7 27.7a12 12 0 0 1 0-7.4v-5.2H6a20 20 0 0 0 0 17.8l6.7-5.2z"/>
    <path fill="#EA4335" d="M24 11.9c2.9 0 5.5 1 7.6 3l5.7-5.7A19.2 19.2 0 0 0 24 4 20 20 0 0 0 6 15.1l6.7 5.2A12 12 0 0 1 24 11.9z"/>
   </svg>
   Continuar con Google
  </button>
  {enabled === false && <small>Ingreso con Google pendiente de activación.</small>}
 </div>;
}
