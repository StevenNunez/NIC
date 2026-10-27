import { useCallback, useEffect, useRef, useState } from "react";
import { registerUrl } from "../../shared/domain";
import { api, type DomainRow } from "../api";
import { timeAgo } from "../format";

type StatusTab = "active" | "favorite" | "dismissed";
type Sort = "recent" | "short" | "alpha";

interface Filters {
  noDigit: boolean;
  noHyphen: boolean;
  short: boolean; // hasta 8 letras
  fresh: boolean; // solo los que el radar vio liberarse (sin la carga inicial)
  last24: boolean;
}

const CHIPS: { key: keyof Filters; label: string }[] = [
  { key: "noDigit", label: "Sin números" },
  { key: "noHyphen", label: "Sin guiones" },
  { key: "short", label: "Hasta 8 letras" },
  { key: "last24", label: "Últimas 24 h" },
  { key: "fresh", label: "Solo vistos por el radar" },
];

export default function Domains({ initialQuery, initialFresh }: { initialQuery: string; initialFresh: boolean }) {
  const [q, setQ] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [status, setStatus] = useState<StatusTab>("active");
  const [sort, setSort] = useState<Sort>("recent");
  const [filters, setFilters] = useState<Filters>({ noDigit: false, noHyphen: false, short: false, fresh: initialFresh, last24: false });
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
      <div className="searchbar">
        <input
          type="search"
          inputMode="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Buscar dominio…"
          aria-label="Buscar dominio"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="chips" role="group" aria-label="Filtros">
        {CHIPS.map((c) => (
          <button key={c.key} className={`chip ${filters[c.key] ? "on" : ""}`} aria-pressed={filters[c.key]} onClick={() => toggle(c.key)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="seg" role="tablist" aria-label="Estado">
          {(
            [
              ["active", "Todos"],
              ["favorite", "★ Favoritos"],
              ["dismissed", "Descartados"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={status === key} className={status === key ? "on" : ""} onClick={() => setStatus(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="countbar">
        <p className="count" aria-live="polite">
          {loading && !rows.length ? "Cargando…" : `${total.toLocaleString("es-CL")} dominios`}
        </p>
        <select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="recent">Más recientes</option>
          <option value="short">Más cortos</option>
          <option value="alpha">A–Z</option>
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
              {r.name.slice(0, -3)}
              <span className="tld">.cl</span>
            </div>
            <div className="row-foot">
              <span className="meta">
                {r.len} letras · {timeAgo(r.firstSeenAt)}
                {r.watched ? " · vigilado" : ""}
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
                  Inscribir
                </a>
              </span>
            </div>
          </li>
        ))}
      </ul>

      {!loading && !rows.length && !error && <p className="empty">No hay dominios con esos filtros.</p>}

      {rows.length < total && (
        <button className="btn block" disabled={loading} onClick={() => void load(true, rows.length)}>
          {loading ? "Cargando…" : "Cargar más"}
        </button>
      )}
    </section>
  );
}
