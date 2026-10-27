-- Datos de NIC (whois) de cada dominio vigilado. No se guarda el titular.
ALTER TABLE watchlist ADD COLUMN whois_state TEXT CHECK (whois_state IN ('registered', 'available', 'unknown'));
ALTER TABLE watchlist ADD COLUMN created_on INTEGER;        -- fecha de creación del dominio (epoch ms)
ALTER TABLE watchlist ADD COLUMN expires_at INTEGER;        -- fecha de expiración (epoch ms)
ALTER TABLE watchlist ADD COLUMN whois_checked_at INTEGER;  -- última consulta a NIC
ALTER TABLE watchlist ADD COLUMN whois_note TEXT;           -- texto de NIC cuando no lo entendemos
