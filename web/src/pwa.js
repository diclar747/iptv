// Registro del service worker y gestión del prompt de instalación.
// Expone un pequeño store para que la UI muestre el botón "Instalar app".

let deferredPrompt = null;
const listeners = new Set();
const state = { canInstall: false, installed: isStandalone() };

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function emit() {
  for (const fn of listeners) fn({ ...state });
}

export function subscribePwa(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

// Dispara el diálogo nativo de instalación (Android/desktop Chrome).
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  state.canInstall = false;
  emit();
  return outcome === 'accepted';
}

export function initPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((e) => {
        console.warn('[pwa] SW no registrado:', e.message);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    state.canInstall = true;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    state.installed = true;
    state.canInstall = false;
    emit();
  });
}
