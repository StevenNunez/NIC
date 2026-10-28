-- Historial de cada dominio vigilado: qué mostró NIC y cuándo, y qué avisos salieron.
CREATE TABLE watch_events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL,
  at     INTEGER NOT NULL,   -- epoch ms
  kind   TEXT NOT NULL,      -- added, rearmed, whois_registered, renewed, expired, unknown, available_whois, in_list, released, alerted, reminder
  detail TEXT                -- JSON corto (fechas, texto de NIC, días)
);
CREATE INDEX idx_watch_events_name ON watch_events (name, at DESC);

-- Recordatorios de calendario ya procesados, para no repetirlos. Va la fecha de expiración
-- en la llave: si el dueño renueva, empieza un ciclo nuevo de avisos.
CREATE TABLE watch_reminders (
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL,  -- d30, d7, d1, expired
  expires_at INTEGER NOT NULL,
  sent_at    INTEGER NOT NULL,
  notified   INTEGER NOT NULL,  -- 1 = se envió push, 0 = se marcó en silencio (el umbral ya había pasado al agregarlo)
  PRIMARY KEY (name, kind, expires_at)
);

-- Lo que ya sabemos de los dominios que estaban vigilados antes de esta versión.
INSERT INTO watch_events (name, at, kind, detail)
  SELECT name, created_at, 'added', NULL FROM watchlist;
INSERT INTO watch_events (name, at, kind, detail)
  SELECT name, whois_checked_at, 'whois_registered', json_object('expiresAt', expires_at)
  FROM watchlist WHERE whois_state = 'registered' AND expires_at IS NOT NULL AND whois_checked_at IS NOT NULL;
