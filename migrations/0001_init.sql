-- Dominios que NIC Chile publicó como "nuevamente disponibles para inscripción".
-- first_seen_* es la hora (de Chile) en que NUESTRO radar los vio por primera vez:
-- con eso se mide a qué hora del día NIC suele liberar.
CREATE TABLE domains (
  name            TEXT PRIMARY KEY,                 -- "pituto.cl", siempre en minúsculas
  first_seen_at   INTEGER NOT NULL,                 -- epoch ms
  first_seen_hour INTEGER NOT NULL,                 -- 0-23, hora de Chile
  baseline        INTEGER NOT NULL DEFAULT 0,       -- 1 = ya estaba en la primera carga (no cuenta para estadísticas)
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'favorite', 'dismissed')),
  note            TEXT,
  len             INTEGER GENERATED ALWAYS AS (length(name) - 3) VIRTUAL,
  has_hyphen      INTEGER GENERATED ALWAYS AS (instr(substr(name, 1, length(name) - 3), '-') > 0) VIRTUAL,
  has_digit       INTEGER GENERATED ALWAYS AS (substr(name, 1, length(name) - 3) GLOB '*[0-9]*') VIRTUAL
);
CREATE INDEX idx_domains_seen ON domains (first_seen_at DESC);
CREATE INDEX idx_domains_status ON domains (status);

-- Lista de vigilancia: dominios que quiero comprar cuando se liberen.
CREATE TABLE watchlist (
  name        TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  notified_at INTEGER                               -- NULL = aún no apareció en la lista de NIC
);

-- Suscripciones push del celular (una por dispositivo instalado).
CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Bitácora de cada consulta a NIC (se podan las más antiguas).
CREATE TABLE poll_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  ok         INTEGER NOT NULL,
  total      INTEGER,
  added      INTEGER,
  ms         INTEGER,
  error      TEXT
);

-- Valores sueltos: último resumen enviado, etc.
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Freno a los intentos de contraseña (por IP y por hora).
CREATE TABLE login_attempts (
  ip     TEXT NOT NULL,
  window INTEGER NOT NULL,
  n      INTEGER NOT NULL,
  PRIMARY KEY (ip, window)
);
