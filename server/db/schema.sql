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
