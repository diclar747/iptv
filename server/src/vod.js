// VOD: películas y series. Seed demo con contenido de DOMINIO PÚBLICO
// (Internet Archive) para que la sección reproduzca de verdad. Más adelante
// un media server (Jellyfin) puede alimentar estas mismas tablas/endpoints.

import express from 'express';
import { query, one, many } from './pg.js';
import { requireActiveViewer } from './auth.js';

const dl = (id, file) => `https://archive.org/download/${id}/${file}`;
const poster = (id) => `https://archive.org/services/img/${id}`;

// --- Datos demo (dominio público) ---
const MOVIES = [
  ['His Girl Friday', 1940, 'Comedia', 'his_girl_friday', 'his_girl_friday_512kb.mp4',
    'Clásica comedia screwball de Howard Hawks.'],
  ['La Mansión de los Horrores', 1959, 'Terror', 'house_on_haunted_hill_ipod', 'house_on_haunted_hill_512kb.mp4',
    'Vincent Price invita a pasar la noche en una casa embrujada.'],
  ['El Libro de la Selva', 1942, 'Aventura', 'JungleBook', 'Jungle_Book_512kb.mp4',
    'Mowgli y la selva, en la versión clásica de 1942.'],
  ['Sita Sings the Blues', 2008, 'Animación', 'Sita_Sings_the_Blues', 'Sita_Sings_the_Blues_DVD_NTSC4.mp4',
    'Animación independiente premiada, libre para todos.'],
  ['Viaje al Planeta de las Mujeres Prehistóricas', 1967, 'Ciencia Ficción',
    'VoyagetothePlanetofPrehistoricWomen', 'VoyagetothePlanetofPrehistoricWomen_512kb.mp4',
    'Aventura espacial de culto de los años 60.'],
  ['Nosferatu', 1922, 'Terror', 'Nosferatu1922', 'Nosferatu-smaller2.mp4',
    'El clásico mudo del vampiro, de F. W. Murnau.'],
  ['Festival Charlie Chaplin', 1938, 'Comedia', 'charlie_chaplin_film_fest', 'charlie_chaplin_film_fest_512kb.mp4',
    'Cortos clásicos de Charlie Chaplin.'],
  ['Utopia', 1951, 'Comedia', 'utopia', 'Utopia.mp4',
    'La única película de Laurel y Hardy en dominio público.'],
];

const SERIES = [
  {
    title: 'Betty Boop', category: 'Animación', posterId: 'bb_snow_white',
    description: 'Los dibujos clásicos de Betty Boop de los años 30.',
    episodes: [
      ['Snow White', 'bb_snow_white', 'bb_snow_white_512kb.mp4'],
      ['Minnie the Moocher', 'bb_minnie_the_moocher', 'bb_minnie_the_moocher_512kb.mp4'],
      ['Betty Boop and Grampy', 'bb_and_grampy', 'bb_and_grampy_512kb.mp4'],
      ['Bamboo Isle', 'bb_bamboo_isle', 'bb_bamboo_isle_512kb.mp4'],
    ],
  },
  {
    title: 'Popeye el Marino', category: 'Animación', posterId: 'Popeye_meetsSinbadtheSailor',
    description: 'Las aventuras clásicas de Popeye.',
    episodes: [
      ['Meets Sinbad the Sailor', 'Popeye_meetsSinbadtheSailor', 'Popeye_meetsSinbadtheSailor_512kb.mp4'],
      ['Meets Ali Baba', 'PopeyeAliBaba', 'PopeyeAliBaba_512kb.mp4'],
      ['Big Bad Sinbad', 'popeye_big_bad_sinbad', 'popeye_big_bad_sinbad_512kb.mp4'],
      ['Ancient Fistory', 'popeye_the_sailor_ancient_fantasy', 'popeye_the_sailor_ancient_fantasy_512kb.mp4'],
    ],
  },
];

export async function ensureVodSeed() {
  const { n } = await one('SELECT count(*)::int AS n FROM movies');
  if (n === 0) {
    for (const [title, year, category, id, file, desc] of MOVIES) {
      await query(
        'INSERT INTO movies (title, year, category, poster, stream_url, description) VALUES ($1,$2,$3,$4,$5,$6)',
        [title, year, category, poster(id), dl(id, file), desc]
      );
    }
    console.log(`[seed] ${MOVIES.length} películas demo cargadas`);
  }

  const s = await one('SELECT count(*)::int AS n FROM series');
  if (s.n === 0) {
    for (const se of SERIES) {
      const row = await one(
        'INSERT INTO series (title, category, poster, description) VALUES ($1,$2,$3,$4) RETURNING id',
        [se.title, se.category, poster(se.posterId), se.description]
      );
      let ep = 1;
      for (const [title, id, file] of se.episodes) {
        await query(
          'INSERT INTO episodes (series_id, season, episode, title, stream_url) VALUES ($1,1,$2,$3,$4)',
          [row.id, ep++, title, dl(id, file)]
        );
      }
    }
    console.log(`[seed] ${SERIES.length} series demo cargadas`);
  }
}

// --- API ---
const router = express.Router();
router.use(requireActiveViewer); // VOD solo con suscripción activa

const movieDTO = (m) => ({
  id: m.id, title: m.title, year: m.year, poster: m.poster,
  category: m.category, description: m.description, streamUrl: m.stream_url,
});

router.get('/vod/movies', async (req, res) => {
  const { search, category } = req.query;
  const where = [];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`title ILIKE $${params.length}`); }
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  const sql = `SELECT * FROM movies ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY title`;
  res.json((await many(sql, params)).map(movieDTO));
});

router.get('/vod/movies/:id', async (req, res) => {
  const m = await one('SELECT * FROM movies WHERE id=$1', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Película no encontrada' });
  res.json(movieDTO(m));
});

router.get('/vod/series', async (req, res) => {
  const rows = await many(`
    SELECT s.*, (SELECT count(*)::int FROM episodes e WHERE e.series_id = s.id) AS episode_count
    FROM series s ORDER BY s.title`);
  res.json(rows.map((s) => ({
    id: s.id, title: s.title, poster: s.poster, category: s.category,
    description: s.description, episodeCount: s.episode_count,
  })));
});

router.get('/vod/series/:id', async (req, res) => {
  const s = await one('SELECT * FROM series WHERE id=$1', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Serie no encontrada' });
  const eps = await many('SELECT * FROM episodes WHERE series_id=$1 ORDER BY season, episode', [req.params.id]);
  res.json({
    id: s.id, title: s.title, poster: s.poster, category: s.category, description: s.description,
    episodes: eps.map((e) => ({
      id: e.id, season: e.season, episode: e.episode, title: e.title, streamUrl: e.stream_url,
    })),
  });
});

export default router;
