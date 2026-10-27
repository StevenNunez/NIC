// Reglas de nombres .cl compartidas por el Worker y la app.

const DOMAIN_RE = /^(?:[a-z0-9-]+\.)*[a-z0-9-]+\.cl$/;

/** "Pituto", "pituto.cl" o "https://www.pituto.cl/x" -> "pituto.cl" (o null si no es válido). */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "");
  if (!s) return null;
  // "pituto" -> pituto.cl, pero "pituto.com" no es un .cl: se rechaza en vez de inventar "pituto.com.cl".
  if (!s.endsWith(".cl")) {
    if (s.includes(".")) return null;
    s += ".cl";
  }
  return s.length <= 66 && DOMAIN_RE.test(s) ? s : null;
}

/** Enlace directo a la inscripción en NIC (el mismo botón "inscribir" de su listado). */
export function registerUrl(name: string): string {
  return `https://clientes.nic.cl/registrar/agregarDominio.do?d=${btoa(name)}`;
}
