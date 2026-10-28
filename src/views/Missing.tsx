import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { registerUrl, snapshotUrl } from "../../shared/domain";
import { api, type LookupRow } from "../api";
import { countdown, dateTime, historyLevel, timeAgo, yearRange } from "../format";
import Domains from "./Domains";

type Tab = "lookups" | "released";

/**
 * "El dominio ya no existe": ¿este dominio está libre y, si lo está, tuvo sitio alguna vez?
 * Un dominio libre con muchos años de historia suele traer enlaces y reputación.
 */
export default function Missing({ autoLookup }: { autoLookup?: string }) {
  const [tab, setTab] = useState<Tab>("lookups");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<LookupRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await api<{ rows: LookupRow[] }>("/api/lookups")).rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Al abrir desde un aviso se consulta el dominio al tiro: confirma que sigue libre y muestra su historia.
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoLookup || autoDone.current) return;
    autoDone.current = true;
    void run(autoLookup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLookup]);

  async function run(n: string) {
    setBusy(true);
    setError("");
    try {
      await api("/api/lookup", { method: "POST", json: { name: n } });
      setName("");
      await load();
      setTab("lookups");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(name);
  }

  async function remove(n: string) {
    await api("/api/lookups", { method: "DELETE", json: { name: n } }).catch(() => {});
    await load();
  }

  async function watch(n: string) {
    try {
      await api("/api/watchlist", { method: "POST", json: { name: n } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo vigilar");
    }
  }

  return (
    <section>
      <div className="intro">
        <h2>el dominio ya no existe</h2>
        <p className="muted">
          escribe un dominio y te digo si NIC ya no lo tiene y si alguna vez tuvo sitio. una página que ya no está pero tuvo años de vida suele traer enlaces y reputación.
        </p>
      </div>

      <form onSubmit={submit} className="addbar">
        <label className="prompt">
          <span aria-hidden="true">&gt;</span>
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="pituto.cl"
            aria-label="Dominio a consultar"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="btn primary" disabled={busy || !name.trim()}>
          {busy ? "consultando…" : "consultar"}
        </button>
      </form>

      {busy && <p className="muted hint">preguntando a NIC y a archive.org; puede tardar unos segundos…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="seg" role="tablist" aria-label="Vista">
        {(
          [
            ["lookups", "consultados"],
            ["released", "liberados con historia"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "lookups" && (
        <>
          {rows === null && <p className="count">cargando…</p>}
          {rows?.length === 0 && <p className="empty">todavía no has consultado ningún dominio.</p>}
          <ul className="list">
            {rows?.map((r) => (
              <li key={r.name}>
                <LookupCard r={r} busy={busy} onRefresh={() => void run(r.name)} onRemove={() => void remove(r.name)} onWatch={() => void watch(r.name)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "released" && (
        <>
          <p className="muted hint">dominios que NIC ya liberó y que tuvieron sitio en archive.org, con más años de historia primero.</p>
          <Domains initialFresh={false} preset="history" />
        </>
      )}
    </section>
  );
}

/** El veredicto sobre un dominio: ¿existe en NIC?, ¿tuvo historia? y qué se puede hacer. */
function LookupCard({ r, busy, onRefresh, onRemove, onWatch }: { r: LookupRow; busy: boolean; onRefresh: () => void; onRemove: () => void; onWatch: () => void }) {
  const free = r.whoisState === "available";
  const taken = r.whoisState === "registered";
  const history = r.wbYears !== null && r.wbYears > 0 && r.wbFirst !== null && r.wbLast !== null;
  const opportunity = free && history;

  return (
    <article className={`row lookup ${opportunity ? "hit" : ""}`}>
      <div className="dname">
        <span>
          {r.name.slice(0, -3)}
          <span className="tld">.cl</span>
        </span>
      </div>

      {free && <p className="verdict free">∅ el dominio ya no existe</p>}
      {taken && (
        <p className="verdict taken">
          ● el dominio existe
          {r.expiresAt ? (
            <span>
              {" "}
              · {r.expiresAt < Date.now() ? "venció" : "vence"} {dateTime(r.expiresAt)} · {countdown(r.expiresAt)}
            </span>
          ) : null}
        </p>
      )}
      {r.whoisState === "unknown" && <p className="verdict taken">? NIC muestra un estado que no conozco{r.note ? `: «${r.note}»` : ""}</p>}
      {r.whoisState === null && <p className="verdict taken">? NIC no respondió</p>}

      {r.wbYears === null && <p className="muted">archive.org no respondió: no sé si tuvo sitio. reintenta en un rato.</p>}
      {r.wbYears === 0 && <p className="muted">sin capturas en archive.org: probablemente nunca tuvo sitio.</p>}
      {history && r.wbFirst !== null && r.wbLast !== null && (
        <div className="history">
          <p>
            existió <b>{yearRange(r.wbFirst, r.wbLast)}</b> · {r.wbYears} {r.wbYears === 1 ? "año" : "años"} con capturas
            <span className={`level ${historyLevel(r.wbYears!)}`}>historia {historyLevel(r.wbYears!)}</span>
          </p>
          <p className="links">
            <a href={snapshotUrl(r.name, r.wbFirst)} target="_blank" rel="noopener noreferrer">
              primera captura ↗
            </a>
            <a href={snapshotUrl(r.name, r.wbLast)} target="_blank" rel="noopener noreferrer">
              última captura ↗
            </a>
          </p>
        </div>
      )}
      {r.problems?.length ? <p className="muted">{r.problems.join(" · ")}.</p> : null}

      <div className="row-foot">
        <span className="meta">consultado {timeAgo(r.checkedAt)}</span>
        <span className="row-actions">
          {free && (
            <a className="btn primary small" href={registerUrl(r.name)} target="_blank" rel="noopener noreferrer">
              inscribir ▸
            </a>
          )}
          {taken && !r.watched && (
            <button className="btn small" onClick={onWatch}>
              vigilar
            </button>
          )}
          {taken && r.watched ? <span className="meta">vigilado ✓</span> : null}
          <button className="icon" aria-label={`Consultar de nuevo ${r.name}`} disabled={busy} onClick={onRefresh}>
            ↻
          </button>
          <button className="icon" aria-label={`Quitar ${r.name} de consultados`} onClick={onRemove}>
            ✕
          </button>
        </span>
      </div>
    </article>
  );
}
