import { recordEvent } from "./events.ts";
import { notifyAll } from "./notify.ts";
import { diffWhois, planReminder, releaseLagDays, type ReminderKind, type WhoisSnapshot } from "./reminders.ts";
import { chileDate, isDaytime, santiagoTime } from "./schedule.ts";
import { fetchWhois, type WhoisInfo } from "./whois.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Cuántos dominios se consultan a NIC por pasada: con poca vigilancia no se nota, con mucha no lo satura. */
const PER_RUN = 2;

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
export async function alertDomain(env: Env, name: string, now: number, via: "list" | "whois"): Promise<boolean> {
  const claimed = await env.DB.prepare("UPDATE watchlist SET notified_at = ?2 WHERE name = ?1 AND notified_at IS NULL")
    .bind(name, now)
    .run();
  if (!claimed.meta.changes) return false;

  // Cuánto pasó entre el vencimiento y la liberación: es lo que no sabemos de NIC y vamos midiendo.
  const row = await env.DB.prepare("SELECT expires_at FROM watchlist WHERE name = ?1").bind(name).first<{ expires_at: number | null }>();
  const detail: Record<string, unknown> = { via };
  if (row?.expires_at && row.expires_at < now) {
    detail.expiresAt = row.expires_at;
    detail.lagDays = releaseLagDays(row.expires_at, now);
  }
  await recordEvent(env, name, { kind: "released", detail, once: true }, now);

  const delivered = await notifyAll(
    env,
    { title: `🔔 ${name} está disponible`, body: "NIC lo liberó. Toca para inscribirlo antes que otro.", url: `/?w=${encodeURIComponent(name)}`, tag: `watch-${name}` },
    "high",
  );
  if (delivered > 0) {
    await recordEvent(env, name, { kind: "alerted", detail: { delivered, via } }, now);
    return true;
  }
  await env.DB.prepare("UPDATE watchlist SET notified_at = NULL WHERE name = ?1").bind(name).run();
  return false;
}

/** Consulta a NIC, guarda las fechas y registra lo que cambió. Si quedó libre o lo renovaron, avisa. */
export async function refreshWhois(env: Env, name: string): Promise<WhoisInfo> {
  const now = Date.now();
  const before = await env.DB.prepare("SELECT whois_state, expires_at, whois_note FROM watchlist WHERE name = ?1").bind(name).first<{
    whois_state: WhoisInfo["state"] | null;
    expires_at: number | null;
    whois_note: string | null;
  }>();
  const info = await fetchWhois(name);

  await env.DB.prepare(
    `UPDATE watchlist SET whois_state = ?2, created_on = ?3, expires_at = ?4, whois_note = ?5, whois_checked_at = ?6 WHERE name = ?1`,
  )
    .bind(name, info.state, info.createdAt, info.expiresAt, info.note, now)
    .run();

  const prev: WhoisSnapshot = { state: before?.whois_state ?? null, expiresAt: before?.expires_at ?? null, note: before?.whois_note ?? null };
  const diff = diffWhois(prev, info);
  for (const spec of diff.events) await recordEvent(env, name, spec, now);

  if (diff.renewed) {
    await notifyAll(env, {
      title: `🔄 ${name} fue renovado`,
      body: `El titular pagó: ya no vence el ${chileDate(diff.renewed.from)}, ahora vence el ${chileDate(diff.renewed.to)}. Sigo vigilándolo.`,
      url: `/?w=${encodeURIComponent(name)}`,
      tag: `renewed-${name}`,
    });
  }
  if (info.state === "available" && prev.state !== "available") await alertDomain(env, name, now, "whois");
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

function reminderMessage(name: string, kind: ReminderKind, expiresAt: number): { title: string; body: string; urgency: "normal" | "high" } {
  const when = chileDate(expiresAt);
  switch (kind) {
    case "d30":
      return { title: `⏳ ${name} vence en 30 días`, body: `Vence el ${when}. Si el titular no renueva, pasa a restauración y después se libera.`, urgency: "normal" };
    case "d7":
      return { title: `⚠️ ${name} vence en 7 días`, body: `Vence el ${when}. Ya conviene tener lista la cuenta de NIC para inscribirlo.`, urgency: "normal" };
    case "d1":
      return { title: `🔥 ${name} vence mañana`, body: `Vence el ${when}. Desde ahora lo reviso cada 10 minutos.`, urgency: "high" };
    case "expired":
      return { title: `⏱️ ${name} venció`, body: "Sigue inscrito: NIC todavía no lo libera. Lo reviso cada 10 minutos y te aviso apenas quede libre.", urgency: "high" };
  }
}

/**
 * Avisos de calendario sobre los dominios vigilados. Solo de día: lo que se cruce de
 * noche queda pendiente y sale a las 8:00.
 */
export async function checkReminders(env: Env): Promise<void> {
  const now = Date.now();
  if (!isDaytime(santiagoTime(new Date(now)))) return;

  const { results } = await env.DB.prepare(
    `SELECT w.name, w.created_at AS createdAt, w.expires_at AS expiresAt, r.kind AS sent
     FROM watchlist w
     LEFT JOIN watch_reminders r ON r.name = w.name AND r.expires_at = w.expires_at
     WHERE w.notified_at IS NULL AND w.whois_state = 'registered' AND w.expires_at IS NOT NULL`,
  ).all<{ name: string; createdAt: number; expiresAt: number; sent: ReminderKind | null }>();

  const byName = new Map<string, { createdAt: number; expiresAt: number; sent: ReminderKind[] }>();
  for (const r of results) {
    const entry = byName.get(r.name) ?? { createdAt: r.createdAt, expiresAt: r.expiresAt, sent: [] };
    if (r.sent) entry.sent.push(r.sent);
    byName.set(r.name, entry);
  }

  for (const [name, w] of byName) {
    const plan = planReminder(w.expiresAt, w.createdAt, w.sent, now);
    if (!plan) continue;

    // Que venció queda en el historial aunque no haya aviso (p. ej. si se agregó ya vencido).
    // Lleva la hora de detección; la fecha real de vencimiento va en el detalle.
    if (plan.mark.includes("expired")) await recordEvent(env, name, { kind: "expired", detail: { expiresAt: w.expiresAt }, once: true }, now);

    const mark = (kind: ReminderKind, notified: boolean) =>
      env.DB.prepare("INSERT OR IGNORE INTO watch_reminders (name, kind, expires_at, sent_at, notified) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(name, kind, w.expiresAt, now, notified ? 1 : 0)
        .run();

    // Los umbrales más lejanos ya no se avisan nunca: se marcan en silencio.
    for (const kind of plan.mark) if (kind !== plan.kind) await mark(kind, false);

    if (!plan.notify) {
      await mark(plan.kind, false);
      continue;
    }
    const msg = reminderMessage(name, plan.kind, w.expiresAt);
    const delivered = await notifyAll(env, { title: msg.title, body: msg.body, url: `/?w=${encodeURIComponent(name)}`, tag: `reminder-${name}` }, msg.urgency);
    if (delivered === 0) continue; // sin dispositivos: se reintenta en la próxima pasada
    await mark(plan.kind, true);
    await recordEvent(env, name, { kind: "reminder", detail: { level: plan.kind, delivered } }, now);
  }
}
