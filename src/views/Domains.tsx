import { useCallback, useEffect, useRef, useState } from "react";
import { registerUrl, snapshotUrl } from "../../shared/domain";
import { api, type DomainRow } from "../api";
import ValueInfo from "../components/ValueInfo";
import { ageShort, yearRange } from "../format";

type StatusTab = "active" | "favorite" | "dismissed";
type Sort = "recent" | "short" | "alpha" | "history";

interface Filters {
  noDigit: boolean;
  noHyphen: boolean;
  short: boolean; // hasta 8 letras
  fresh: boolean; // solo los que el radar vio liberarse (sin la carga inicial)
  last24: boolean;
  history: boolean; // solo los que tuvieron sitio en archive.org
}

const CHIPS: { key: keyof Filters; label: string }[] = [
  { key: "noDigit", label: "sin números" },
  { key: "noHyphen", label: "sin guiones" },
  { key: "short", label: "≤ 8 letras" },
  { key: "history", label: "con historia" },
  { key: "last24", label: "últimas 24 h" },
  { key: "fresh", label: "vistos por el radar" },
];

export default function Domains({ initialFresh, preset }: { initialFresh: boolean; preset?: "history" }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<StatusTab>("active");
  const [sort, setSort] = useState<Sort>(preset === "history" ? "history" : "recent");
  const [filters, setFilters] = useState<Filters>({ noDigit: false, noHyphen: false, short: false, fresh: initialFresh, last24: false, history: preset === "history" });
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const query = useCallback(
    (offset: number) => {
      const p = new URLSearchParams({ status, sort, offset: String(offset) });
      if (debounced.trim()) p.set("q", debounced.trim());
      if (filters.noDigit) p.set("noDigit", "1");
      if (filters.noHyphen) p.set("noHyphen", "1");
      if (filters.short) p.set("maxLen", "8");
      if (filters.fresh) p.set("fresh", "1");
      if (filters.last24) p.set("sinceHours", "24");
      if (filters.history) p.set("history", "1");
      return `/api/domains?${p}`;
    },
    [status, sort, debounced, filters],
  );

  const load = useCallback(
    async (append: boolean, offset = 0) => {
      const id = ++request.current;
      setLoading(true);
      setError("");
      try {
        const data = await api<{ rows: DomainRow[]; total: number }>(query(offset));
        if (id !== request.current) return; // llegó una respuesta más nueva: esta se descarta
        setRows((prev) => (append ? [...prev, ...data.rows] : data.rows));
        setTotal(data.total);
      } catch (err) {
        if (id === request.current) setError(err instanceof Error ? err.message : "No se pudo cargar");
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  async function setDomainStatus(row: DomainRow, next: DomainRow["status"]) {
    const target = row.status === next ? "new" : next;
    const leavesTab = (status === "active" && target === "dismissed") || (status !== "active" && status !== target);
    setRows((prev) => (leavesTab ? prev.filter((r) => r.name !== row.name) : prev.map((r) => (r.name === row.name ? { ...r, status: target } : r))));
    if (leavesTab) setTotal((t) => Math.max(0, t - 1));
    try {
      await api(`/api/domains/${encodeURIComponent(row.name)}`, { method: "PATCH", json: { status: target } });
    } catch {
      void load(false); // si falló, se vuelve a lo que dice el servidor
    }
  }

  const toggle = (key: keyof Filters) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  return (
    <section>
      <label className="prompt">
        <span aria-hidden="true">&gt;</span>
        <input
          type="search"
          inputMode="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="buscar dominio…"
          aria-label="Buscar dominio"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      <div className="chips" role="group" aria-label="Filtros">
        {CHIPS.map((c) => (
          <button key={c.key} className={`chip ${filters[c.key] ? "on" : ""}`} aria-pressed={filters[c.key]} onClick={() => toggle(c.key)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="seg" role="tablist" aria-label="Estado">
        {(
          [
            ["active", "todos"],
            ["favorite", "★ favoritos"],
            ["dismissed", "descartados"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={status === key} className={status === key ? "on" : ""} onClick={() => setStatus(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="countbar">
        <p className="count" aria-live="polite">
          {loading && !rows.length ? "cargando…" : (
            <>
              <b>{total.toLocaleString("es-CL")}</b> dominios
            </>
          )}
        </p>
        <select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="recent">más recientes</option>
          <option value="short">más cortos</option>
          <option value="history">más historia</option>
          <option value="alpha">a–z</option>
        </select>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <ul className="list">
        {rows.map((r) => (
          <li key={r.name} className={`row ${r.status === "favorite" ? "fav" : ""}`}>
            <div className="dname">
              <span>
                {r.name.slice(0, -3)}
                <span className="tld">.cl</span>
              </span>
              <span className="badge" title="Largo del nombre">
                {String(r.len).padStart(2, "0")}
              </span>
            </div>
            <ValueInfo name={r.name} wbYears={r.wbYears} />
            <div className="row-foot">
              <span className="meta">
                {ageShort(r.firstSeenAt)}
                {r.watched ? " · vigilado" : ""}
                {r.wbYears && r.wbFirst && r.wbLast ? (
                  <a className="hist" href={snapshotUrl(r.name, r.wbLast)} target="_blank" rel="noopener noreferrer" title="Ver la última captura en archive.org">
                    ◷ {yearRange(r.wbFirst, r.wbLast)} · {r.wbYears} {r.wbYears === 1 ? "año" : "años"} ↗
                  </a>
                ) : null}
              </span>
              <span className="row-actions">
                <button
                  className={`icon ${r.status === "favorite" ? "on" : ""}`}
                  aria-label={r.status === "favorite" ? `Quitar ${r.name} de favoritos` : `Marcar ${r.name} como favorito`}
                  aria-pressed={r.status === "favorite"}
                  onClick={() => void setDomainStatus(r, "favorite")}
                >
                  ★
                </button>
                <button
                  className="icon"
                  aria-label={r.status === "dismissed" ? `Recuperar ${r.name}` : `Descartar ${r.name}`}
                  onClick={() => void setDomainStatus(r, "dismissed")}
                >
                  {r.status === "dismissed" ? "↩" : "✕"}
                </button>
                <a className="btn primary small" href={registerUrl(r.name)} target="_blank" rel="noopener noreferrer">
                  inscribir ▸
                </a>
              </span>
            </div>
          </li>
        ))}
      </ul>

      {!loading && !rows.length && !error && <p className="empty">sin dominios con esos filtros</p>}

      {rows.length < total && (
        <button className="btn block" disabled={loading} onClick={() => void load(true, rows.length)}>
          {loading ? "cargando…" : "cargar más"}
        </button>
      )}
    </section>
  );
}
