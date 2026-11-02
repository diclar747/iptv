// Capa de base de datos del catálogo: upserts idempotentes (sin duplicados),
// deduplicando por external_ids (provider + tipo + id del proveedor).
import { query, one, many } from '../pg.js';

async function internalId(provider, type, externalId) {
  const r = await one(
    'SELECT internal_id FROM external_ids WHERE provider=$1 AND content_type=$2 AND external_id=$3',
    [provider, type, String(externalId)]
  );
  return r?.internal_id || null;
}
async function linkExternal(provider, type, externalId, id) {
  await query(
    `INSERT INTO external_ids (provider, content_type, external_id, internal_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (provider, content_type, external_id) DO UPDATE SET internal_id=EXCLUDED.internal_id`,
    [provider, type, String(externalId), id]
  );
}

async function genreId(slug, name) {
  const r = await one(
    'INSERT INTO genres (slug, name) VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id',
    [slug, name]
  );
  return r.id;
}
async function setGenres(type, id, genres) {
  await query('DELETE FROM content_genres WHERE content_type=$1 AND content_id=$2', [type, id]);
  for (const g of genres || []) {
    const gid = await genreId(g.slug, g.name);
    await query(
      'INSERT INTO content_genres (content_type, content_id, genre_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [type, id, gid]
    );
  }
}
async function setArtworks(type, id, arts) {
  await query('DELETE FROM artworks WHERE content_type=$1 AND content_id=$2', [type, id]);
  for (const a of (arts || []).slice(0, 12)) {
    await query('INSERT INTO artworks (content_type, content_id, kind, url, lang) VALUES ($1,$2,$3,$4,$5)',
      [type, id, a.kind, a.url, a.lang || null]);
  }
}
async function personId(name, photo) {
  const r = await one('SELECT id FROM people WHERE name=$1 LIMIT 1', [name]);
  if (r) { if (photo) await query('UPDATE people SET photo=COALESCE(photo,$2) WHERE id=$1', [r.id, photo]); return r.id; }
  return (await one('INSERT INTO people (name, photo) VALUES ($1,$2) RETURNING id', [name, photo || null])).id;
}
async function setCredits(type, id, cast) {
  await query('DELETE FROM content_credits WHERE content_type=$1 AND content_id=$2', [type, id]);
  let i = 0;
  for (const c of (cast || []).slice(0, 20)) {
    const pid = await personId(c.name, c.photo);
    await query(
      'INSERT INTO content_credits (content_type, content_id, person_id, role, char_name, sort) VALUES ($1,$2,$3,$4,$5,$6)',
      [type, id, pid, c.role || 'actor', c.character || null, i++]
    );
  }
}

const primaryGenre = (dto) => (dto.genres && dto.genres[0] && dto.genres[0].name) || null;

// Inserta o actualiza una película. Devuelve su id interno.
export async function upsertMovie(provider, dto) {
  let id = await internalId(provider, 'movie', dto.externalId);
  const cols = [dto.title, dto.year, dto.poster, dto.overview, primaryGenre(dto),
    provider, dto.originalTitle, dto.overview, dto.backdrop, dto.rating, dto.runtime,
    dto.country, dto.trailer, dto.rating || 0];
  if (id) {
    await query(
      `UPDATE movies SET title=$1, year=$2, poster=$3, description=$4, category=$5,
        provider=$6, original_title=$7, overview_es=$8, backdrop=$9, rating=$10,
        runtime=$11, country=$12, trailer=$13, popularity=$14, updated_at=now() WHERE id=$15`,
      [...cols, id]
    );
  } else {
    id = (await one(
      `INSERT INTO movies (title, year, poster, description, category, provider,
        original_title, overview_es, backdrop, rating, runtime, country, trailer, popularity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      cols
    )).id;
    await linkExternal(provider, 'movie', dto.externalId, id);
  }
  await setGenres('movie', id, dto.genres);
  await setArtworks('movie', id, dto.artworks);
  await setCredits('movie', id, dto.cast);
  return id;
}

// Inserta o actualiza una serie con sus temporadas y episodios.
export async function upsertSeries(provider, { series: dto, seasons = [] }, episodes = []) {
  let id = await internalId(provider, 'series', dto.externalId);
  const cols = [dto.title, dto.poster, dto.overview, primaryGenre(dto), provider,
    dto.originalTitle, dto.overview, dto.backdrop, dto.rating, dto.year, dto.country,
    dto.status, dto.trailer, dto.rating || 0];
  if (id) {
    await query(
      `UPDATE series SET title=$1, poster=$2, description=$3, category=$4, provider=$5,
        original_title=$6, overview_es=$7, backdrop=$8, rating=$9, year=$10, country=$11,
        status=$12, trailer=$13, popularity=$14, updated_at=now() WHERE id=$15`,
      [...cols, id]
    );
  } else {
    id = (await one(
      `INSERT INTO series (title, poster, description, category, provider, original_title,
        overview_es, backdrop, rating, year, country, status, trailer, popularity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      cols
    )).id;
    await linkExternal(provider, 'series', dto.externalId, id);
  }
  await setGenres('series', id, dto.genres);
  await setArtworks('series', id, dto.artworks);
  await setCredits('series', id, dto.cast);

  for (const s of seasons) {
    await query(
      `INSERT INTO seasons (series_id, number, title, overview, poster) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (series_id, number) DO UPDATE SET poster=COALESCE(EXCLUDED.poster, seasons.poster)`,
      [id, s.number, s.title || null, s.overview || null, s.poster || null]
    );
  }
  for (const e of episodes) {
    let eid = await internalId(provider, 'episode', e.externalId);
    const ecols = [id, e.season, e.episode, e.title, e.overview, e.still, e.airDate, e.runtime];
    if (eid) {
      await query(
        `UPDATE episodes SET series_id=$1, season=$2, episode=$3, title=$4, overview=$5,
          still=$6, air_date=$7, runtime=$8 WHERE id=$9`,
        [...ecols, eid]
      );
    } else {
      eid = (await one(
        `INSERT INTO episodes (series_id, season, episode, title, overview, still, air_date, runtime)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        ecols
      )).id;
      await linkExternal(provider, 'episode', e.externalId, eid);
    }
  }
  return id;
}

// Conteos para el panel admin.
export async function catalogStats() {
  const [m, s, e, src] = await Promise.all([
    one('SELECT count(*)::int n FROM movies'),
    one('SELECT count(*)::int n FROM series'),
    one('SELECT count(*)::int n FROM episodes'),
    one('SELECT count(*)::int n FROM media_sources WHERE enabled'),
  ]);
  return { movies: m.n, series: s.n, episodes: e.n, sources: src.n };
}

// --- Cursores de sincronización (reanudable) ---
export async function getCursor(provider, kind) {
  return (await one('SELECT * FROM sync_cursors WHERE provider=$1 AND kind=$2', [provider, kind]))
    || { provider, kind, page: 0, since: null, done: false };
}
export async function saveCursor(provider, kind, { page, since, done }) {
  await query(
    `INSERT INTO sync_cursors (provider, kind, page, since, done) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (provider, kind) DO UPDATE SET page=$3, since=$4, done=$5`,
    [provider, kind, page ?? 0, since ?? null, done ?? false]
  );
}

// --- Jobs de sincronización ---
export async function startJob(provider, kind) {
  return (await one(
    `INSERT INTO sync_jobs (provider, kind, status) VALUES ($1,$2,'running') RETURNING id`,
    [provider, kind]
  )).id;
}
export async function bumpJob(id, { created = 0, updated = 0, errors = 0, lastError } = {}) {
  await query(
    `UPDATE sync_jobs SET created=created+$2, updated=updated+$3, errors=errors+$4,
       last_error=COALESCE($5,last_error) WHERE id=$1`,
    [id, created, updated, errors, lastError || null]
  );
}
export async function finishJob(id, status) {
  await query('UPDATE sync_jobs SET status=$2, finished_at=now() WHERE id=$1', [id, status]);
}
export async function recentJobs(limit = 20) {
  return many('SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT $1', [limit]);
}
