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

// Importa en segundo plano desde las listas populares de TMDB.
export function importTmdb({ pages = 5 } = {}) {
  if (control.running) return { ok: false, error: 'Ya hay una importación de TMDB en curso' };
  if (!key()) return { ok: false, error: 'TMDB sin API Key' };
  control.running = true; control.count = 0; control.note = 'iniciando';
  (async () => {
    try {
      const genres = await loadGenres();
      for (const list of ['popular', 'top_rated', 'now_playing']) {
        for (let page = 1; page <= pages; page++) {
          control.note = `${list} · página ${page}`;
          const url = `${API}/movie/${list}?api_key=${key()}&language=es-ES&page=${page}&region=PY`;
          const r = await fetch(url).catch(() => null);
          if (!r || !r.ok) break;
          const j = await r.json().catch(() => ({}));
          for (const m of (j.results || [])) {
            try { if (await upsert(m, genres)) control.count++; } catch { /* saltar */ }
          }
          await sleep(120);
        }
      }
      control.note = `completada: ${control.count} películas`;
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
