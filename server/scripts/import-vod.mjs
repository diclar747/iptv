// Importa un catálogo amplio de películas y series de DOMINIO PÚBLICO desde
// Internet Archive a las tablas movies/series/episodes.
//
// Uso:  node server/scripts/import-vod.mjs
// Config de conexión: mismas variables PG* que el servidor (defaults locales).

import pg from 'pg';

const pool = new pg.Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'iptv',
        user: process.env.PGUSER || 'iptv',
        password: process.env.PGPASSWORD || 'iptv',
      }
);

const dl = (id, file) => `https://archive.org/download/${id}/${encodeURIComponent(file)}`;
const poster = (id) => `https://archive.org/services/img/${id}`;

async function search(query, rows = 25) {
  const url =
    'https://archive.org/advancedsearch.php?' +
    new URLSearchParams({ q: query, rows: String(rows), output: 'json' }) +
    '&fl[]=identifier&fl[]=title&fl[]=year&fl[]=description&sort[]=downloads+desc';
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  const j = await r.json();
  return j.response?.docs || [];
}

// Devuelve la derivada H.264 reproducible en navegador. Internet Archive
// genera derivadas "512kb"/"256kb" en H.264; el archivo original suele ser
// DivX/MPEG-4 que el navegador NO decodifica. Exigimos la derivada H.264.
async function bestMp4(id) {
  try {
    const r = await fetch(`https://archive.org/metadata/${id}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const m = await r.json();
    if (!m.files) return null;
    const mp4 = m.files.filter((f) => /\.mp4$/i.test(f.name));
    // Preferencia: 512kb > 256kb > cualquier derivada marcada h.264.
    const pick =
      mp4.find((f) => /512kb\.mp4$/i.test(f.name)) ||
      mp4.find((f) => /256kb\.mp4$/i.test(f.name)) ||
      mp4.find((f) => f.source === 'derivative' && /h\.?264|avc/i.test(f.format || ''));
    return pick ? pick.name : null; // sin derivada H.264 -> se omite (no reproducible)
  } catch {
    return null;
  }
}

// Ejecuta tareas con límite de concurrencia.
async function pool_(items, worker, concurrency = 6) {
  const results = [];
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

const first = (v) => (Array.isArray(v) ? v[0] : v);
const clean = (t) => String(first(t) ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
const parseYear = (y) => { const n = parseInt(first(y), 10); return Number.isFinite(n) ? n : null; };
const shortDesc = (d) => {
  if (!d) return null;
  const s = String(first(d) ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Descartar descripciones que son solo una URL o empiezan con una.
  if (!s || /^https?:\/\//i.test(s)) return null;
  return s.slice(0, 280);
};

// Géneros a importar (término de búsqueda -> categoría en español).
const GENRES = [
  ['horror', 'Terror'],
  ['comedy', 'Comedia'],
  ['"science fiction"', 'Ciencia Ficción'],
  ['western', 'Western'],
  ['adventure', 'Aventura'],
  ['drama', 'Drama'],
  ['"film noir" OR mystery OR thriller', 'Suspenso'],
  ['animation OR cartoon', 'Animación'],
];

// Series por personaje (dibujos de dominio público).
const SERIES = [
  ['Betty Boop', 'title:("Betty Boop")', 'Animación', 8],
  ['Popeye el Marino', 'title:(Popeye)', 'Animación', 8],
  ['Superman', 'title:(Superman) AND subject:(Fleischer OR cartoon)', 'Animación', 6],
  ['Felix the Cat', 'title:("Felix the Cat")', 'Animación', 6],
];

async function importMovies() {
  const existing = await pool.query('SELECT stream_url FROM movies');
  const seen = new Set(existing.rows.map(r => r.stream_url?.split('/')[4]).filter(Boolean));
  const toInsert = [];
  for (const [term, category] of GENRES) {
    const q = `collection:(feature_films) AND mediatype:(movies) AND (${term}) AND (licenseurl:(*creativecommons.org/publicdomain/*) OR licenseurl:(*creativecommons.org/licenses/by/*) OR licenseurl:(*creativecommons.org/licenses/by-sa/*))`;
    const docs = await search(q, 30);
    for (const d of docs) {
      if (seen.has(d.identifier)) continue;
      seen.add(d.identifier);
      toInsert.push({ ...d, category });
    }
  }
  console.log(`candidatos: ${toInsert.length} — resolviendo mp4…`);
  const resolved = await pool_(toInsert, async (d) => {
    const file = await bestMp4(d.identifier);
    return file ? { ...d, file } : null;
  }, 8);

  const ok = resolved.filter(Boolean);
  for (const d of ok) {
    await pool.query(
      `INSERT INTO movies (title, year, category, poster, stream_url, description)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [clean(d.title), parseYear(d.year), d.category,
       poster(d.identifier), dl(d.identifier, d.file), shortDesc(d.description)]
    );
  }
  console.log(`películas insertadas: ${ok.length}`);
}

async function importSeries() {
  for (const [title, q, category, limit] of SERIES) {
    const exists = await pool.query('SELECT id FROM series WHERE title=$1', [title]);
    if (exists.rowCount) continue;
    const docs = await search(`${q} AND mediatype:(movies) AND (licenseurl:(*creativecommons.org/publicdomain/*) OR licenseurl:(*creativecommons.org/licenses/by/*) OR licenseurl:(*creativecommons.org/licenses/by-sa/*))`, limit + 4);
    const eps = [];
    await pool_(docs.slice(0, limit + 4), async (d) => {
      if (eps.length >= limit) return;
      const file = await bestMp4(d.identifier);
      if (file) eps.push({ title: clean(d.title), id: d.identifier, file });
    }, 6);
    if (eps.length < 2) { console.log(`serie "${title}": sin suficientes episodios, omitida`); continue; }
    const s = await pool.query(
      'INSERT INTO series (title, category, poster, description) VALUES ($1,$2,$3,$4) RETURNING id',
      [title, category, poster(eps[0].id), `Episodios clásicos de ${title} (dominio público).`]
    );
    let n = 1;
    for (const e of eps.slice(0, limit)) {
      await pool.query(
        'INSERT INTO episodes (series_id, season, episode, title, stream_url) VALUES ($1,1,$2,$3,$4)',
        [s.rows[0].id, n++, e.title, dl(e.id, e.file)]
      );
    }
    console.log(`serie "${title}": ${Math.min(eps.length, limit)} episodios`);
  }
}

async function main() {
  // Amplía el catálogo sin borrar películas, episodios ni referencias existentes.
  await pool.query('SELECT 1');
  await importMovies();
  await importSeries();
  const m = await pool.query('SELECT count(*)::int n FROM movies');
  const s = await pool.query('SELECT count(*)::int n FROM series');
  console.log(`\nTOTAL -> películas: ${m.rows[0].n}, series: ${s.rows[0].n}`);

}

main().catch((e) => { console.error('import error:', e.message); process.exitCode = 1; }).finally(() => pool.end());
