import { useCallback, useEffect, useState, type FormEvent } from "react";
import { registerUrl } from "../../shared/domain";
import { api, type EventRow, type WatchRow } from "../api";
import { countdown, dateTime, daysUntil, stamp, timeAgo } from "../format";

const WINDOW_DAYS = 30;

export default function Watchlist({ focus }: { focus: string }) {
  const [rows, setRows] = useState<WatchRow[] | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(focus || null);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ rows: WatchRow[] }>("/api/watchlist")).rows);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "No se pudo cargar" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ name: string }>("/api/watchlist", { method: "POST", json: { name } });
      setName("");
      setMessage({ kind: "ok", text: `vigilando ${r.name}. te aviso apenas NIC lo libere.` });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "No se pudo agregar" });
    } finally {
      setBusy(false);
    }
  }

  async function refresh(n: string) {
    setRefreshing(n);
    setMessage(null);
    try {
      await api("/api/watchlist/refresh", { method: "POST", json: { name: n } });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "No se pudo consultar a NIC" });
    } finally {
      setRefreshing(null);
    }
  }

  async function act(method: "DELETE" | "PATCH", n: string) {
    try {
      await api("/api/watchlist", { method, json: { name: n } });
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "No se pudo completar" });
    }
  }

  return (
    <section>
      <form onSubmit={add} className="addbar">
        <label className="prompt">
          <span aria-hidden="true">&gt;</span>
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="pituto.cl"
            aria-label="Dominio a vigilar"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={busy || !name.trim()}>
          vigilar
        </button>
      </form>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "error" : "ok"}>
          {message.text}
        </p>
      )}

      {rows === null && <p className="count">cargando…</p>}
      {rows?.length === 0 && <p className="empty">aún no vigilas ningún dominio. escribe arriba el que quieres y te aviso cuando salga de NIC.</p>}

      <ul className="list">
        {rows?.map((r) => (
          <li key={r.name} className={`row watch ${r.notifiedAt ? "hit" : ""}`}>
            <div className="dname">
              <span>
                {r.name.slice(0, -3)}
                <span className="tld">.cl</span>
              </span>
            </div>

            <Phases row={r} />
            <Expiry row={r} />

            <div className="row-foot">
              <span className="meta">{r.whoisCheckedAt ? `NIC consultado ${timeAgo(r.whoisCheckedAt)}` : "consultando a NIC…"}</span>
              <span className="row-actions">
                {r.notifiedAt && (
                  <>
                    <a className="btn primary small" href={registerUrl(r.name)} target="_blank" rel="noopener noreferrer">
                      inscribir ▸
                    </a>
                    <button className="btn small" onClick={() => void act("PATCH", r.name)}>
                      re-vigilar
                    </button>
                  </>
                )}
                {!r.notifiedAt && (
                  <button className="icon" aria-label={`Consultar a NIC ${r.name}`} disabled={refreshing === r.name} onClick={() => void refresh(r.name)}>
                    ↻
                  </button>
                )}
                <button
                  className={`icon ${open === r.name ? "on" : ""}`}
                  aria-label={`Historial de ${r.name}`}
                  aria-expanded={open === r.name}
                  onClick={() => setOpen(open === r.name ? null : r.name)}
                >
                  ≡
                </button>
                <button className="icon" aria-label={`Dejar de vigilar ${r.name}`} onClick={() => void act("DELETE", r.name)}>
                  ✕
                </button>
              </span>
            </div>

            {open === r.name && <Log name={r.name} version={r.whoisCheckedAt} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Etapas del dominio: inscrito → vencido → transición (NIC muestra otro estado) → libre. */
function Phases({ row }: { row: WatchRow }) {
  const now = Date.now();
  let current = 0;
  if (row.notifiedAt || row.whoisState === "available") current = 3;
  else if (row.whoisState === "unknown") current = 2;
  else if (row.whoisState === "registered" && row.expiresAt !== null && row.expiresAt < now) current = 1;

  const steps = ["inscrito", "vencido", "transición", "libre"];
  return (
    <div className="phases" role="img" aria-label={`Etapa actual: ${steps[current]}`}>
      {steps.map((label, i) => (
        <div key={label} className={`phase ${i < current ? "done" : ""} ${i === current ? `now ${current === 1 || current === 2 ? "warn" : ""}` : ""}`}>
          {label}
        </div>
      ))}
    </div>
  );
}

/** Fecha de vencimiento, cuenta regresiva y pista de los últimos 30 días con las marcas de aviso. */
function Expiry({ row }: { row: WatchRow }) {
  if (row.notifiedAt || row.whoisState === "available") {
    return <p className="expiry-date">NIC dice que <b>el dominio ya no existe</b>: se puede inscribir.</p>;
  }
  if (row.whoisState === null) return <p className="muted">consultando a NIC…</p>;
  if (row.whoisState === "unknown") {
    return (
      <p className="meta">
        NIC muestra un estado que aún no conozco{row.whoisNote ? `: «${row.whoisNote}»` : ""}. Lo estoy registrando.
      </p>
    );
  }
  if (row.expiresAt === null) return null;

  const now = Date.now();
  const expired = row.expiresAt < now;
  const days = daysUntil(row.expiresAt, now);
  const filled = expired ? 100 : Math.min(100, Math.max(0, ((WINDOW_DAYS - days) / WINDOW_DAYS) * 100));
  const marks = [
    { label: "d-30", at: 0 },
    { label: "d-7", at: ((WINDOW_DAYS - 7) / WINDOW_DAYS) * 100 },
    { label: "d-1", at: ((WINDOW_DAYS - 1) / WINDOW_DAYS) * 100, up: true }, // arriba: casi pisa a "vence"
    { label: "vence", at: 100 },
  ];

  return (
    <div className="expiry-block">
      <div className="expiry-head">
        <span className={`tminus ${expired ? "over" : ""}`}>
          {expired ? `T+${Math.abs(days)}d` : `T-${days}d`}
          <small>{countdown(row.expiresAt, now)}</small>
        </span>
        <span className="expiry-date">
          {expired ? "venció" : "vence"} <b>{dateTime(row.expiresAt)}</b>
        </span>
      </div>
      <div className={`track ${expired ? "over" : ""}`} aria-hidden="true">
        <i style={{ width: `${filled}%` }} />
        {marks.map((m) => (
          <b key={m.label} className={m.up ? "up" : ""} style={{ left: `${m.at}%` }}>
            {m.label}
          </b>
        ))}
      </div>
      <p className="meta">
        {expired ? "sigue inscrito: NIC aún no lo libera. " : "los avisos salen en las marcas d-30, d-7, d-1 y al vencer. "}
        {row.createdOn ? `existe desde ${new Date(row.createdOn).getUTCFullYear()}.` : ""}
      </p>
    </div>
  );
}

function eventText(ev: EventRow): string {
  const d = ev.detail ?? {};
  const date = (v: unknown) => (typeof v === "number" ? dateTime(v) : "?");
  switch (ev.kind) {
    case "added":
      return "agregado a la vigilancia";
    case "rearmed":
      return "vuelto a vigilar";
    case "whois_registered":
      return `NIC: inscrito · vence ${date(d.expiresAt)}`;
    case "renewed":
      return `el titular RENOVÓ · antes ${date(d.from)} → ahora ${date(d.to)}`;
    case "expired":
      return `venció ${date(d.expiresAt)} · sigue inscrito en NIC`;
    case "unknown":
      return `NIC muestra un estado nuevo${d.note ? `: «${String(d.note)}»` : ""}`;
    case "available_whois":
      return "NIC: el dominio ya no existe → LIBRE";
    case "in_list":
      return "apareció en la lista de liberados de NIC";
    case "released":
      return typeof d.lagDays === "number" ? `liberado ${d.lagDays} días después del vencimiento` : "liberado";
    case "alerted":
      return `aviso enviado a ${String(d.delivered ?? "?")} dispositivo(s)`;
    case "reminder": {
      const level = { d30: "faltan 30 días", d7: "faltan 7 días", d1: "vence mañana", expired: "venció" }[String(d.level)] ?? String(d.level);
      return `aviso de calendario enviado: ${level}`;
    }
    default:
      return ev.kind;
  }
}

/** Historial del dominio, más nuevo arriba. `version` fuerza recargar cuando NIC se vuelve a consultar. */
function Log({ name, version }: { name: string; version: number | null }) {
  const [events, setEvents] = useState<EventRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ rows: EventRow[] }>(`/api/watchlist/events?name=${encodeURIComponent(name)}`)
      .then((d) => alive && setEvents(d.rows))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [name, version]);

  if (events === null) return <p className="muted">cargando historial…</p>;
  if (!events.length) return <p className="muted">sin eventos todavía.</p>;
  return (
    <ol className="log" aria-label={`Historial de ${name}`}>
      {events.map((ev, i) => (
        <li key={`${ev.at}-${i}`} className={`k-${ev.kind}`}>
          <time>{stamp(ev.at)}</time>
          <span>{eventText(ev)}</span>
        </li>
      ))}
    </ol>
  );
}
