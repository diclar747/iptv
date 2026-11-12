CREATE TABLE IF NOT EXISTS media_category_aliases (
  key TEXT PRIMARY KEY,
  target TEXT REFERENCES media_categories(name) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION media_category_key(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT regexp_replace(regexp_replace(
    translate(lower(btrim(value)), 'áéíóúüñ', 'aeiouun'),
    '[[:space:]_-]+', ' ', 'g'), '^ +| +$', '', 'g')
$$;

CREATE OR REPLACE FUNCTION media_category_initial_name(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE
    WHEN k IN ('action','accion') THEN 'Acción'
    WHEN k IN ('adventure','aventura') THEN 'Aventura'
    WHEN k IN ('animation','animacion') THEN 'Animación'
    WHEN k IN ('comedy','comedia') THEN 'Comedia'
    WHEN k IN ('crime','crimen') THEN 'Crimen'
    WHEN k IN ('documentary','documental','documentales') THEN 'Documentales'
    WHEN k = 'drama' THEN 'Drama'
    WHEN k IN ('family','familia') THEN 'Familia'
    WHEN k IN ('fantasy','fantasia') THEN 'Fantasía'
    WHEN k IN ('history','historia') THEN 'Historia'
    WHEN k IN ('horror','terror') THEN 'Terror'
    WHEN k IN ('music','musical') THEN 'Musical'
    WHEN k IN ('mystery','misterio') THEN 'Misterio'
    WHEN k IN ('movie','pelicula','peliculas') THEN 'Películas'
    WHEN k IN ('tv movie','pelicula de tv') THEN 'Película de TV'
    WHEN k = 'romance' THEN 'Romance'
    WHEN k IN ('science fiction','ciencia ficcion','sci fi') THEN 'Ciencia Ficción'
    WHEN k IN ('suspense','suspenso','thriller') THEN 'Suspenso'
    WHEN k IN ('war','belica','belico') THEN 'Bélico'
    WHEN k = 'western' THEN 'Western'
    WHEN k = 'videos musicales' THEN 'Videos musicales'
    WHEN k = 'videos' THEN 'Videos'
    ELSE left(regexp_replace(btrim(value), '[[:space:]]+', ' ', 'g'),80)
  END
  FROM (SELECT media_category_key(value) k) AS normalized
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM media_category_aliases WHERE key='') THEN RETURN; END IF;

  CREATE TEMP TABLE category_migration_raw ON COMMIT DROP AS
    SELECT name, media_category_key(name) AS key, media_category_initial_name(name) AS preferred
    FROM (
      SELECT name FROM media_categories
      UNION SELECT category FROM movies
      UNION SELECT category FROM series
      UNION SELECT options->>'category' FROM media_import_jobs
      UNION VALUES ('Películas'),('Videos musicales'),('Documentales'),('Videos')
    ) AS names
    WHERE media_category_key(name) <> '';

  CREATE TEMP TABLE category_migration_names ON COMMIT DROP AS
    SELECT DISTINCT ON (media_category_key(preferred)) media_category_key(preferred) AS key, preferred AS name
    FROM category_migration_raw
    ORDER BY media_category_key(preferred), (preferred <> initcap(preferred)) DESC, preferred;

  INSERT INTO media_categories(name) SELECT name FROM category_migration_names ON CONFLICT DO NOTHING;
  INSERT INTO media_category_aliases(key,target)
    SELECT r.key, c.name FROM category_migration_raw r
      JOIN category_migration_names c ON c.key=media_category_key(r.preferred)
    UNION SELECT key,name FROM category_migration_names
    ON CONFLICT DO NOTHING;

  UPDATE movies m SET category=a.target FROM media_category_aliases a
    WHERE media_category_key(m.category)=a.key AND m.category IS DISTINCT FROM a.target;
  UPDATE series s SET category=a.target FROM media_category_aliases a
    WHERE media_category_key(s.category)=a.key AND s.category IS DISTINCT FROM a.target;
  UPDATE media_import_jobs j SET options=jsonb_set(j.options,'{category}',to_jsonb(a.target))
    FROM media_category_aliases a WHERE media_category_key(j.options->>'category')=a.key
    AND j.options->>'category' IS DISTINCT FROM a.target;
  UPDATE movies SET category=NULL WHERE media_category_key(category)='';
  UPDATE series SET category=NULL WHERE media_category_key(category)='';
  DELETE FROM media_categories c WHERE NOT EXISTS (SELECT 1 FROM category_migration_names n WHERE n.name=c.name);
  INSERT INTO media_category_aliases(key) VALUES ('');
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS media_categories_key_idx ON media_categories(media_category_key(name));
CREATE INDEX IF NOT EXISTS media_category_alias_target_idx ON media_category_aliases(target);
CREATE INDEX IF NOT EXISTS movies_category_idx ON movies(category);
CREATE INDEX IF NOT EXISTS series_category_idx ON series(category);
CREATE INDEX IF NOT EXISTS media_jobs_category_idx ON media_import_jobs((options->>'category'));

CREATE OR REPLACE FUNCTION media_category_lookup(value TEXT) RETURNS TEXT
LANGUAGE sql STABLE STRICT AS $$
  SELECT target FROM media_category_aliases
  WHERE key IN (media_category_key(value), media_category_key(media_category_initial_name(value)))
  ORDER BY (key=media_category_key(value)) DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION media_category_resolve(value TEXT) RETURNS TEXT
LANGUAGE plpgsql STRICT AS $$
DECLARE
  original TEXT := media_category_key(value);
  preferred TEXT := media_category_initial_name(value);
  normalized TEXT := media_category_key(preferred);
  result TEXT;
BEGIN
  IF original='' THEN RETURN NULL; END IF;
  SELECT target INTO result FROM media_category_aliases WHERE key=original;
  IF FOUND THEN RETURN result; END IF;
  SELECT target INTO result FROM media_category_aliases WHERE key=normalized;
  IF FOUND THEN RETURN result; END IF;

  INSERT INTO media_categories(name) VALUES(preferred) ON CONFLICT DO NOTHING;
  SELECT name INTO result FROM media_categories WHERE media_category_key(name)=normalized;
  INSERT INTO media_category_aliases(key,target) VALUES (normalized,result) ON CONFLICT DO NOTHING;
  RETURN media_category_lookup(value);
END
$$;

CREATE OR REPLACE FUNCTION normalize_content_category() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.category := media_category_resolve(NEW.category);
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION normalize_job_category() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.options->>'category' IS NOT NULL THEN
    NEW.options := jsonb_set(NEW.options,'{category}',
      COALESCE(to_jsonb(media_category_resolve(NEW.options->>'category')), 'null'::jsonb));
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS normalize_movie_category ON movies;
CREATE TRIGGER normalize_movie_category BEFORE INSERT OR UPDATE OF category ON movies
FOR EACH ROW EXECUTE FUNCTION normalize_content_category();
DROP TRIGGER IF EXISTS normalize_series_category ON series;
CREATE TRIGGER normalize_series_category BEFORE INSERT OR UPDATE OF category ON series
FOR EACH ROW EXECUTE FUNCTION normalize_content_category();
DROP TRIGGER IF EXISTS normalize_import_category ON media_import_jobs;
CREATE TRIGGER normalize_import_category BEFORE INSERT OR UPDATE OF options ON media_import_jobs
FOR EACH ROW EXECUTE FUNCTION normalize_job_category();
