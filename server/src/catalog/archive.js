// Importador de películas de DOMINIO PÚBLICO desde Internet Archive. A diferencia
// de TheTVDB (solo metadatos), acá cada película trae un MP4 reproducible real y
// legal. Busca por género para que el catálogo quede filtrable, elige un MP4
// (h.264/MPEG4) por título y lo guarda con póster.
import { query, one } from '../pg.js';

const IA = 'https://archive.org';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Umbral de descargas: traemos clásicos conocidos (con cierta popularidad), no basura.
const MIN_DOWNLOADS = 2000;

// Búsquedas por género (colección de largometrajes de dominio público).
// Más géneros = más variedad y más películas filtrables.
const GENRES = [
  ['Clásicos', 'collection:(feature_films)'],
  ['Terror', 'subject:(horror)'],
  ['Comedia', 'subject:(comedy)'],
  ['Ciencia Ficción', 'subject:(science fiction)'],
  ['Western', 'subject:(western)'],
  ['Drama', 'subject:(drama)'],
  ['Acción', 'subject:(action)'],
  ['Aventura', 'subject:(adventure)'],
  ['Animación', 'subject:(animation)'],
  ['Suspenso', 'subject:(film noir)'],
  ['Romance', 'subject:(romance)'],
  ['Misterio', 'subject:(mystery)'],
  ['Crimen', 'subject:(crime)'],
  ['Bélico', 'subject:(war)'],
  ['Familia', 'subject:(family)'],
  ['Musical', 'subject:(musical)'],
  ['Fantasía', 'subject:(fantasy)'],
  ['Suspenso', 'subject:(thriller)'],
  ['Documental', 'subject:(documentary)'],
  ['Policial', 'subject:(detective)'],
  ['Infantil', 'subject:(children)'],
  ['Clásicos', 'subject:(classic)'],
  ['Aventura', 'subject:(adventure film)'],
  ['Comedia', 'subject:(silent comedy)'],
];

const control = { running: false, note: null, count: 0 };
export function archiveStatus() { return { ...control }; }

function cleanTitle(t) {
  let s = Array.isArray(t) ? t[0] : (t || '');
  s = String(s).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, 200) || 'Sin título';
}
function yearNum(y) {
  const m = String(Array.isArray(y) ? y[0] : (y || '')).match(/(18|19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}
// Descarta contenido episódico / no-película (series, radio, volúmenes).
function looksEpisodic(title) {
  const t = String(title || '');
  return /\bS\s*\d{1,2}\s*[._\- ]?\s*E\s*\d{1,3}\b/i.test(t)
    || /\bepisode\b|\bcap[ií]tulo\b|\bvol\.?\s*\d|\bparte\s*\d|\bdisc\s*\d/i.test(t);
}

// Elige un archivo MP4 reproducible en el navegador. Prefiere tamaños moderados.
async function pickMp4(identifier) {
  const r = await fetch(`${IA}/metadata/${identifier}`).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j) return null;
  const files = (j.files || []).filter(
    (f) => /\.mp4$/i.test(f.name || '') && /h\.?264|mpeg4/i.test(f.format || '')
  );
  if (!files.length) return null;
  files.sort((a, b) => Number(a.size || 0) - Number(b.size || 0));
  // Evitar muestras/clips muy chicos (< 20 MB) cuando hay opciones mayores.
  const f = files.find((x) => Number(x.size || 0) > 20e6) || files[files.length - 1];
  return `${IA}/download/${identifier}/${encodeURIComponent(f.name)}`;
}

async function have(identifier) {
  return Boolean(await one(
    `SELECT 1 FROM external_ids WHERE provider='archive' AND content_type='movie' AND external_id=$1`,
    [identifier]));
}

async function insertMovie({ identifier, title, year, description, category, url, popularity = 0 }) {
  if (await have(identifier)) return false;
  const poster = `${IA}/services/img/${identifier}`;
  const desc = Array.isArray(description) ? description[0] : description;
  const pop = Math.min(99999999, Number(popularity) || 0);
  const m = await one(
    `INSERT INTO movies (title, year, poster, description, overview_es, category, stream_url, provider, popularity)
     VALUES ($1,$2,$3,$4,$4,$5,$6,'archive',$7) RETURNING id`,
    [title, year, poster, (desc || '').toString().replace(/<[^>]+>/g, '').slice(0, 1200) || null, category, url, pop]);
  await query(
    `INSERT INTO external_ids (provider, content_type, external_id, internal_id)
     VALUES ('archive','movie',$1,$2) ON CONFLICT DO NOTHING`, [identifier, m.id]);
  return true;
}

// Importa en segundo plano. perGenre = cuántos títulos buscar por género.
export function importArchive({ perGenre = 150 } = {}) {
  if (control.running) return { ok: false, error: 'Ya hay una importación de Internet Archive en curso' };
  control.running = true; control.count = 0; control.note = 'iniciando';
  (async () => {
    try {
      for (const [cat, q] of GENRES) {
        control.note = `buscando ${cat}`;
        const full = `collection:(feature_films) AND mediatype:(movies) AND ${q}`;
        const url = `${IA}/advancedsearch.php?q=${encodeURIComponent(full)}`
          + `&fl[]=identifier&fl[]=title&fl[]=year&fl[]=description&fl[]=downloads`
          + `&sort[]=${encodeURIComponent('downloads desc')}&rows=${perGenre}&page=1&output=json`;
        const r = await fetch(url).catch(() => null);
        if (!r || !r.ok) continue;
        const docs = (await r.json().catch(() => ({})))?.response?.docs || [];
        for (const d of docs) {
          const downloads = Number(d.downloads || 0);
          const year = yearNum(d.year);
          const title = cleanTitle(d.title);
          // CALIDAD: solo películas conocidas (populares, con año, no episódicas).
          if (downloads < MIN_DOWNLOADS || !year || looksEpisodic(title)) continue;
          try {
            const mp4 = await pickMp4(d.identifier);
            if (!mp4) continue;
            const ok = await insertMovie({
              identifier: d.identifier, title: cleanTitle(d.title), year,
              description: d.description, category: cat, url: mp4, popularity: downloads,
            });
            if (ok) control.count++;
          } catch { /* saltar título problemático */ }
          await sleep(60);
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
