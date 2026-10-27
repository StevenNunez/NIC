import { useCallback, useEffect, useState, type FormEvent } from "react";
import { registerUrl } from "../../shared/domain";
import { api, type WatchRow } from "../api";
import { clock, countdown, dateTime, timeAgo } from "../format";

export default function Watchlist() {
  const [rows, setRows] = useState<WatchRow[] | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);

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
      setMessage({ kind: "ok", text: `Vigilando ${r.name}. Te aviso apenas NIC lo libere.` });
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
        <button className="btn primary" disabled={busy || !name.trim()}>
          Vigilar
        </button>
      </form>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "error" : "ok"}>
          {message.text}
        </p>
      )}

      {rows === null && <p className="count">Cargando…</p>}
      {rows?.length === 0 && (
        <p className="empty">
          Aún no vigilas ningún dominio.
          <br />
          Escribe arriba el que quieres y te aviso cuando salga de NIC.
        </p>
      )}

      <ul className="list">
        {rows?.map((r) => (
          <li key={r.name} className={`row ${r.notifiedAt ? "hit" : ""}`}>
            <div className="dname">
              {r.name.slice(0, -3)}
              <span className="tld">.cl</span>
            </div>
            <NicInfo row={r} />
            <div className="row-foot">
              <span className="meta">
                {r.notifiedAt ? `¡Disponible desde ${clock(r.seenAt ?? r.notifiedAt)}!` : "Esperando que NIC lo libere…"}
              </span>
              <span className="row-actions">
                {r.notifiedAt ? (
                  <>
                    <a className="btn primary small" href={registerUrl(r.name)} target="_blank" rel="noopener noreferrer">
                      Inscribir
                    </a>
                    <button className="btn small" onClick={() => void act("PATCH", r.name)}>
                      Volver a vigilar
                    </button>
                  </>
                ) : null}
                {!r.notifiedAt && (
                  <button className="icon" aria-label={`Consultar a NIC la fecha de ${r.name}`} disabled={refreshing === r.name} onClick={() => void refresh(r.name)}>
                    ↻
                  </button>
                )}
                <button className="icon" aria-label={`Dejar de vigilar ${r.name}`} onClick={() => void act("DELETE", r.name)}>
                  ✕
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lo que NIC dice del dominio: cuándo vence, desde cuándo existe y cuándo se consultó. */
function NicInfo({ row }: { row: WatchRow }) {
  if (row.notifiedAt) return null;
  if (row.whoisState === null) return <p className="nic-info muted">Consultando a NIC…</p>;

  if (row.whoisState === "registered" && row.expiresAt !== null) {
    const expired = row.expiresAt < Date.now();
    return (
      <div className="nic-info">
        <p className={expired ? "expiry over" : "expiry"}>
          <span>{expired ? "Venció" : "Vence"}</span> {dateTime(row.expiresAt)}
          <span className="chip-days">{countdown(row.expiresAt)}</span>
        </p>
        <p className="meta">
          {expired ? "Sigue inscrito: NIC aún no lo libera. " : ""}
          {row.createdOn ? `Existe desde ${new Date(row.createdOn).getUTCFullYear()} · ` : ""}
          NIC consultado {row.whoisCheckedAt ? timeAgo(row.whoisCheckedAt) : ""}
        </p>
      </div>
    );
  }

  if (row.whoisState === "available") return <p className="nic-info expiry">NIC dice que el dominio no existe: ya se puede inscribir.</p>;

  return (
    <p className="nic-info meta">
      NIC mostró algo que no entiendo todavía{row.whoisNote ? `: «${row.whoisNote}»` : ""}.
    </p>
  );
}
