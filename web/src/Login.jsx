import React, { useState } from 'react';
import { useAuth } from './auth.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(username.trim(), password);
      else await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m) { setMode(m); setError(null); }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="tally" aria-hidden="true" />
          <span className="wordmark">CineTV</span>
        </div>
        <p className="login-sub">Tu cine, tus series y toda la TV. En un solo lugar.</p>

        {isRegister && (
          <div className="login-trial">
            🎁 Probá <strong>24 horas gratis</strong>. Creá tu cuenta y mirá al toque.
          </div>
        )}

        <label>
          Usuario
          <input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="tu usuario"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="login-btn" type="submit" disabled={busy || !username || !password}>
          {busy
            ? (isRegister ? 'Creando…' : 'Entrando…')
            : (isRegister ? 'Crear cuenta y probar gratis' : 'Entrar')}
        </button>

        <div className="login-switch">
          {isRegister ? (
            <>¿Ya tenés cuenta?{' '}
              <button type="button" onClick={() => switchMode('login')}>Iniciar sesión</button></>
          ) : (
            <>¿Primera vez?{' '}
              <button type="button" onClick={() => switchMode('register')}>Probar gratis 24 h</button></>
          )}
        </div>
      </form>
    </div>
  );
}
