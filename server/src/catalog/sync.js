// Scheduler en proceso para la sincronización incremental (/updates). Sin BullMQ
// ni Redis: un interval simple, pausable por env. Solo corre si hay API Key.
import { syncUpdates, getProvider } from './index.js';

let timer = null;

export function startSyncScheduler() {
  if (timer) return;
  if (String(process.env.CATALOG_SYNC || 'true') === 'false') {
    console.log('[catalog] sync incremental desactivada (CATALOG_SYNC=false)');
    return;
  }
  if (!getProvider().isConfigured()) {
    console.log('[catalog] sync incremental en espera: sin THETVDB_API_KEY');
    return;
  }
  const min = Math.max(30, Number(process.env.CATALOG_SYNC_MINUTES || 360));
  timer = setInterval(() => {
    syncUpdates().then((r) => { if (r.ok) console.log(`[catalog] sync: ${r.updated} títulos`); }).catch(() => {});
  }, min * 60 * 1000);
  if (timer.unref) timer.unref();
  console.log(`[catalog] sync incremental cada ${min} min`);
}
