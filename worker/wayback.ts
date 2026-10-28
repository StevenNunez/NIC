// Historia de un dominio en el archivo de internet (Wayback Machine, archive.org).
// Se usa la API ligera de "captura más cercana": pidiendo la más cercana a 1996 sale la
// primera y pidiendo la más cercana a 2099 sale la última. Responde en 1 a 4 s; la
// consulta completa por CDX tarda 20 a 40 s y se cae, así que no sirve para esto.

import { msToTs, snapshotUrl } from "../shared/domain.ts";

export { msToTs, snapshotUrl };

const AVAILABLE_URL = "https://archive.org/wayback/available";

export interface WaybackInfo {
  /** false si archive.org no respondió bien: no se sabe nada, hay que reintentar más tarde. */
  ok: boolean;
  firstAt: number | null; // epoch ms de la primera captura con respuesta correcta
  lastAt: number | null;
  /** Años que abarca la historia (de la primera a la última captura, ambos incluidos). 0 si no hay capturas. */
  years: number;
}

export function tsToMs(ts: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) : NaN;
}

export function yearsBetween(firstAt: number, lastAt: number): number {
  return new Date(lastAt).getUTCFullYear() - new Date(firstAt).getUTCFullYear() + 1;
}

/** Saca la marca de tiempo de la captura de la respuesta de archive.org (null si no hay captura correcta). */
export function parseAvailable(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const snaps = (body as { archived_snapshots?: unknown }).archived_snapshots;
  if (typeof snaps !== "object" || snaps === null) return null;
  const closest = (snaps as { closest?: unknown }).closest;
  if (typeof closest !== "object" || closest === null) return null;
  const { available, status, timestamp } = closest as { available?: unknown; status?: unknown; timestamp?: unknown };
  if (available !== true || typeof timestamp !== "string" || !/^\d{14}$/.test(timestamp)) return null;
  return String(status).startsWith("2") ? timestamp : null;
}

async function closest(name: string, around: string): Promise<string | null> {
  const res = await fetch(`${AVAILABLE_URL}?url=${encodeURIComponent(name)}&timestamp=${around}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NIC-radar/1.0)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`archive.org respondió HTTP ${res.status}`);
  // Si archive.org está caído devuelve una página HTML: el parseo falla y se trata como error.
  return parseAvailable(JSON.parse(await res.text()));
}

export async function fetchWayback(name: string): Promise<WaybackInfo> {
  try {
    const [first, last] = await Promise.all([closest(name, "19960101"), closest(name, "20991231")]);
    if (!first || !last) return { ok: true, firstAt: null, lastAt: null, years: 0 };
    const firstAt = tsToMs(first);
    const lastAt = tsToMs(last);
    return { ok: true, firstAt, lastAt, years: yearsBetween(firstAt, lastAt) };
  } catch (err) {
    console.error(JSON.stringify({ evt: "wayback_failed", name, error: String(err instanceof Error ? err.message : err) }));
    return { ok: false, firstAt: null, lastAt: null, years: 0 };
  }
}
