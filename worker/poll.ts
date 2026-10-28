import { fetchWeeklyList } from "./nic.ts";
import { notifyAll } from "./notify.ts";
import { inDigestWindow, santiagoTime } from "./schedule.ts";
import { recordEvent } from "./events.ts";
import { digestHistoryLine } from "./history-alerts.ts";
import { getSettings } from "./settings.ts";
import { alertDomain } from "./watch.ts";

export interface PollResult {
  ok: boolean;
  at: number;
  total?: number;
  added?: number;
  alerts?: number;
  ms: number;
  error?: string;
}

/**
 * Una pasada completa: baja la lista de NIC, guarda los dominios nuevos, avisa si
 * alguno de la lista de vigilancia ya está disponible y manda el resumen de la mañana.
 */
export async function runPoll(env: Env): Promise<PollResult> {
  const t0 = Date.now();
  const now = new Date(t0);
  try {
    const { domains } = await fetchWeeklyList();
    const json = JSON.stringify(domains);
    const time = santiagoTime(now);

    // La primera carga trae ~2.000 dominios que ya estaban: no son "liberaciones nuevas".
    const known = (await env.DB.prepare("SELECT COUNT(*) AS c FROM domains").first<{ c: number }>())?.c ?? 0;

    // json_each evita armar SQL con los nombres y mantiene el insert en una sola consulta.
    const ins = await env.DB.prepare(
      `INSERT OR IGNORE INTO domains (name, first_seen_at, first_seen_hour, baseline)
       SELECT value, ?2, ?3, ?4 FROM json_each(?1) WHERE value NOT IN (SELECT name FROM domains)`,
    )
      .bind(json, t0, time.hour, known === 0 ? 1 : 0)
      .run();
    const added = ins.meta.changes ?? 0;

    const alerts = await alertWatchlist(env, json, t0);
    await maybeSendDigest(env, t0, time.date, inDigestWindow(time), known === 0);

    const result: PollResult = { ok: true, at: t0, total: domains.length, added, alerts, ms: Date.now() - t0 };
    await finish(env, result, added > 0 || alerts > 0);
    return result;
  } catch (err) {
    const result: PollResult = { ok: false, at: t0, ms: Date.now() - t0, error: String(err instanceof Error ? err.message : err) };
    console.error(JSON.stringify({ evt: "poll_failed", error: result.error }));
    await finish(env, result, true).catch(() => {});
    return result;
  }
}

async function alertWatchlist(env: Env, listJson: string, now: number): Promise<number> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM watchlist WHERE notified_at IS NULL AND name IN (SELECT value FROM json_each(?1))",
  )
    .bind(listJson)
    .all<{ name: string }>();

  let alerts = 0;
  for (const { name } of results) {
    await recordEvent(env, name, { kind: "in_list", once: true }, now);
    if (await alertDomain(env, name, now, "list")) alerts++;
  }
  return alerts;
}

/** Un solo mensaje por día, a la mañana, con lo que se liberó mientras dormías. */
async function maybeSendDigest(env: Env, now: number, today: string, inWindow: boolean, firstRun: boolean): Promise<void> {
  if (!inWindow || firstRun) return;
  const last = await env.DB.prepare("SELECT value FROM meta WHERE key = 'digest'").first<{ value: string }>();
  const prev = last ? (JSON.parse(last.value) as { date: string; at: number }) : null;
  if (prev?.date === today) return;

  const since = prev?.at ?? now - 24 * 3600_000;
  const total = (await env.DB.prepare("SELECT COUNT(*) AS c FROM domains WHERE baseline = 0 AND first_seen_at > ?1").bind(since).first<{ c: number }>())?.c ?? 0;
  if (total > 0) {
    const { results } = await env.DB.prepare(
      `SELECT name FROM domains
       WHERE baseline = 0 AND first_seen_at > ?1 AND has_digit = 0 AND has_hyphen = 0
       ORDER BY len ASC, name ASC LIMIT 5`,
    )
      .bind(since)
      .all<{ name: string }>();
    const picks = results.map((r) => r.name).join(", ");
    // Lo que salió con historia (de noche, o sobre el tope diario) no tuvo aviso propio: va aquí.
    const { historyAlert } = await getSettings(env);
    const { results: hist } = historyAlert.enabled
      ? await env.DB.prepare(
          `SELECT name, wb_years AS years FROM domains
           WHERE baseline = 0 AND first_seen_at > ?1 AND wb_years >= ?2 AND status != 'dismissed'
           ORDER BY wb_years DESC, len ASC LIMIT 3`,
        )
          .bind(since, historyAlert.minYears)
          .all<{ name: string; years: number }>()
      : { results: [] as { name: string; years: number }[] };
    const delivered = await notifyAll(env, {
      title: `☀️ ${total} dominios liberados desde ayer`,
      body: [hist.length ? digestHistoryLine(hist) : "", picks ? `Los más cortos: ${picks}` : ""].filter(Boolean).join("\n") || "Abre la app para ver el listado.",
      url: "/?v=new",
      tag: "digest",
    });
    if (delivered === 0) return; // sin dispositivos: lo reintenta en la próxima pasada de la mañana
  }
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('digest', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1")
    .bind(JSON.stringify({ date: today, at: now }))
    .run();
}

async function finish(env: Env, r: PollResult, log: boolean): Promise<void> {
  const stmts = [
    env.DB.prepare("INSERT INTO meta (key, value) VALUES ('last_poll', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(JSON.stringify(r)),
  ];
  // La bitácora solo guarda lo que pasó algo: una fila por minuto sería ruido.
  if (log) {
    stmts.push(
      env.DB.prepare("INSERT INTO poll_log (at, ok, total, added, ms, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(
        r.at,
        r.ok ? 1 : 0,
        r.total ?? null,
        r.added ?? null,
        r.ms,
        r.error ?? null,
      ),
      env.DB.prepare("DELETE FROM poll_log WHERE id <= (SELECT MAX(id) FROM poll_log) - 500"),
    );
  }
  await env.DB.batch(stmts);
}
