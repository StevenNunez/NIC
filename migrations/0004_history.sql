-- Historia de cada dominio en el archivo de internet (archive.org / Wayback Machine):
-- primera y última captura con respuesta correcta, y cuántos años abarcan.
-- wb_years: NULL = sin revisar (o archive.org no respondió), 0 = revisado y sin capturas, N = años de historia.
ALTER TABLE domains ADD COLUMN wb_checked_at INTEGER;
ALTER TABLE domains ADD COLUMN wb_first INTEGER;  -- epoch ms
ALTER TABLE domains ADD COLUMN wb_last INTEGER;   -- epoch ms
ALTER TABLE domains ADD COLUMN wb_years INTEGER;
CREATE INDEX idx_domains_history ON domains (wb_years DESC) WHERE wb_years > 0;

-- Dominios que consulté a mano en la sección "el dominio ya no existe" (existan o no en la lista de NIC).
CREATE TABLE lookups (
  name        TEXT PRIMARY KEY,
  whois_state TEXT CHECK (whois_state IN ('registered', 'available', 'unknown')),
  expires_at  INTEGER,
  created_on  INTEGER,
  note        TEXT,              -- texto de NIC cuando no lo entendemos (sin titular)
  wb_first    INTEGER,
  wb_last     INTEGER,
  wb_years    INTEGER,           -- misma convención que en domains
  checked_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_lookups_checked ON lookups (checked_at DESC);
