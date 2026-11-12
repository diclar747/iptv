import express from 'express';
import { many, tx } from './pg.js';
import { requireRole } from './auth.js';

const router = express.Router();
const path = '/admin/media-categories';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const handle = fn => async (req, res, next) => {
  try { await fn(req, res); }
  catch (e) {
    if (!e.status) return next(e);
    res.status(e.status).json({ error: e.message });
  }
};
const nameOf = value => {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').normalize('NFC') : '';
  if (!name || [...name].length > 80 || !/[\p{L}\p{N}]/u.test(name)) {
    throw fail('Usá un nombre de categoría de hasta 80 caracteres.');
  }
  return name;
};

const counts = `
  SELECT (SELECT count(*)::int FROM movies WHERE category=$1) AS movies,
         (SELECT count(*)::int FROM series WHERE category=$1) AS series,
         (SELECT count(*)::int FROM media_import_jobs WHERE options->>'category'=$1) AS imports`;
const edit = fn => tx(async c => {
  // Wait for in-flight publishers before changing references or retiring a label.
  await c.query('LOCK TABLE media_import_jobs, movies, series IN EXCLUSIVE MODE');
  return fn(c);
});
async function existing(c, name) {
  const { rowCount } = await c.query('SELECT 1 FROM media_categories WHERE name=$1', [name]);
  if (!rowCount) throw fail('La categoría ya no existe. Actualizá la lista.', 404);
}
async function reserve(c, name, source = null) {
  const { rows: [row] } = await c.query(
    'SELECT media_category_key($1) AS key, media_category_lookup($1) AS target', [name]);
  if (row.target && row.target !== source) throw fail('Ya existe una categoría equivalente: ' + row.target, 409);
  return row.key;
}
async function alias(c, key, name) {
  await c.query(`INSERT INTO media_category_aliases(key,target) VALUES($1,$2)
    ON CONFLICT(key) DO UPDATE SET target=EXCLUDED.target`, [key, name]);
}
async function move(c, from, to) {
  await c.query('UPDATE movies SET category=$2 WHERE category=$1', [from, to]);
  await c.query('UPDATE series SET category=$2 WHERE category=$1', [from, to]);
  await c.query(`UPDATE media_import_jobs SET options=jsonb_set(options,'{category}',to_jsonb($2::text))
    WHERE options->>'category'=$1`, [from, to]);
}
async function merge(c, from, to) {
  if (from === to) throw fail('Elegí otra categoría de destino.');
  await existing(c, to);
  await c.query('UPDATE media_category_aliases SET target=$2 WHERE target=$1', [from, to]);
  await move(c, from, to);
  await c.query('DELETE FROM media_categories WHERE name=$1', [from]);
}

router.use(path, requireRole('admin'));
router.get(path, handle(async (req, res) => {
  res.json(await many(`SELECT c.name, COALESCE(m.n,0) AS movies, COALESCE(s.n,0) AS series,
    COALESCE(j.n,0) AS imports FROM media_categories c
    LEFT JOIN (SELECT category,count(*)::int n FROM movies GROUP BY category) m ON m.category=c.name
    LEFT JOIN (SELECT category,count(*)::int n FROM series GROUP BY category) s ON s.category=c.name
    LEFT JOIN (SELECT options->>'category' AS category,count(*)::int n FROM media_import_jobs GROUP BY 1) j ON j.category=c.name
    ORDER BY c.name`));
}));
router.post(path, handle(async (req, res) => {
  const name = nameOf(req.body?.name);
  await edit(async c => {
    const key = await reserve(c, name);
    await c.query('INSERT INTO media_categories(name) VALUES($1)', [name]);
    await alias(c, key, name);
    const { rows: [canonical] } = await c.query(
      'SELECT media_category_key(media_category_initial_name($1)) AS key', [name]);
    if (canonical.key !== key) await alias(c, canonical.key, name);
  });
  res.status(201).json({ name });
}));
router.patch(path + '/:name', handle(async (req, res) => {
  const from = req.params.name, name = nameOf(req.body?.name);
  await edit(async c => {
    await existing(c, from);
    if (from === name) return;
    const key = await reserve(c, name, from);
    await c.query('UPDATE media_categories SET name=$2 WHERE name=$1', [from, name]);
    await alias(c, key, name);
    const { rows: [canonical] } = await c.query(
      'SELECT media_category_key(media_category_initial_name($1)) AS key', [name]);
    if (canonical.key !== key) await alias(c, canonical.key, name);
    await move(c, from, name);
  });
  res.json({ name });
}));
router.post(path + '/:name/merge', handle(async (req, res) => {
  const from = req.params.name, to = nameOf(req.body?.target);
  await edit(async c => { await existing(c, from); await merge(c, from, to); });
  res.json({ name: to });
}));
router.delete(path + '/:name', handle(async (req, res) => {
  const name = req.params.name;
  await edit(async c => {
    await existing(c, name);
    if (req.query.replacement) return merge(c, name, nameOf(req.query.replacement));
    const { rows: [used] } = await c.query(counts, [name]);
    if (used.movies || used.series || used.imports) {
      throw fail('Esta categoría está en uso. Elegí otra para trasladar el contenido y las importaciones.', 409);
    }
    await c.query('DELETE FROM media_categories WHERE name=$1', [name]);
  });
  res.json({ ok: true });
}));

export default router;
