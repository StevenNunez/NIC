// Consulta whois pública de NIC Chile (búsqueda exacta, sin captcha):
//   https://www.nic.cl/registry/Whois.do?d=<dominio>
// De la respuesta solo se guardan las fechas. El nombre del titular es dato personal
// de un tercero y no hace falta para decidir nada: se descarta en el acto.

export type WhoisState = "registered" | "available" | "unknown";

export interface WhoisInfo {
  state: WhoisState;
  createdAt: number | null; // epoch ms
  expiresAt: number | null; // epoch ms
  /** Solo si NIC mostró algo que no entendemos (p. ej. un estado nuevo): texto corto, sin titular. */
  note: string | null;
}

export async function fetchWhois(name: string): Promise<WhoisInfo> {
  const res = await fetch(`https://www.nic.cl/registry/Whois.do?d=${encodeURIComponent(name)}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NIC-radar/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`NIC respondió HTTP ${res.status}`);
  return parseWhois(await res.text());
}

const DATE_RE = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) (CLST|CLT)/;

/** "2026-12-26 20:07:23 CLST" -> epoch ms. CLST = UTC-3 (verano), CLT = UTC-4 (invierno). */
export function parseNicDate(text: string): number | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, zone] = m;
  const offsetHours = zone === "CLST" ? 3 : 4;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) + offsetHours, Number(mi), Number(s));
}

function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseWhois(html: string): WhoisInfo {
  const text = toText(html);

  if (/Nombre de dominio no existe/i.test(text)) {
    return { state: "available", createdAt: null, expiresAt: null, note: null };
  }

  const expires = /Fecha de expiraci[oó]n:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} CL\w*)/i.exec(text);
  if (expires) {
    const created = /Fecha de creaci[oó]n:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} CL\w*)/i.exec(text);
    return {
      state: "registered",
      createdAt: created ? parseNicDate(created[1]) : null,
      expiresAt: parseNicDate(expires[1]),
      note: null,
    };
  }

  // Algo que no conocemos (por ejemplo el estado de un dominio en restauración): se deja
  // un extracto para aprender cómo lo muestra NIC, sin el titular.
  const start = text.indexOf("Contenga");
  const end = text.indexOf("Fecha Actual");
  const excerpt = (start >= 0 ? text.slice(start + 8, end > start ? end : start + 400) : text.slice(0, 300))
    .replace(/Titular:.*?(?=Agente Registrador|Fecha de creaci)/i, "")
    .trim()
    .slice(0, 300);
  return { state: "unknown", createdAt: null, expiresAt: null, note: excerpt || null };
}
