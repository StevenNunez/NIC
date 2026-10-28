-- Avisos por historia: cuando NIC libera un dominio con muchos años de sitio, aunque no lo vigiles.
-- hist_alert: NULL = aún no evaluado, 1 = se envió el aviso, 0 = evaluado y no se avisó
--             (poco historial, de noche, ya no es fresco o se alcanzó el tope).
ALTER TABLE domains ADD COLUMN hist_alert INTEGER;
ALTER TABLE domains ADD COLUMN hist_alert_at INTEGER;
CREATE INDEX idx_domains_hist_alert ON domains (hist_alert_at) WHERE hist_alert = 1;

-- Los dominios de la carga inicial no son liberaciones nuevas: nunca generan aviso.
UPDATE domains SET hist_alert = 0 WHERE baseline = 1;
