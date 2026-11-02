// Orquestador del catálogo: provee el proveedor activo y controla la importación
// (paginada, reanudable por cursores, con stop/resume y registro de jobs).
import { TheTVDBProvider } from './thetvdb.js';
import { mapMovie, mapSeries, mapEpisode } from './map.js';
import * as repo from './repo.js';

const PROVIDER = 'thetvdb';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _provider = null;
export function getProvider() {
  if (!_provider) _provider = new TheTVDBProvider();
  return _provider;
}

// Estado de importación en memoria (una corrida a la vez).
const control = { running: false, kind: null, stop: false, jobId: null, note: null };

export function importStatus() {
  const p = getProvider();
  return {
    configured: p.isConfigured(),
    provider: p.id,
    running: control.running,
    kind: control.kind,
    note: control.note,
    apiCalls: p.calls,
    lastApiError: p.lastError,
  };
}

export function stopImport() { control.stop = true; return { stopping: control.running }; }

// Reinicia los cursores (empezar la importación desde cero).
export async function resetCursors() {
  await repo.saveCursor(PROVIDER, 'movies', { page: 0, done: false });
  await repo.saveCursor(PROVIDER, 'series', { page: 0, done: false });
}

// Importa un tipo ('movies'|'series') desde el cursor guardado.
async function importKind(kind, { maxItems = Infinity } = {}) {
  const p = getProvider();
  const jobId = await repo.startJob(PROVIDER, kind);
  control.jobId = jobId;
  let count = 0;
  try {
    let cur = await repo.getCursor(PROVIDER, kind);
    let page = cur.done ? 0 : (cur.page || 0); // si estaba completo, reempezar
    for (;;) {
      if (control.stop) break;
      const list = kind === 'movies' ? await p.listMovies(page) : await p.listSeries(page);
      if (!list.items.length) { await repo.saveCursor(PROVIDER, kind, { page: 0, done: true }); break; }

      for (const item of list.items) {
        if (control.stop || count >= maxItems) break;
        try {
          if (kind === 'movies') {
            const ext = await p.getMovieExtended(item.id).catch(() => item);
            await repo.upsertMovie(PROVIDER, mapMovie(ext || item));
          } else {
            const ext = await p.getSeriesExtended(item.id).catch(() => item);
            const mapped = mapSeries(ext || item);
            const eps = await collectEpisodes(p, item.id);
            await repo.upsertSeries(PROVIDER, mapped, eps);
          }
          count++;
          await repo.bumpJob(jobId, { created: 1 });
        } catch (e) {
          await repo.bumpJob(jobId, { errors: 1, lastError: String(e.message).slice(0, 180) });
        }
        await sleep(120); // pacing suave para no golpear la API
      }

      page = list.nextPage;
      await repo.saveCursor(PROVIDER, kind, { page, done: false });
      if (!list.hasMore || count >= maxItems) {
        if (!list.hasMore) await repo.saveCursor(PROVIDER, kind, { page: 0, done: true });
        break;
      }
    }
    await repo.finishJob(jobId, control.stop ? 'paused' : 'done');
  } catch (e) {
    await repo.bumpJob(jobId, { errors: 1, lastError: String(e.message).slice(0, 180) });
    await repo.finishJob(jobId, 'error');
    throw e;
  }
  return count;
}

async function collectEpisodes(p, seriesId, { maxPages = 6 } = {}) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const { episodes, hasMore } = await p.getSeriesEpisodes(seriesId, 'default', page).catch(() => ({ episodes: [], hasMore: false }));
    for (const e of episodes) out.push(mapEpisode(e));
    if (!hasMore) break;
    await sleep(80);
  }
  return out;
}

// Arranca una importación en segundo plano. No bloquea la request.
export async function startImport({ movies = true, series = true, maxItems } = {}) {
  if (control.running) return { ok: false, error: 'Ya hay una importación en curso' };
  if (!getProvider().isConfigured()) return { ok: false, error: 'TheTVDB sin API Key' };
  control.running = true; control.stop = false; control.note = 'importando';
  (async () => {
    try {
      if (movies) { control.kind = 'movies'; await importKind('movies', { maxItems }); }
      if (series && !control.stop) { control.kind = 'series'; await importKind('series', { maxItems }); }
      control.note = control.stop ? 'pausada' : 'completada';
    } catch (e) {
      control.note = 'error: ' + e.message;
    } finally {
      control.running = false; control.kind = null; control.stop = false; control.jobId = null;
    }
  })();
  return { ok: true, started: true };
}

// Sincronización incremental: aplica /updates (títulos cambiados) desde el último
// corte. Reusa la importación por id. Liviana; pensada para correr periódicamente.
export async function syncUpdates({ maxItems = 500 } = {}) {
  const p = getProvider();
  if (!p.isConfigured()) return { ok: false, error: 'sin API Key' };
  if (control.running) return { ok: false, error: 'importación en curso' };
  const jobId = await repo.startJob(PROVIDER, 'updates');
  const cur = await repo.getCursor(PROVIDER, 'updates');
  const since = cur.since || Math.floor(Date.now() / 1000) - 7 * 24 * 3600; // 7 días atrás por defecto
  let count = 0, page = 0;
  try {
    for (;;) {
      const upd = await p.getUpdates(since, page);
      for (const u of upd.items) {
        if (count >= maxItems) break;
        try {
          if (/movie/i.test(u.type)) {
            const ext = await p.getMovieExtended(u.externalId).catch(() => null);
            if (ext) { await repo.upsertMovie(PROVIDER, mapMovie(ext)); count++; await repo.bumpJob(jobId, { updated: 1 }); }
          } else if (/series/i.test(u.type)) {
            const ext = await p.getSeriesExtended(u.externalId).catch(() => null);
            if (ext) { await repo.upsertSeries(PROVIDER, mapSeries(ext), await collectEpisodes(p, u.externalId)); count++; await repo.bumpJob(jobId, { updated: 1 }); }
          }
        } catch (e) { await repo.bumpJob(jobId, { errors: 1, lastError: String(e.message).slice(0, 180) }); }
        await sleep(100);
      }
      if (!upd.hasMore || count >= maxItems) break;
      page = upd.nextPage;
    }
    await repo.saveCursor(PROVIDER, 'updates', { since: Math.floor(Date.now() / 1000), page: 0 });
    await repo.finishJob(jobId, 'done');
  } catch (e) {
    await repo.finishJob(jobId, 'error');
    return { ok: false, error: e.message };
  }
  return { ok: true, updated: count };
}
