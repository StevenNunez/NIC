import { decideHistoryAlert, FRESH_MS, historyAlertMessage } from "./history-alerts.ts";
import { notifyAll } from "./notify.ts";
import { isDaytime, santiagoTime } from "./schedule.ts";
import { getSettings, type Settings } from "./settings.ts";
import { fetchWayback, type WaybackInfo } from "./wayback.ts";
import { fetchWhois, type WhoisInfo } from "./whois.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Dominios del respaldo que se revisan en archive.org por pasada: son 2 consultas cada uno, y no hay apuro. */
const BACKLOG_PER_RUN = 2;
/** Dominios recién liberados por pasada: aquí sí hay apuro, se revisan en paralelo. */
const FRESH_PER_RUN = 4;
/** Si archive.org no respondió, se vuelve a intentar con ese dominio después de este tiempo... */
const RETRY_AFTER = 6 * HOUR;
/** ...pero con un dominio recién liberado se insiste pronto, porque el aviso vale solo mientras es fresco. */
const RETRY_FRESH_AFTER = 10 * MIN;

interface Candidate {
  name: string;
  baseline: number;
}

/**
 * Revisa en segundo plano qué dominios de la lista de NIC tuvieron sitio. Van primero los
 * favoritos, luego los que el radar vio liberarse (esos en paralelo y avisando si tienen
 * mucha historia) y, dentro de cada grupo, los más cortos.
 */
export async function enrichWayback(env: Env): Promise<void> {
  const now = Date.now();
  const [settings, { results }] = await Promise.all([
    getSettings(env),
    env.DB.prepare(
      `SELECT name, baseline FROM domains
       WHERE status != 'dismissed'
         AND (wb_checked_at IS NULL
              OR (wb_years IS NULL AND wb_checked_at < CASE WHEN baseline = 0 AND first_seen_at > ?2 THEN ?3 ELSE ?1 END))
       ORDER BY (status = 'favorite') DESC, baseline ASC, first_seen_at DESC, len ASC
       LIMIT ${FRESH_PER_RUN}`,
    )
      .bind(now - RETRY_AFTER, now - FRESH_MS, now - RETRY_FRESH_AFTER)
      .all<Candidate>(),
  ]);

  // Si lo primero es un dominio recién liberado se atienden todos los frescos; si no, solo el respaldo, más despacio.
  const batch = results[0]?.baseline === 0 ? results.filter((r) => r.baseline === 0) : results.slice(0, BACKLOG_PER_RUN);
  await Promise.all(batch.map((c) => processDomain(env, c.name, now, settings)));
}

async function processDomain(env: Env, name: string, now: number, settings: Settings): Promise<void> {
  // Se reserva antes de consultar: si la pasada siguiente arranca mientras archive.org demora, no repite el dominio.
  const claimed = await env.DB.prepare(
    "UPDATE domains SET wb_checked_at = ?2 WHERE name = ?1 AND (wb_checked_at IS NULL OR wb_checked_at < ?3)",
  )
    .bind(name, now, now - RETRY_FRESH_AFTER)
    .run();
  if (!claimed.meta.changes) return;

  const info = await fetchWayback(name);
  await saveWayback(env, name, info, now);
  if (info.ok) await maybeAlertHistory(env, name, info, now, settings);
}

/**
 * Avisa de un dominio recién liberado que tuvo mucha historia. Solo para los que el radar vio
 * liberarse (no la carga inicial), de día, mientras siguen frescos y sin pasar el tope diario.
 */
async function maybeAlertHistory(env: Env, name: string, info: WaybackInfo, now: number, settings: Settings): Promise<void> {
  if (info.years < settings.historyAlert.minYears || info.firstAt === null || info.lastAt === null) return;

  const row = await env.DB.prepare("SELECT first_seen_at AS firstSeenAt, baseline, hist_alert AS histAlert FROM domains WHERE name = ?1").bind(name).first<{
    firstSeenAt: number;
    baseline: number;
    histAlert: number | null;
  }>();
  if (!row || row.baseline === 1 || row.histAlert !== null) return;

  // Se reserva antes de avisar para que dos pasadas no manden el mismo aviso.
  const claimed = await env.DB.prepare("UPDATE domains SET hist_alert = 0, hist_alert_at = ?2 WHERE name = ?1 AND hist_alert IS NULL").bind(name, now).run();
  if (!claimed.meta.changes) return;

  const sent = (await env.DB.prepare("SELECT COUNT(*) AS c FROM domains WHERE hist_alert = 1 AND hist_alert_at > ?1").bind(now - DAY).first<{ c: number }>())?.c ?? 0;
  const decision = decideHistoryAlert({
    settings: settings.historyAlert,
    years: info.years,
    firstSeenAt: row.firstSeenAt,
    now,
    daytime: isDaytime(santiagoTime(new Date(now))),
    sentLast24h: sent,
  });
  if (!decision.send) return;

  const msg = historyAlertMessage(name, info.years, info.firstAt, info.lastAt);
  const delivered = await notifyAll(env, { ...msg, url: `/?h=${encodeURIComponent(name)}`, tag: `history-${name}` }, "normal");
  if (delivered > 0) await env.DB.prepare("UPDATE domains SET hist_alert = 1 WHERE name = ?1").bind(name).run();
}

export async function saveWayback(env: Env, name: string, info: WaybackInfo, now: number): Promise<void> {
  // Sin respuesta de archive.org no se sobrescribe lo que ya se sabía.
  if (!info.ok) return;
  await env.DB.prepare("UPDATE domains SET wb_checked_at = ?2, wb_first = ?3, wb_last = ?4, wb_years = ?5 WHERE name = ?1")
    .bind(name, now, info.firstAt, info.lastAt, info.years)
    .run();
}

export interface LookupResult {
  name: string;
  whoisState: WhoisInfo["state"] | null;
  expiresAt: number | null;
  createdOn: number | null;
  note: string | null;
  wbFirst: number | null;
  wbLast: number | null;
  /** null: archive.org no respondió, no se sabe. */
  wbYears: number | null;
  checkedAt: number;
  /** Lo que no se pudo consultar, para decírselo al usuario. */
  problems: string[];
}

/** Consulta un dominio a mano: qué dice NIC ahora y qué historia tiene en archive.org. */
export async function lookupDomain(env: Env, name: string): Promise<LookupResult> {
  const now = Date.now();
  const [whois, wayback] = await Promise.allSettled([fetchWhois(name), fetchWayback(name)]);

  const problems: string[] = [];
  const w = whois.status === "fulfilled" ? whois.value : null;
  if (!w) problems.push("NIC no respondió");
  const h = wayback.status === "fulfilled" && wayback.value.ok ? wayback.value : null;
  if (!h) problems.push("archive.org no respondió");
  if (!w && !h) throw new Error("NIC y archive.org no respondieron. Prueba de nuevo en un rato.");

  const result: LookupResult = {
    name,
    whoisState: w?.state ?? null,
    expiresAt: w?.expiresAt ?? null,
    createdOn: w?.createdAt ?? null,
    note: w?.note ?? null,
    wbFirst: h?.firstAt ?? null,
    wbLast: h?.lastAt ?? null,
    wbYears: h ? h.years : null,
    checkedAt: now,
    problems,
  };

  await env.DB.prepare(
    `INSERT INTO lookups (name, whois_state, expires_at, created_on, note, wb_first, wb_last, wb_years, checked_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
     ON CONFLICT(name) DO UPDATE SET
       whois_state = COALESCE(?2, whois_state), expires_at = CASE WHEN ?2 IS NULL THEN expires_at ELSE ?3 END,
       created_on = CASE WHEN ?2 IS NULL THEN created_on ELSE ?4 END, note = CASE WHEN ?2 IS NULL THEN note ELSE ?5 END,
       wb_first = CASE WHEN ?8 IS NULL THEN wb_first ELSE ?6 END, wb_last = CASE WHEN ?8 IS NULL THEN wb_last ELSE ?7 END,
       wb_years = COALESCE(?8, wb_years), checked_at = ?9`,
  )
    .bind(name, result.whoisState, result.expiresAt, result.createdOn, result.note, result.wbFirst, result.wbLast, result.wbYears, now)
    .run();

  // Si el dominio está en la lista de NIC, se aprovecha para completar su historia.
  if (h) await saveWayback(env, name, h, now);
  return result;
}
