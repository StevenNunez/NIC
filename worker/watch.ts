import { notifyAll } from "./notify.ts";
import { fetchWhois, type WhoisInfo } from "./whois.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Cuántos dominios se consultan a NIC por pasada: con poca vigilancia no se nota, con mucha no lo satura. */
const PER_RUN = 3;

interface WatchRow {
  name: string;
  whois_state: WhoisInfo["state"] | null;
  expires_at: number | null;
  whois_checked_at: number | null;
}

/**
 * Avisa que un dominio vigilado quedó disponible. Se marca antes de enviar para que
 * dos revisiones seguidas no manden el mismo aviso; si nadie lo recibió, se desmarca
 * y se reintenta en la próxima.
 */
export async function alertDomain(env: Env, name: string, now: number): Promise<boolean> {
  const claimed = await env.DB.prepare("UPDATE watchlist SET notified_at = ?2 WHERE name = ?1 AND notified_at IS NULL")
    .bind(name, now)
    .run();
  if (!claimed.meta.changes) return false;

  const delivered = await notifyAll(
    env,
    { title: `🔔 ${name} está disponible`, body: "NIC lo liberó. Toca para inscribirlo antes que otro.", url: `/?d=${encodeURIComponent(name)}`, tag: `watch-${name}` },
    "high",
  );
  if (delivered > 0) return true;
  await env.DB.prepare("UPDATE watchlist SET notified_at = NULL WHERE name = ?1").bind(name).run();
  return false;
}

/** Consulta a NIC y guarda las fechas. Si el whois dice que quedó libre, avisa. */
export async function refreshWhois(env: Env, name: string): Promise<WhoisInfo> {
  const now = Date.now();
  const before = await env.DB.prepare("SELECT whois_state FROM watchlist WHERE name = ?1").bind(name).first<{ whois_state: string | null }>();
  const info = await fetchWhois(name);

  await env.DB.prepare(
    `UPDATE watchlist SET whois_state = ?2, created_on = ?3, expires_at = ?4, whois_note = ?5, whois_checked_at = ?6 WHERE name = ?1`,
  )
    .bind(name, info.state, info.createdAt, info.expiresAt, info.note, now)
    .run();

  if (info.state === "available" && before?.whois_state !== "available") await alertDomain(env, name, now);
  return info;
}

/** Cada cuánto conviene volver a mirar un dominio: seguido cerca del vencimiento, poco si falta mucho. */
export function recheckEvery(row: Pick<WatchRow, "whois_state" | "expires_at">, now: number): number {
  if (row.whois_state === "available") return 12 * HOUR;
  if (row.whois_state !== "registered" || row.expires_at === null) return HOUR;
  const toExpiry = row.expires_at - now;
  if (toExpiry < DAY && toExpiry > -45 * DAY) return 10 * MIN; // alrededor del vencimiento y de la restauración
  if (toExpiry < 7 * DAY) return HOUR;
  return 12 * HOUR;
}

export async function refreshDueWhois(env: Env): Promise<void> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT name, whois_state, expires_at, whois_checked_at FROM watchlist WHERE notified_at IS NULL",
  ).all<WatchRow>();

  const due = results
    .filter((r) => r.whois_checked_at === null || now - r.whois_checked_at >= recheckEvery(r, now))
    .sort((a, b) => (a.whois_checked_at ?? 0) - (b.whois_checked_at ?? 0))
    .slice(0, PER_RUN);

  for (const { name } of due) {
    try {
      await refreshWhois(env, name);
    } catch (err) {
      console.error(JSON.stringify({ evt: "whois_failed", name, error: String(err instanceof Error ? err.message : err) }));
      // Se anota el intento para no insistir cada minuto contra un NIC que no responde.
      await env.DB.prepare("UPDATE watchlist SET whois_checked_at = ?2 WHERE name = ?1").bind(name, now).run();
    }
  }
}
