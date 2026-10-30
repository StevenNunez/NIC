-- Índices parciales para que las tareas de cada minuto no recorran toda la tabla de dominios
-- (D1 gratis: 5.000.000 de filas leídas por día). Solo contienen lo que aún espera revisión en archive.org.
CREATE INDEX idx_domains_wb_fresh ON domains (first_seen_at DESC) WHERE wb_years IS NULL AND baseline = 0;
CREATE INDEX idx_domains_wb_backlog ON domains (len) WHERE wb_years IS NULL AND baseline = 1;
