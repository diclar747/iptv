// Proveedor TMDB (The Movie Database): importa METADATOS de películas actuales y
// populares (póster, fondo, sinopsis en español, año, rating, género). No trae
// video ni derechos: estos títulos se muestran para que el catálogo se vea actual
// y representable; el "Ver ahora" solo aparece si se vincula una fuente licenciada.
// Requiere una API Key gratuita de themoviedb.org (env TMDB_API_KEY).
import { query, one } from '../pg.js';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const key = () => (process.env.TMDB_API_KEY || '').trim();

const control = { running: false, note: null, count: 0 };
export function tmdbStatus() { return { ...control, configured: Boolean(key()) }; }

let genreMap = null;
async function loadGenres() {
  if (genreMap) return genreMap;
  const r = await fetch(`${API}/genre/movie/list?api_key=${key()}&language=es-ES`).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  genreMap = {};
  (j?.genres || []).forEach((g) => { genreMap[g.id] = g.name; });
  return genreMap;
}

async function have(id) {
  return Boolean(await one(
    `SELECT 1 FROM external_ids WHERE provider='tmdb' AND content_type='movie' AND external_id=$1`, [String(id)]));
}

async function upsert(m, genres) {
  if (await have(m.id)) return false;
  const year = Number(String(m.release_date || '').slice(0, 4)) || null;
  const poster = m.poster_path ? `${IMG}/w500${m.poster_path}` : null;
  const backdrop = m.backdrop_path ? `${IMG}/w1280${m.backdrop_path}` : null;
  if (!poster) return false; // sin póster no sirve para la portada
  const cat = (m.genre_ids && m.genre_ids[0] && genres[m.genre_ids[0]]) || null;
  const overview = (m.overview || '').slice(0, 1200) || null;
  const rating = m.vote_average != null ? Number(Number(m.vote_average).toFixed(1)) : null;
  const pop = Math.min(99999999, Number(m.popularity) || 0);
  const row = await one(
    `INSERT INTO movies (title, original_title, year, poster, backdrop, description, overview_es,
       category, rating, popularity, provider, featured)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,'tmdb',$10) RETURNING id`,
    [m.title || m.original_title, m.original_title || null, year, poster, backdrop,
      overview, cat, rating, pop, Boolean(backdrop)]);
  await query(
    `INSERT INTO external_ids (provider, content_type, external_id, internal_id)
     VALUES ('tmdb','movie',$1,$2) ON CONFLICT DO NOTHING`, [String(m.id), row.id]);
  return true;
}

// Importa en segundo plano. Usa /discover (miles de películas por popularidad) +
// /movie/now_playing (estrenos). pages = cuántas páginas de discover (20 c/u).
export function importTmdb({ pages = 30 } = {}) {
  if (control.running) return { ok: false, error: 'Ya hay una importación de TMDB en curso' };
  if (!key()) return { ok: false, error: 'TMDB sin API Key' };
  control.running = true; control.count = 0; control.note = 'iniciando';
  (async () => {
    let errors = 0, lastErr = null;
    try {
      const genres = await loadGenres();

      // 1) Catálogo amplio: discover ordenado por popularidad (20.000+ títulos).
      for (let page = 1; page <= pages; page++) {
        control.note = `populares · página ${page}/${pages}`;
        const url = `${API}/discover/movie?api_key=${key()}&language=es-ES`
          + `&sort_by=popularity.desc&vote_count.gte=50&include_adult=false&page=${page}`;
        const r = await fetch(url).catch(() => null);
        if (!r || !r.ok) { errors++; await sleep(500); continue; }
        const j = await r.json().catch(() => ({}));
        for (const m of (j.results || [])) {
          try { if (await upsert(m, genres)) control.count++; }
          catch (e) { errors++; lastErr = String(e.message).slice(0, 180); }
        }
        await sleep(120);
      }

      // 2) Estrenos recientes.
      for (let page = 1; page <= 3; page++) {
        control.note = `estrenos · página ${page}`;
        const r = await fetch(`${API}/movie/now_playing?api_key=${key()}&language=es-ES&page=${page}`).catch(() => null);
        if (!r || !r.ok) continue;
        const j = await r.json().catch(() => ({}));
        for (const m of (j.results || [])) {
          try { if (await upsert(m, genres)) control.count++; } catch (e) { errors++; lastErr = String(e.message).slice(0, 180); }
        }
        await sleep(120);
      }

      control.note = `completada: ${control.count} películas` + (errors ? ` (${errors} errores${lastErr ? ': ' + lastErr : ''})` : '');
    } catch (e) {
      control.note = 'error: ' + e.message;
    } finally {
      control.running = false;
    }
  })();
  return { ok: true, started: true };
}

// Busca el tráiler oficial de YouTube de una película (es primero, luego en).
async function fetchTrailer(id) {
  for (const lang of ['es-ES', 'en-US']) {
    const r = await fetch(`${API}/movie/${id}/videos?api_key=${key()}&language=${lang}`).catch(() => null);
    const j = r && r.ok ? await r.json().catch(() => null) : null;
    const vids = j?.results || [];
    const pick = vids.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
      || vids.find((v) => v.site === 'YouTube' && v.type === 'Trailer')
      || vids.find((v) => v.site === 'YouTube' && v.type === 'Teaser')
      || vids.find((v) => v.site === 'YouTube');
    if (pick?.key) return `https://www.youtube.com/watch?v=${pick.key}`;
  }
  return null;
}

// Inserta (o actualiza el tráiler de) una película de TMDB con su tráiler.
async function upsertWithTrailer(m, genres, trailer) {
  const year = Number(String(m.release_date || '').slice(0, 4)) || null;
  const poster = m.poster_path ? `${IMG}/w500${m.poster_path}` : null;
  const backdrop = m.backdrop_path ? `${IMG}/w1280${m.backdrop_path}` : null;
  if (!poster) return false;
  const cat = (m.genre_ids && m.genre_ids[0] && genres[m.genre_ids[0]]) || null;
  const overview = (m.overview || '').slice(0, 1200) || null;
  const rating = m.vote_average != null ? Number(Number(m.vote_average).toFixed(1)) : null;
  const pop = Math.min(99999999, Number(m.popularity) || 0);
  const existing = await one(
    `SELECT internal_id FROM external_ids WHERE provider='tmdb' AND content_type='movie' AND external_id=$1`, [String(m.id)]);
  if (existing) {
    // Ya la teníamos (metadato): solo le sumamos el tráiler y refrescamos datos.
    await query(
      `UPDATE movies SET trailer=$2, backdrop=COALESCE(backdrop,$3), popularity=$4, year=COALESCE(year,$5) WHERE id=$1`,
      [existing.internal_id, trailer, backdrop, pop, year]);
    return false; // no cuenta como nueva
  }
  const row = await one(
    `INSERT INTO movies (title, original_title, year, poster, backdrop, description, overview_es,
       category, rating, popularity, trailer, provider, featured)
     VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,'tmdb',$11) RETURNING id`,
    [m.title || m.original_title, m.original_title || null, year, poster, backdrop,
      overview, cat, rating, pop, trailer, Boolean(backdrop)]);
  await query(
    `INSERT INTO external_ids (provider, content_type, external_id, internal_id)
     VALUES ('tmdb','movie',$1,$2) ON CONFLICT DO NOTHING`, [String(m.id), row.id]);
  return true;
}

// Importa ESTRENOS con tráiler: películas actuales (now_playing + popular) con su
// tráiler oficial de YouTube, para la fila "Estrenos". Legal (metadato + tráiler),
// no reemplaza una fuente con licencia. pages = páginas por lista (20 c/u).
export function importTrailers({ pages = 5 } = {}) {
  if (control.running) return { ok: false, error: 'Ya hay una importación de TMDB en curso' };
  if (!key()) return { ok: false, error: 'TMDB sin API Key' };
  control.running = true; control.count = 0; control.note = 'iniciando estrenos';
  (async () => {
    let errors = 0, lastErr = null;
    try {
      const genres = await loadGenres();
      for (const list of ['now_playing', 'popular']) {
        for (let page = 1; page <= pages; page++) {
          control.note = `${list} · página ${page}/${pages}`;
          const r = await fetch(`${API}/movie/${list}?api_key=${key()}&language=es-ES&page=${page}`).catch(() => null);
          if (!r || !r.ok) { errors++; await sleep(400); continue; }
          const j = await r.json().catch(() => ({}));
          for (const m of (j.results || [])) {
            try {
              const trailer = await fetchTrailer(m.id);
              if (!trailer) continue; // sin tráiler no entra a Estrenos
              if (await upsertWithTrailer(m, genres, trailer)) control.count++;
            } catch (e) { errors++; lastErr = String(e.message).slice(0, 180); }
            await sleep(80);
          }
        }
      }
      control.note = `estrenos completados: ${control.count} nuevas` + (errors ? ` (${errors} errores${lastErr ? ': ' + lastErr : ''})` : '');
    } catch (e) {
      control.note = 'error: ' + e.message;
    } finally {
      control.running = false;
    }
  })();
  return { ok: true, started: true };
}

export async function tmdbTest() {
  if (!key()) return { ok: false, error: 'Falta TMDB_API_KEY' };
  try {
    const r = await fetch(`${API}/configuration?api_key=${key()}`);
    return r.ok ? { ok: true } : { ok: false, error: `HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}
