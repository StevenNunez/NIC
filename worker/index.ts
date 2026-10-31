import { normalizeDomain } from "../shared/domain.ts";
import { allowLoginAttempt, checkPassword, clearSessionCookie, isAuthenticated, makeSessionCookie } from "./auth.ts";
import { notifyAll } from "./notify.ts";
import { runPoll } from "./poll.ts";
import { checkReminders, refreshDueWhois, refreshWhois } from "./watch.ts";
import { listEvents, recordEvent } from "./events.ts";
import { enrichWayback, lookupDomain } from "./history.ts";
import { listTrademarks, removeTrademark, saveTrademark } from "./trademarks.ts";
import { getSettings, normalizeSettings, saveSettings } from "./settings.ts";
import { DAY_END_HOUR, DAY_START_HOUR, NIGHT_EVERY_MIN, isDaytime, santiagoTime, shouldPoll } from "./schedule.ts";

const json = (data: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

const bad = (error: string, status = 400) => json({ error }, status);

async function body<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

// Solo servicios push reales: el endpoint lo manda el navegador, pero no se le cree a ciegas.
const PUSH_HOSTS = [".push.apple.com", ".googleapis.com", ".mozilla.com", ".notify.windows.com"];
function validPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => u.hostname.endsWith(h));
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (err) {
      console.error(JSON.stringify({ evt: "unhandled", path: new URL(request.url).pathname, error: String(err) }));
      return bad("Error interno", 500);
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    if (!shouldPoll(santiagoTime(new Date(controller.scheduledTime)))) return;
    ctx.waitUntil(Promise.all([runPoll(env), refreshDueWhois(env), checkReminders(env), enrichWayback(env)]));
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname: path } = url;
  const method = request.method;

  if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);

  // Defensa contra peticiones de otros sitios (además de la cookie SameSite=Strict).
  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return bad("Origen no permitido", 403);
  }

  if (path === "/api/login" && method === "POST") return login(request, env);
  if (path === "/api/logout" && method === "POST") return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });

  if (!(await isAuthenticated(request, env))) return bad("No autorizado", 401);

  if (path === "/api/session") return json({ ok: true });
  if (path === "/api/stats" && method === "GET") return stats(env);
  if (path === "/api/domains" && method === "GET") return listDomains(env, url);
  if (path.startsWith("/api/domains/") && method === "PATCH") return patchDomain(request, env, decodeURIComponent(path.slice(13)));
  if (path === "/api/settings") {
    if (method === "GET") return json(await getSettings(env));
    if (method === "PUT") return putSettings(request, env);
  }
  if (path === "/api/trademarks") {
    if (method === "GET") return json({ rows: await listTrademarks(env) });
    if (method === "PUT") {
      const saved = await saveTrademark(env, await body(request));
      return saved ? json(saved) : bad("Revisión inválida");
    }
    if (method === "DELETE") return (await removeTrademark(env, (await body<{ name?: string }>(request))?.name ?? null)) ? json({ ok: true }) : bad("Dominio inválido");
  }
  if (path === "/api/lookup" && method === "POST") return lookup(request, env);
  if (path === "/api/lookups") {
    if (method === "GET") return getLookups(env);
    if (method === "DELETE") return removeLookup(request, env);
  }
  if (path === "/api/watchlist") {
    if (method === "GET") return getWatchlist(env);
    if (method === "POST") return addWatch(request, env);
    if (method === "DELETE") return removeWatch(request, env);
    if (method === "PATCH") return rearmWatch(request, env);
  }
  if (path === "/api/watchlist/refresh" && method === "POST") return refreshWatch(request, env);
  if (path === "/api/watchlist/events" && method === "GET") return watchEvents(env, url);
  if (path === "/api/push/key" && method === "GET") return json({ publicKey: env.VAPID_PUBLIC_KEY });
  if (path === "/api/push/subscribe") {
    if (method === "POST") return subscribe(request, env);
    if (method === "DELETE") return unsubscribe(request, env);
  }
  if (path === "/api/push/test" && method === "POST") return pushTest(env);
  if (path === "/api/poll" && method === "POST") return json(await runPoll(env));

  return bad("No existe", 404);
}

// ---------- sesión ----------

async function login(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  if (!(await allowLoginAttempt(env, ip))) return bad("Demasiados intentos. Prueba en una hora.", 429);
  const data = await body<{ password?: string }>(request);
  if (!data?.password || !(await checkPassword(env, data.password))) return bad("Contraseña incorrecta", 401);
  return json({ ok: true }, 200, { "Set-Cookie": await makeSessionCookie(env) });
}

// ---------- listado ----------

interface DomainRow {
  name: string;
  firstSeenAt: number;
  status: string;
  note: string | null;
  len: number;
  baseline: number;
  watched: number;
  wbYears: number | null;
  wbFirst: number | null;
  wbLast: number | null;
}

async function listDomains(env: Env, url: URL): Promise<Response> {
  const p = url.searchParams;
  const where: string[] = [];
  const args: (string | number)[] = [];

  const status = p.get("status") ?? "active";
  if (status === "active") where.push("d.status != 'dismissed'");
  else if (status === "new" || status === "favorite" || status === "dismissed") {
    where.push("d.status = ?");
    args.push(status);
  }

  const text = p.get("q")?.trim().toLowerCase();
  if (text) {
    where.push("d.name LIKE ? ESCAPE '\\'");
    args.push(`%${text.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
  }
  const minLen = Number(p.get("minLen"));
  const maxLen = Number(p.get("maxLen"));
  if (Number.isInteger(minLen) && minLen > 0) (where.push("d.len >= ?"), args.push(minLen));
  if (Number.isInteger(maxLen) && maxLen > 0) (where.push("d.len <= ?"), args.push(maxLen));
  if (p.get("noHyphen") === "1") where.push("d.has_hyphen = 0");
  if (p.get("noDigit") === "1") where.push("d.has_digit = 0");
  // "Solo liberados desde que el radar está prendido": excluye la carga inicial.
  if (p.get("fresh") === "1") where.push("d.baseline = 0");
  // Solo los que tuvieron sitio en archive.org.
  if (p.get("history") === "1") where.push("d.wb_years > 0");
  const minYears = Number(p.get("minYears"));
  if (Number.isInteger(minYears) && minYears > 0) (where.push("d.wb_years >= ?"), args.push(minYears));
  const sinceHours = Number(p.get("sinceHours"));
  if (sinceHours > 0) (where.push("d.first_seen_at >= ?"), args.push(Date.now() - sinceHours * 3600_000));

  const sort = p.get("sort");
  const order =
    sort === "short"
      ? "d.len ASC, d.name ASC"
      : sort === "alpha"
        ? "d.name ASC"
        : sort === "history"
          ? "d.wb_years DESC, d.wb_last DESC, d.len ASC, d.name ASC"
          : "d.first_seen_at DESC, d.name ASC";
  const limit = 100;
  const offset = Math.max(0, Math.floor(Number(p.get("offset")) || 0));
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const wantTotal = p.get("noTotal") !== "1";
  const [rows, total] = await Promise.all([
    env.DB.prepare(
      `SELECT d.name, d.first_seen_at AS firstSeenAt, d.status, d.note, d.len, d.baseline,
              d.wb_years AS wbYears, d.wb_first AS wbFirst, d.wb_last AS wbLast,
              EXISTS (SELECT 1 FROM watchlist w WHERE w.name = d.name) AS watched
       FROM domains d ${clause} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    )
      .bind(...args)
      .all<DomainRow>(),
    // El total recorre todas las filas que calzan: solo se pide cuando la pantalla lo muestra.
    wantTotal ? env.DB.prepare(`SELECT COUNT(*) AS c FROM domains d ${clause}`).bind(...args).first<{ c: number }>() : Promise.resolve(null),
  ]);
  return json({ rows: rows.results, total: total?.c ?? null, limit });
}

async function patchDomain(request: Request, env: Env, name: string): Promise<Response> {
  const data = await body<{ status?: string; note?: string }>(request);
  if (!data) return bad("Cuerpo inválido");
  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (data.status !== undefined) {
    if (!["new", "favorite", "dismissed"].includes(data.status)) return bad("Estado inválido");
    sets.push("status = ?");
    args.push(data.status);
  }
  if (data.note !== undefined) {
    sets.push("note = ?");
    args.push(data.note.slice(0, 500) || null);
  }
  if (!sets.length) return bad("Nada que cambiar");
  const r = await env.DB.prepare(`UPDATE domains SET ${sets.join(", ")} WHERE name = ?`).bind(...args, name).run();
  return r.meta.changes ? json({ ok: true }) : bad("Dominio no encontrado", 404);
}

// ---------- "el dominio ya no existe": consulta de historia ----------

interface LookupRow {
  name: string;
  whoisState: string | null;
  expiresAt: number | null;
  createdOn: number | null;
  note: string | null;
  wbFirst: number | null;
  wbLast: number | null;
  wbYears: number | null;
  checkedAt: number;
}

async function putSettings(request: Request, env: Env): Promise<Response> {
  const data = await body<unknown>(request);
  if (typeof data !== "object" || data === null) return bad("Cuerpo inválido");
  const settings = normalizeSettings(data);
  await saveSettings(env, settings);
  return json(settings);
}

async function lookup(request: Request, env: Env): Promise<Response> {
  const data = await body<{ name?: string }>(request);
  const name = normalizeDomain(data?.name ?? "");
  if (!name) return bad("Escribe un dominio .cl válido");
  try {
    return json(await lookupDomain(env, name));
  } catch (err) {
    return bad(err instanceof Error ? err.message : "No se pudo consultar", 502);
  }
}

async function getLookups(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT l.name, l.whois_state AS whoisState, l.expires_at AS expiresAt, l.created_on AS createdOn, l.note,
            l.wb_first AS wbFirst, l.wb_last AS wbLast, l.wb_years AS wbYears, l.checked_at AS checkedAt,
            EXISTS (SELECT 1 FROM watchlist w WHERE w.name = l.name) AS watched
     FROM lookups l ORDER BY l.checked_at DESC LIMIT 100`,
  ).all<LookupRow & { watched: number }>();
  return json({ rows: results });
}

async function removeLookup(request: Request, env: Env): Promise<Response> {
  const data = await body<{ name?: string }>(request);
  const name = normalizeDomain(data?.name ?? "");
  if (!name) return bad("Dominio inválido");
  await env.DB.prepare("DELETE FROM lookups WHERE name = ?1").bind(name).run();
  return json({ ok: true });
}

// ---------- vigilancia ----------

async function getWatchlist(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT w.name, w.created_at AS createdAt, w.notified_at AS notifiedAt, d.first_seen_at AS seenAt,
            w.whois_state AS whoisState, w.created_on AS createdOn, w.expires_at AS expiresAt,
            w.whois_checked_at AS whoisCheckedAt, w.whois_note AS whoisNote, d.wb_years AS wbYears
     FROM watchlist w LEFT JOIN domains d ON d.name = w.name ORDER BY w.created_at DESC`,
  ).all();
  return json({ rows: results });
}

async function addWatch(request: Request, env: Env): Promise<Response> {
  const data = await body<{ name?: string }>(request);
  const name = normalizeDomain(data?.name ?? "");
  if (!name) return bad("Escribe un dominio .cl válido");
  const count = (await env.DB.prepare("SELECT COUNT(*) AS c FROM watchlist").first<{ c: number }>())?.c ?? 0;
  if (count >= 500) return bad("La lista de vigilancia está llena (500)");
  const added = await env.DB.prepare("INSERT OR IGNORE INTO watchlist (name, created_at) VALUES (?1, ?2)").bind(name, Date.now()).run();
  if (added.meta.changes) await recordEvent(env, name, { kind: "added" });
  // Si NIC ya lo tiene en su lista, la próxima revisión (máx. 1 min de día) lo avisa sola:
  // el aviso compara contra la lista actual de NIC, no contra el historial guardado.
  // Se consulta a NIC al tiro para mostrar la fecha de vencimiento; si NIC no responde,
  // el dominio igual queda vigilado y la próxima pasada reintenta.
  await refreshWhois(env, name).catch((err) => console.error(JSON.stringify({ evt: "whois_failed", name, error: String(err) })));
  return json({ ok: true, name });
}

async function removeWatch(request: Request, env: Env): Promise<Response> {
  const data = await body<{ name?: string }>(request);
  const name = normalizeDomain(data?.name ?? "");
  if (!name) return bad("Dominio inválido");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM watchlist WHERE name = ?1").bind(name),
    env.DB.prepare("DELETE FROM watch_events WHERE name = ?1").bind(name),
    env.DB.prepare("DELETE FROM watch_reminders WHERE name = ?1").bind(name),
  ]);
  return json({ ok: true });
}

async function refreshWatch(request: Request, env: Env): Promise<Response> {
  const data = await body<{ name?: string }>(request);
  const name = normalizeDomain(data?.name ?? "");
  if (!name) return bad("Dominio inválido");
  const exists = await env.DB.prepare("SELECT 1 AS x FROM watchlist WHERE name = ?1").bind(name).first();
  if (!exists) return bad("Ese dominio no está en tu vigilancia", 404);
  try {
    return json({ ok: true, ...(await refreshWhois(env, name)) });
  } catch (err) {
    return bad(`NIC no respondió: ${err instanceof Error ? err.message : err}`, 502);
  }
}

async function watchEvents(env: Env, url: URL): Promise<Response> {
  const name = normalizeDomain(url.searchParams.get("name") ?? "");
  if (!name) return bad("Dominio inválido");
  return json({ rows: await listEvents(env, name) });
}

async function rearmWatch(request: Request, env: Env): Promise<Response> {
  const data = await body<{ name?: string }>(request);
  const name = normalizeDomain(data?.name ?? "");
  if (!name) return bad("Dominio inválido");
  const r = await env.DB.prepare("UPDATE watchlist SET notified_at = NULL WHERE name = ?1").bind(name).run();
  if (r.meta.changes) await recordEvent(env, name, { kind: "rearmed" });
  return json({ ok: true });
}

// ---------- push ----------

async function subscribe(request: Request, env: Env): Promise<Response> {
  const data = await body<{ endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }>(request);
  const { endpoint, keys } = data ?? {};
  if (!validPushEndpoint(endpoint) || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
    return bad("Suscripción inválida");
  }
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3`,
  )
    .bind(endpoint, keys.p256dh, keys.auth, Date.now())
    .run();
  return json({ ok: true });
}

async function unsubscribe(request: Request, env: Env): Promise<Response> {
  const data = await body<{ endpoint?: string }>(request);
  if (!data?.endpoint) return bad("Falta el endpoint");
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?1").bind(data.endpoint).run();
  return json({ ok: true });
}

async function pushTest(env: Env): Promise<Response> {
  const delivered = await notifyAll(env, { title: "✅ Radar NIC", body: "Las notificaciones funcionan en este dispositivo.", url: "/", tag: "test" }, "high");
  return delivered > 0 ? json({ ok: true, delivered }) : bad("No se pudo entregar a ningún dispositivo. ¿Activaste las notificaciones?", 502);
}

// ---------- estado ----------

type Heavy = {
  totals: { total: number; last24h: number | null; tracked: number | null; wbChecked: number | null; wbHistory: number | null; histAlerts24h: number | null } | null;
  hours: { hour: number; n: number }[];
  lag: { n: number; min: number | null; max: number | null; avg: number | null } | null;
};
/** Las cifras que recorren toda la tabla cambian despacio: se recalculan cada 5 min, no en cada visita (cupo de lecturas de D1). */
const HEAVY_TTL = 5 * 60_000;
let heavyCache: { at: number; data: Heavy } | null = null;

async function loadHeavy(env: Env, now: number): Promise<Heavy> {
  if (heavyCache && now - heavyCache.at < HEAVY_TTL) return heavyCache.data;
  const [totals, hours, lag] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN first_seen_at >= ?1 AND baseline = 0 THEN 1 ELSE 0 END) AS last24h,
              SUM(CASE WHEN baseline = 0 THEN 1 ELSE 0 END) AS tracked,
              SUM(CASE WHEN wb_years IS NOT NULL THEN 1 ELSE 0 END) AS wbChecked,
              SUM(CASE WHEN wb_years > 0 THEN 1 ELSE 0 END) AS wbHistory,
              SUM(CASE WHEN hist_alert = 1 AND hist_alert_at > ?2 THEN 1 ELSE 0 END) AS histAlerts24h
       FROM domains`,
    )
      .bind(now - 24 * 3600_000, now - 24 * 3600_000)
      .first<{ total: number; last24h: number | null; tracked: number | null; wbChecked: number | null; wbHistory: number | null; histAlerts24h: number | null }>(),
    env.DB.prepare("SELECT first_seen_hour AS hour, COUNT(*) AS n FROM domains WHERE baseline = 0 GROUP BY first_seen_hour").all<{ hour: number; n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n, MIN(json_extract(detail, '$.lagDays')) AS min, MAX(json_extract(detail, '$.lagDays')) AS max,
              AVG(json_extract(detail, '$.lagDays')) AS avg
       FROM watch_events WHERE kind = 'released' AND json_extract(detail, '$.lagDays') IS NOT NULL`,
    ).first<{ n: number; min: number | null; max: number | null; avg: number | null }>(),
  ]);
  const data: Heavy = { totals, hours: hours.results, lag };
  heavyCache = { at: now, data };
  return data;
}

async function stats(env: Env): Promise<Response> {
  const now = Date.now();
  const [{ totals, hours, lag }, last, subs, watch] = await Promise.all([
    loadHeavy(env, now),
    env.DB.prepare("SELECT value FROM meta WHERE key = 'last_poll'").first<{ value: string }>(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM push_subscriptions").first<{ c: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM watchlist WHERE notified_at IS NULL").first<{ c: number }>(),
  ]);

  const byHour = Array.from({ length: 24 }, (_, h) => hours.find((r) => r.hour === h)?.n ?? 0);
  return json({
    total: totals?.total ?? 0,
    last24h: totals?.last24h ?? 0,
    tracked: totals?.tracked ?? 0,
    archive: { checked: totals?.wbChecked ?? 0, withHistory: totals?.wbHistory ?? 0, alerts24h: totals?.histAlerts24h ?? 0 },
    byHour,
    lastPoll: last ? JSON.parse(last.value) : null,
    devices: subs?.c ?? 0,
    releaseLag: lag && lag.n > 0 ? { n: lag.n, minDays: lag.min, maxDays: lag.max, avgDays: lag.avg } : null,
    watching: watch?.c ?? 0,
    schedule: {
      daytime: isDaytime(santiagoTime(new Date(now))),
      dayStart: DAY_START_HOUR,
      dayEnd: DAY_END_HOUR,
      nightEveryMin: NIGHT_EVERY_MIN,
    },
  });
}
