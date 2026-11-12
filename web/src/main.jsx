import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import Landing from './Landing.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import { initPwa } from './pwa.js';

const App = lazy(() => import('./App.jsx'));

function LoadingLiveTV() {
  return <div className="boot-screen" role="status">LiveTV</div>;
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingLiveTV />;
  if (!user) return <Landing />;
  return <Suspense fallback={<LoadingLiveTV />}><App /></Suspense>;
}

initPwa();

// Afiliados: si la app se abre con ?ref=<vendedor>, guardarlo para el registro.
try {
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref) localStorage.setItem('senal_ref', ref);
} catch { /* noop */ }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);
