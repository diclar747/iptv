// API pública del catálogo de películas y series (metadatos). La reproducción
// vive en media_sources y solo se ofrece "Ver ahora" cuando hay fuente autorizada
// (o el stream_url del contenido de dominio público). Reemplaza al viejo vod.js.
import express from 'express';
import { query, one, many, tx } from './pg.js';
import { requireActiveViewer } from './auth.js';
import { getProvider } from './catalog/index.js';

const router = express.Router();
router.use(requireActiveViewer); // catálogo solo con sesión/suscripción activa

// Etiquetas en español para categorías/géneros frecuentes (TheTVDB llegan en inglés).
const GENRE_ES = {
  action: 'Acción', adventure: 'Aventura', comedy: 'Comedia', drama: 'Drama',
  horror: 'Terror', thriller: 'Suspenso', romance: 'Romance', animation: 'Animación',
  'science-fiction': 'Ciencia Ficción', fantasy: 'Fantasía', crime: 'Crimen',
  documentary: 'Documental', family: 'Familia', mystery: 'Misterio', war: 'Bélico',
  western: 'Western', music: 'Musical', history: 'Historia',
};
const label = (c) => GENRE_ES[String(c || '').toLowerCase().replace(/\s+/g, '-')] || c;

// ¿Es reproducible? (tiene fuente autorizada o stream de dominio público)
const MOVIE_AVAIL = `(m.stream_url IS NOT NULL OR EXISTS(
  SELECT 1 FROM media_sources ms WHERE ms.content_type='movie' AND ms.content_id=m.id AND ms.enabled))`;
// Serie reproducible: tiene al menos un episodio con fuente.
const SERIES_AVAIL = `EXISTS(SELECT 1 FROM episodes e WHERE e.series_id=s.id AND (
  e.stream_url IS NOT NULL OR EXISTS(SELECT 1 FROM media_sources ms WHERE ms.content_type='episode' AND ms.content_id=e.id AND ms.enabled)))`;

const movieCard = (m) => ({
  id: m.id, type: 'movie', title: m.title, year: m.year, poster: m.poster,
  backdrop: m.backdrop, rating: m.rating != null ? Number(m.rating) : null,
  category: m.category, available: m.available, trailer: m.trailer || null,
});
const seriesCard = (s) => ({
  id: s.id, type: 'serie', title: s.title, year: s.year, poster: s.poster,
  backdrop: s.backdrop, rating: s.rating != null ? Number(s.rating) : null,
  category: s.category, available: true,
});

// Solo películas REPRODUCIBLES (se ocultan las que están sin fuente / "Próximamente").
async function movieRow(where = '', params = [], limit = 24) {
  const rows = await many(
    `SELECT m.*, ${MOVIE_AVAIL} AS available FROM movies m
     WHERE NOT m.hidden AND ${MOVIE_AVAIL} ${where ? 'AND ' + where : ''} ORDER BY m.created_at DESC LIMIT ${limit}`,
    params
  );
  return rows.map(movieCard);
}

// Categorías que NO se muestran en la portada (para que abra "linda"). El terror
// sigue disponible en la sección Películas, solo no aparece de entrada en Inicio.
const HOME_HIDE = ['Terror'];

// Portada estilo Netflix en un pedido: banner + filas temáticas.
router.get('/catalog/home', async (req, res) => {
  const hideCond = `(m.category IS NULL OR NOT (m.category = ANY($1)))`;
  const [latestMovies, series, topCats] = await Promise.all([
    movieRow(hideCond, [HOME_HIDE], 24),
    many(`SELECT s.* FROM series s WHERE NOT s.hidden AND ${SERIES_AVAIL} ORDER BY s.popularity DESC, s.created_at DESC LIMIT 24`),
    many(`SELECT category, count(*)::int n FROM movies m WHERE NOT m.hidden AND ${MOVIE_AVAIL} AND m.category IS NOT NULL
          AND NOT (m.category = ANY($1)) GROUP BY category ORDER BY n DESC LIMIT 6`, [HOME_HIDE]),
  ]);

  // Estrenos y populares: películas ACTUALES con tráiler (pósters/imágenes
  // modernas). Aunque no tengan fuente completa, reproducen el tráiler oficial,
  // así la cartelera se ve nueva en vez de solo clásicos viejos.
  // Modernas = títulos de TMDB (pósters/imágenes actuales), ya estén como tráiler
  // o solo ficha. Los que tienen tráiler van primero. No depende del import de
  // tráilers: usa el metadato actual que ya está en la base.
  const MODERN = `NOT m.hidden AND (${MOVIE_AVAIL}) AND m.poster IS NOT NULL
    AND (m.category IS NULL OR NOT (m.category = ANY($1)))`;
  const [estrenos, populares] = await Promise.all([
    many(`SELECT m.*, ${MOVIE_AVAIL} AS available FROM movies m
          WHERE ${MODERN}
          ORDER BY (m.trailer IS NOT NULL) DESC, m.year DESC NULLS LAST, m.popularity DESC LIMIT 24`, [HOME_HIDE]),
    many(`SELECT m.*, ${MOVIE_AVAIL} AS available FROM movies m
          WHERE ${MODERN}
          ORDER BY (m.trailer IS NOT NULL) DESC, m.popularity DESC LIMIT 24`, [HOME_HIDE]),
  ]);

  const rows = [];
  if (estrenos.length) rows.push({ key: 'estrenos', title: 'Películas recientes del catálogo', nav: 'peliculas', items: estrenos.map(movieCard) });
  if (populares.length) rows.push({ key: 'populares', title: '🔥 Populares ahora', nav: 'peliculas', items: populares.map(movieCard) });
  if (latestMovies.length) rows.push({ key: 'latest', title: 'Clásicos para ver ya', nav: 'peliculas', items: latestMovies });
  if (series.length) rows.push({ key: 'series', title: 'Series', nav: 'series', items: series.map(seriesCard) });
  for (const c of topCats) {
    const items = await movieRow('m.category=$1', [c.category], 20);
    if (items.length) rows.push({ key: 'cat-' + c.category, title: label(c.category), items });
  }

  // Banner: destacados. Prioriza los que tienen imagen de fondo (backdrop);
  // si no hay, cae al póster para que el banner no quede vacío.
  // Prioriza títulos MODERNOS (estrenos con tráiler e imagen de fondo) para que
  // el héroe no sea un clásico viejo; si no hay, cae a lo reproducible con fondo.
  const feat = await many(
    `SELECT m.*, ${MOVIE_AVAIL} AS available FROM movies m
     WHERE NOT m.hidden AND ${MOVIE_AVAIL}
       AND (m.backdrop IS NOT NULL OR m.poster IS NOT NULL)
       AND m.title !~* 'S *[0-9]+ *E *[0-9]+'
       AND (m.category IS NULL OR NOT (m.category = ANY($1)))
     ORDER BY (m.trailer IS NOT NULL) DESC, (m.backdrop IS NOT NULL) DESC, m.year DESC NULLS LAST, m.popularity DESC LIMIT 6`,
    [HOME_HIDE]
  );
  res.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
  res.json({ featured: feat.map(movieCard), rows: rows.filter((r) => r.items.length) });
});

// Listado de películas con filtros + paginación.
router.get('/catalog/movies', async (req, res) => {
  const { search, category, page = '1', pageSize = '48' } = req.query;
  const where = ['NOT m.hidden', MOVIE_AVAIL];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`m.title ILIKE $${params.length}`); }
  if (category) { params.push(category); where.push(`m.category=$${params.length}`); }
  const ps = Math.min(80, Math.max(1, parseInt(pageSize, 10) || 48));
  const off = (Math.max(1, parseInt(page, 10) || 1) - 1) * ps;
  params.push(ps, off);
  const rows = await many(
    `SELECT m.*, ${MOVIE_AVAIL} AS available FROM movies m WHERE ${where.join(' AND ')}
     ORDER BY m.year DESC NULLS LAST, m.created_at DESC, m.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows.map(movieCard));
});

router.get('/catalog/series', async (req, res) => {
  const { search } = req.query;
  const where = ['NOT s.hidden', SERIES_AVAIL];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`s.title ILIKE $${params.length}`); }
  const rows = await many(
    `SELECT s.*, (SELECT count(*)::int FROM episodes e WHERE e.series_id=s.id) AS episode_count
     FROM series s WHERE ${where.join(' AND ')} ORDER BY s.popularity DESC, s.title`,
    params
  );
  res.json(rows.map((s) => ({ ...seriesCard(s), episodeCount: s.episode_count })));
});

// Buscador global (películas + series) sobre PostgreSQL.
router.get('/catalog/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ movies: [], series: [] });
  const like = `%${q}%`;
  const [mv, sr] = await Promise.all([
    many(`SELECT m.*, ${MOVIE_AVAIL} AS available FROM movies m
          WHERE NOT m.hidden AND ${MOVIE_AVAIL} AND (m.title ILIKE $1 OR m.original_title ILIKE $1)
          ORDER BY m.year DESC NULLS LAST, m.id DESC LIMIT 40`, [like]),
    many(`SELECT s.* FROM series s WHERE NOT s.hidden AND ${SERIES_AVAIL} AND (s.title ILIKE $1 OR s.original_title ILIKE $1)
          ORDER BY s.popularity DESC LIMIT 40`, [like]),
  ]);
  res.json({ movies: mv.map(movieCard), series: sr.map(seriesCard) });
});

async function creditsOf(type, id) {
  const rows = await many(
    `SELECT p.name, cc.role, cc.char_name AS character, p.photo FROM content_credits cc
     JOIN people p ON p.id=cc.person_id WHERE cc.content_type=$1 AND cc.content_id=$2
     ORDER BY cc.sort LIMIT 20`, [type, id]);
  return {
    director: rows.filter((r) => r.role === 'director').map((r) => r.name),
    cast: rows.filter((r) => r.role !== 'director').map((r) => ({ name: r.name, character: r.character, photo: r.photo })),
  };
}
async function genresOf(type, id) {
  return (await many(
    `SELECT g.slug, g.name FROM content_genres cg JOIN genres g ON g.id=cg.genre_id
     WHERE cg.content_type=$1 AND cg.content_id=$2`, [type, id])).map((g) => label(g.name));
}

// Ficha de película (incluye fuente de reproducción solo si está autorizada).
router.get('/catalog/movies/:id', async (req, res) => {
  const m = await one(`SELECT m.*, ${MOVIE_AVAIL} AS available FROM movies m WHERE m.id=$1 AND NOT m.hidden`, [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Película no encontrada' });
  const src = await one(
    `SELECT url, user_agent, referrer FROM media_sources
     WHERE content_type='movie' AND content_id=$1 AND enabled ORDER BY id LIMIT 1`, [m.id]);
  const streamUrl = src?.url || m.stream_url || null;
  const [credits, genres] = await Promise.all([creditsOf('movie', m.id), genresOf('movie', m.id)]);
  res.json({
    ...movieCard(m), originalTitle: m.original_title, overview: m.overview_es || m.description,
    runtime: m.runtime, country: m.country, trailer: m.trailer, genres, ...credits,
    available: Boolean(streamUrl), streamUrl,
    streams: streamUrl ? [{ url: streamUrl, userAgent: src?.user_agent || null, referrer: src?.referrer || null }] : [],
  });
});

// Ficha de serie con temporadas y episodios (stream por episodio solo si autorizado).
router.get('/catalog/series/:id', async (req, res) => {
  const s = await one('SELECT * FROM series WHERE id=$1 AND NOT hidden', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Serie no encontrada' });
  const eps = await many(
    `SELECT e.*, (SELECT url FROM media_sources ms WHERE ms.content_type='episode' AND ms.content_id=e.id AND ms.enabled ORDER BY id LIMIT 1) AS src_url
     FROM episodes e WHERE e.series_id=$1 ORDER BY e.season, e.episode`, [s.id]);
  const [credits, genres] = await Promise.all([creditsOf('series', s.id), genresOf('series', s.id)]);
  res.json({
    ...seriesCard(s), originalTitle: s.original_title, overview: s.overview_es || s.description,
    country: s.country, status: s.status, trailer: s.trailer, genres, ...credits,
    episodes: eps.map((e) => {
      const url = e.src_url || e.stream_url || null;
      return {
        id: e.id, season: e.season, episode: e.episode, title: e.title, overview: e.overview,
        still: e.still, airDate: e.air_date, available: Boolean(url), streamUrl: url,
      };
    }),
  });
});

// Metadatos del catálogo (géneros + atribución + si el proveedor está conectado).
router.get('/catalog/meta', async (req, res) => {
  const p = getProvider();
  // Categorías de todas las fichas visibles, igual que la grilla.
  const cats = await many(
    `SELECT category AS slug, count(*)::int n FROM movies m
     WHERE NOT m.hidden AND ${MOVIE_AVAIL} AND m.category IS NOT NULL
     GROUP BY category ORDER BY n DESC LIMIT 30`);
  res.json({
    attribution: p.attribution,
    providerConfigured: p.isConfigured(),
    genres: cats.map((c) => ({ value: c.slug, label: label(c.slug), count: c.n })),
  });
});

// --- Favoritos (persisten entre sincronizaciones) ---
router.get('/catalog/favorites', async (req, res) => {
  const rows = await many(
    `SELECT content_type, content_id FROM user_favorites WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.user.id]);
  const movieIds = rows.filter((r) => r.content_type === 'movie').map((r) => r.content_id);
  const serieIds = rows.filter((r) => r.content_type === 'series').map((r) => r.content_id);
  const [mv, sr] = await Promise.all([
    movieIds.length ? many(`SELECT m.*, ${MOVIE_AVAIL} AS available FROM movies m WHERE m.id = ANY($1) AND NOT m.hidden`, [movieIds]) : [],
    serieIds.length ? many(`SELECT * FROM series WHERE id = ANY($1) AND NOT hidden`, [serieIds]) : [],
  ]);
  res.json([...mv.map(movieCard), ...sr.map(seriesCard)]);
});
router.post('/catalog/favorites', async (req, res) => {
  const { type, id } = req.body || {};
  const ct = type === 'serie' ? 'series' : 'movie';
  await query(
    `INSERT INTO user_favorites (user_id, content_type, content_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [req.user.id, ct, id]);
  res.json({ ok: true });
});
router.delete('/catalog/favorites', async (req, res) => {
  const ct = req.query.type === 'serie' ? 'series' : 'movie';
  await query(`DELETE FROM user_favorites WHERE user_id=$1 AND content_type=$2 AND content_id=$3`,
    [req.user.id, ct, req.query.id]);
  res.json({ ok: true });
});

// --- Progreso de reproducción ---
router.get('/catalog/progress', async (req, res) => {
  res.json(await many(
    `SELECT content_type, content_id, position, duration FROM watch_progress WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 40`,
    [req.user.id]));
});
router.put('/catalog/progress', async (req, res) => {
  const { type, id, position, duration } = req.body || {};
  if (!type || !id) return res.status(400).json({ error: 'faltan datos' });
  await query(
    `INSERT INTO watch_progress (user_id, content_type, content_id, position, duration, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id, content_type, content_id) DO UPDATE SET position=$4, duration=$5, updated_at=now()`,
    [req.user.id, type, id, Math.max(0, parseInt(position, 10) || 0), duration || null]);
  res.json({ ok: true });
});

// --- Me gusta y comentarios (compartidos entre usuarios) ---
// content_id es texto: canales ("Telefuturo.py"), pelis/series (id numérico en texto).
const ctype = (t) => (t === 'serie' ? 'series' : (['movie', 'series', 'channel', 'radio'].includes(t) ? t : 'channel'));

// Estado social de un contenido: cantidad de me gusta, si YO di me gusta, y comentarios.
router.get('/catalog/reactions', async (req, res) => {
  const type = ctype(req.query.type);
  const id = String(req.query.id || '').slice(0, 200);
  if (!id) return res.status(400).json({ error: 'falta id' });
  const [likeRow, mineRow, comments] = await Promise.all([
    one(`SELECT count(*) FILTER (WHERE value=1)::int n, count(*) FILTER (WHERE value=-1)::int dislikes FROM content_likes WHERE content_type=$1 AND content_id=$2`, [type, id]),
    one(`SELECT value FROM content_likes WHERE content_type=$1 AND content_id=$2 AND user_id=$3`, [type, id, req.user.id]),
    many(`SELECT c.id, c.body, c.created_at, u.username, (c.user_id=$3) AS mine
          FROM comments c JOIN users u ON u.id=c.user_id
          WHERE c.content_type=$1 AND c.content_id=$2 AND NOT c.hidden
          ORDER BY c.created_at DESC LIMIT 100`, [type, id, req.user.id]),
  ]);
  res.json({
    likes: likeRow?.n || 0,
    liked: mineRow?.value === 1,
    disliked: mineRow?.value === -1,
    dislikes: likeRow?.dislikes || 0,
    comments: comments.map((c) => ({ id: String(c.id), author: c.username, body: c.body, created: c.created_at, mine: c.mine })),
  });
});

// Alterna el me gusta y devuelve el nuevo estado + total.
router.post('/catalog/likes', async (req, res) => {
  const type = ctype(req.body?.type);
  const id = String(req.body?.id || '').slice(0, 200);
  if (!id) return res.status(400).json({ error: 'falta id' });
  const vote = req.body?.value === undefined ? 1 : req.body.value;
  if (![1, -1].includes(vote)) return res.status(400).json({ error: 'Voto inválido' });
  const result = await tx(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [req.user.id + ':' + type + ':' + id]);
    const old = await client.query('SELECT value FROM content_likes WHERE content_type=$1 AND content_id=$2 AND user_id=$3', [type,id,req.user.id]);
    const value = old.rows[0]?.value === vote ? 0 : vote;
    if (!value) await client.query('DELETE FROM content_likes WHERE content_type=$1 AND content_id=$2 AND user_id=$3',[type,id,req.user.id]);
    else await client.query('INSERT INTO content_likes (user_id,content_type,content_id,value) VALUES ($3,$1,$2,$4) ON CONFLICT (user_id,content_type,content_id) DO UPDATE SET value=EXCLUDED.value',[type,id,req.user.id,value]);
    const counts=await client.query('SELECT count(*) FILTER (WHERE value=1)::int likes, count(*) FILTER (WHERE value=-1)::int dislikes FROM content_likes WHERE content_type=$1 AND content_id=$2',[type,id]);
    return { ...counts.rows[0], liked: value===1, disliked: value===-1 };
  });
  res.json(result);
});

// Publica un comentario.
router.post('/catalog/comments', async (req, res) => {
  const type = ctype(req.body?.type);
  const id = String(req.body?.id || '').slice(0, 200);
  const body = String(req.body?.body || '').trim().slice(0, 500);
  if (!id || !body) return res.status(400).json({ error: 'faltan datos' });
  const c = await one(
    `INSERT INTO comments (user_id, content_type, content_id, body) VALUES ($1,$2,$3,$4)
     RETURNING id, body, created_at`, [req.user.id, type, id, body]);
  res.json({ id: String(c.id), author: req.user.username, body: c.body, created: c.created_at, mine: true });
});

// Borra un comentario propio (o cualquiera si es admin).
router.delete('/catalog/comments/:id', async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  if (!cid) return res.status(400).json({ error: 'id inválido' });
  const cond = req.user.role === 'admin' ? '' : ' AND user_id=$2';
  const params = req.user.role === 'admin' ? [cid] : [cid, req.user.id];
  await query(`DELETE FROM comments WHERE id=$1${cond}`, params);
  res.json({ ok: true });
});

export default router;
