import React, { useState } from 'react';
import { useAuth } from './auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="tally" aria-hidden="true" />
          <span className="wordmark">CineTV</span>
        </div>
        <p className="login-sub">Tu cine, tus series y toda la TV. En un solo lugar.</p>

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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="login-btn" type="submit" disabled={busy || !username || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

