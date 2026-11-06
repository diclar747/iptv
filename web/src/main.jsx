import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { initPwa } from './pwa.js';
import './styles.css';
import {DialogProvider} from './ui/SystemDialog.jsx';

initPwa();

// Afiliados: si la app se abre con ?ref=<vendedor>, guardarlo para el registro.
try {
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref) localStorage.setItem('senal_ref', ref);
} catch { /* noop */ }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <DialogProvider><App /></DialogProvider>
    </AuthProvider>
  </React.StrictMode>
);
