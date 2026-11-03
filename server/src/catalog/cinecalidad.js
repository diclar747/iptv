import { many, tx } from '../pg.js';
import * as repo from './repo.js';
import { fetchListing } from './cinecalidad-source.js';

const PROVIDER = 'cinecalidad';
const state = { running: false, stopping: false, page: 1, created: 0, skipped: 0, errors: 0, note: null };
export function cinecalidadStatus() { return { ...state }; }
export function stopCinecalidad() { state.stopping = state.running; return { ok: true }; }

export async function listCinecalidad(page) {
  const listing = await fetchListing(page);
  const existing = await many(`SELECT external_id FROM external_ids WHERE provider=$1 AND content_type='movie' AND external_id=ANY($2::text[])`,
    [PROVIDER, listing.items.map(i => i.externalId)]);
  const ids = new Set(existing.map(r => r.external_id));
  return { ...listing, items: listing.items.map(i => ({ ...i, imported: ids.has(i.externalId) })) };
}

async function saveMovie(item) {
  return tx(async client => {
    // Serialize this provider across server instances, including identity linking.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('cinecalidad-import'))");
    const found = await client.query(`SELECT internal_id FROM external_ids WHERE provider=$1 AND content_type='movie' AND external_id=$2`, [PROVIDER, item.externalId]);
    if (found.rows.length) return false;
    const same = item.year ? await client.query('SELECT id FROM movies WHERE lower(title)=lower($1) AND year=$2 ORDER BY id LIMIT 1', [item.title, item.year]) : { rows: [] };
    let id = same.rows[0]?.id;
    const created = !id;
    if (!id) {
      const result = await client.query(`INSERT INTO movies (title, year, poster, description, overview_es, category, rating, provider)
        VALUES ($1,$2,$3,$4,$4,$5,$6,$7) RETURNING id`,
      [item.title, item.year, item.poster, item.overview, item.genres[0]?.name || null, item.rating, PROVIDER]);
      id = result.rows[0].id;
      for (const genre of item.genres) {
        const result = await client.query('INSERT INTO genres (slug,name) VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id', [genre.slug, genre.name]);
        await client.query("INSERT INTO content_genres (content_type,content_id,genre_id) VALUES ('movie',$1,$2) ON CONFLICT DO NOTHING", [id, result.rows[0].id]);
      }
    }
    await client.query("INSERT INTO external_ids (provider,content_type,external_id,internal_id) VALUES ($1,'movie',$2,$3)", [PROVIDER, item.externalId, id]);
    return created;
  });
}

export function importCinecalidad({ resume = false } = {}) {
  if (state.running) return { ok: false, error: 'Ya hay una importación de Cinecalidad en curso' };
  Object.assign(state, { running: true, stopping: false, created: 0, skipped: 0, errors: 0, note: 'Iniciando…' });
  void run(resume).catch(error => { state.note = `Error: ${error.message}`; }).finally(() => { state.running = false; state.stopping = false; });
  return { ok: true, started: true };
}
async function run(resume) {
  let job;
  try {
    job = await repo.startJob(PROVIDER, 'movies');
    const cursor = await repo.getCursor(PROVIDER, 'movies');
    let page = resume && !cursor.done ? Math.max(1, cursor.page) : 1;
    for (;;) {
      state.page = page;
      state.note = `Leyendo página ${page}`;
      if (state.stopping) break;
      await repo.saveCursor(PROVIDER, 'movies', { page, done: false });
      const listing = await fetchListing(page);
      for (const item of listing.items) {
        if (state.stopping) break;
        const created = await saveMovie(item);
        if (created) { state.created++; await repo.bumpJob(job, { created: 1 }); }
        else state.skipped++;
      }
      // Keep the current page after stop/failure; idempotent retry includes all titles.
      await repo.saveCursor(PROVIDER, 'movies', { page: state.stopping ? page : page + 1, done: !state.stopping && !listing.hasMore });
      if (state.stopping || !listing.hasMore) break;
      page++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    state.note = state.stopping ? 'Pausada. Podés reanudar.' : 'Importación completada';
    await repo.finishJob(job, state.stopping ? 'paused' : 'done');
  } catch (error) {
    state.errors++;
    if (job) {
      await repo.bumpJob(job, { errors: 1, lastError: error.message });
      await repo.finishJob(job, 'error');
    }
    throw error;
  }
}
