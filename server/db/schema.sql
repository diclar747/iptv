-- Esquema de la capa de negocio (Postgres). Idempotente.

CREATE TABLE IF NOT EXISTS users (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  pass_hash       TEXT NOT NULL,
  pass_salt       TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'reseller', 'client')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  parent_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  credits         INTEGER NOT NULL DEFAULT 0,          -- resellers
  expires_at      TIMESTAMPTZ,                         -- clients
  max_connections INTEGER NOT NULL DEFAULT 1,          -- clients
  package_name    TEXT,                                -- clients
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_users_parent ON users(parent_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS packages (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT NOT NULL,
  duration_days   INTEGER NOT NULL,
  credits         INTEGER NOT NULL,
  max_connections INTEGER NOT NULL DEFAULT 1,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  type        TEXT NOT NULL CHECK (type IN ('allocate', 'spend', 'refund')),
  amount      INTEGER NOT NULL,
  reseller_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  by_user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  client_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_reseller ON transactions(reseller_id);

-- ---------- VOD: películas y series ----------
CREATE TABLE IF NOT EXISTS movies (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       TEXT NOT NULL,
  year        INTEGER,
  poster      TEXT,
  description TEXT,
  category    TEXT,
  stream_url  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS series (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       TEXT NOT NULL,
  poster      TEXT,
  description TEXT,
  category    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS episodes (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  series_id  BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  season     INTEGER NOT NULL DEFAULT 1,
  episode    INTEGER NOT NULL,
  title      TEXT,
  stream_url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(series_id);

-- ---------- Perfil extendido (marca/contacto, sobre todo del vendedor) ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address      TEXT;

-- Precio de reventa que fija cada vendedor por paquete (en guaraníes).
CREATE TABLE IF NOT EXISTS reseller_prices (
  reseller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id  BIGINT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  price       NUMERIC(14,2) NOT NULL,
  PRIMARY KEY (reseller_id, package_id)
);

-- ---------- Datos bancarios (pago por transferencia) ----------
-- El admin carga los suyos (los ven sus distribuidores); cada distribuidor carga
-- los suyos (los ven sus clientes/compradores). Todo opcional.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name    TEXT;  -- banco
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_holder  TEXT;  -- titular
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account TEXT;  -- nº de cuenta
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_alias   TEXT;  -- alias
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_doc     TEXT;  -- cédula/RUC

-- ---------- Precios por paquete (en guaraníes) ----------
-- admin_price = lo que el distribuidor le paga al admin por ese paquete.
-- suggested_price = precio sugerido de venta al público (referencia).
-- El precio real distribuidor->cliente lo fija cada vendedor en reseller_prices.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS admin_price     NUMERIC(14,2);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS suggested_price NUMERIC(14,2);

-- ---------- Solicitudes de saldo / de alta como distribuidor ----------
-- Un distribuidor pide saldo a su padre (o al admin); un cliente puede pedir
-- convertirse en distribuidor. El pago se hace por transferencia, fuera del
-- sistema; al aprobar se asigna el saldo (y, si es upgrade, cambia el rol).
CREATE TABLE IF NOT EXISTS credit_requests (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,  -- a quién se le pide
  kind         TEXT NOT NULL DEFAULT 'credits' CHECK (kind IN ('credits', 'upgrade')),
  amount       INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_requests_target ON credit_requests(target_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_requests_requester ON credit_requests(requester_id);

-- ========== CATÁLOGO de películas y series (metadatos multi-proveedor) ==========
-- Separa METADATOS (TheTVDB/TMDB) de la REPRODUCCIÓN (media_sources). El catálogo
-- puede ser enorme; "Ver ahora" solo si hay una fuente autorizada vinculada.

CREATE TABLE IF NOT EXISTS catalog_providers (
  id          TEXT PRIMARY KEY,        -- 'thetvdb' | 'tmdb' | 'local'
  name        TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  attribution TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extensiones de catálogo sobre las tablas VOD existentes. stream_url pasa a opcional
-- (la reproducción vive ahora en media_sources; el seed de dominio público sigue válido).
ALTER TABLE movies ALTER COLUMN stream_url DROP NOT NULL;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS provider       TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS original_title TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS overview_es    TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS backdrop       TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS rating         NUMERIC(4,2);
ALTER TABLE movies ADD COLUMN IF NOT EXISTS runtime        INTEGER;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS country        TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS trailer        TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS hidden         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS featured       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS popularity     NUMERIC(10,2) DEFAULT 0;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE series ADD COLUMN IF NOT EXISTS provider       TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS original_title TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS overview_es    TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS backdrop       TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS rating         NUMERIC(4,2);
ALTER TABLE series ADD COLUMN IF NOT EXISTS year           INTEGER;
ALTER TABLE series ADD COLUMN IF NOT EXISTS country        TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS trailer        TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS status         TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS hidden         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE series ADD COLUMN IF NOT EXISTS featured       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE series ADD COLUMN IF NOT EXISTS popularity     NUMERIC(10,2) DEFAULT 0;
ALTER TABLE series ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE episodes ALTER COLUMN stream_url DROP NOT NULL;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS overview  TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS still     TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS air_date  DATE;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS runtime   INTEGER;

-- Temporadas (ficha por temporada).
CREATE TABLE IF NOT EXISTS seasons (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  number    INTEGER NOT NULL,
  title     TEXT,
  overview  TEXT,
  poster    TEXT,
  UNIQUE (series_id, number)
);

-- IDs externos por proveedor: la clave para deduplicar al sumar varias APIs.
CREATE TABLE IF NOT EXISTS external_ids (
  provider     TEXT NOT NULL,
  content_type TEXT NOT NULL,          -- 'movie'|'series'|'episode'|'person'
  external_id  TEXT NOT NULL,
  internal_id  BIGINT NOT NULL,
  PRIMARY KEY (provider, content_type, external_id)
);
CREATE INDEX IF NOT EXISTS idx_external_internal ON external_ids(content_type, internal_id);

-- Géneros y su relación con el contenido.
CREATE TABLE IF NOT EXISTS genres (
  id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_genres (
  content_type TEXT NOT NULL,          -- 'movie'|'series'
  content_id   BIGINT NOT NULL,
  genre_id     BIGINT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (content_type, content_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_cgenres_genre ON content_genres(genre_id);

-- Imágenes (portadas, fondos, stills de episodios).
CREATE TABLE IF NOT EXISTS artworks (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_type TEXT NOT NULL,
  content_id   BIGINT NOT NULL,
  kind         TEXT NOT NULL,          -- 'poster'|'backdrop'|'still'|'logo'
  url          TEXT NOT NULL,
  lang         TEXT
);
CREATE INDEX IF NOT EXISTS idx_artworks_content ON artworks(content_type, content_id);

-- Personas y reparto.
CREATE TABLE IF NOT EXISTS people (
  id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  TEXT NOT NULL,
  photo TEXT
);
CREATE TABLE IF NOT EXISTS content_credits (
  content_type TEXT NOT NULL,
  content_id   BIGINT NOT NULL,
  person_id    BIGINT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role         TEXT,                   -- 'director'|'actor'
  char_name    TEXT,
  sort         INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_credits_content ON content_credits(content_type, content_id);

-- Fuentes de reproducción AUTORIZADAS (separadas del catálogo de metadatos).
CREATE TABLE IF NOT EXISTS media_sources (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_type TEXT NOT NULL,          -- 'movie'|'episode'
  content_id   BIGINT NOT NULL,
  url          TEXT NOT NULL,
  kind         TEXT DEFAULT 'hls',
  user_agent   TEXT,
  referrer     TEXT,
  quality      TEXT,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_content ON media_sources(content_type, content_id);

-- Favoritos y progreso por usuario (persisten entre sincronizaciones).
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,          -- 'movie'|'series'
  content_id   BIGINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_type, content_id)
);
CREATE TABLE IF NOT EXISTS watch_progress (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,          -- 'movie'|'episode'
  content_id   BIGINT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  duration     INTEGER,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_type, content_id)
);

-- Interacciones sociales (me gusta y comentarios). content_id es TEXT para
-- soportar canales (id tipo "Telefuturo.py") además de películas y series.
CREATE TABLE IF NOT EXISTS content_likes (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,            -- 'movie'|'series'|'channel'
  content_id   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_type, content_id)
);
CREATE INDEX IF NOT EXISTS idx_content_likes_item ON content_likes(content_type, content_id);

CREATE TABLE IF NOT EXISTS comments (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,            -- 'movie'|'series'|'channel'
  content_id   TEXT NOT NULL,
  body         TEXT NOT NULL,
  hidden       BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(content_type, content_id, created_at DESC);

-- Importación / sincronización.
CREATE TABLE IF NOT EXISTS sync_jobs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider    TEXT NOT NULL,
  kind        TEXT NOT NULL,           -- 'movies'|'series'|'updates'
  status      TEXT NOT NULL,           -- 'running'|'paused'|'done'|'error'
  created     INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sync_cursors (
  provider TEXT NOT NULL,
  kind     TEXT NOT NULL,              -- 'movies'|'series'|'updates'
  page     INTEGER NOT NULL DEFAULT 0,
  since    BIGINT,
  done     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (provider, kind)
);
