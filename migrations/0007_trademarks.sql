-- Revisión de marcas hecha a mano: antes de comprar un dominio se busca el nombre en INAPI/TMview/WIPO
-- y aquí queda anotado qué se encontró. Solo tiene filas de los dominios que el usuario revisó.
CREATE TABLE trademark_checks (
  name       TEXT PRIMARY KEY,
  status     TEXT NOT NULL CHECK (status IN ('clear', 'risk', 'unsure')),
  note       TEXT,
  checked_at INTEGER NOT NULL
);
