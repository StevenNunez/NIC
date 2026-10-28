import { useEffect, useState } from "react";
import { api, type DomainRow } from "../api";
import { ageShort } from "../format";

/** Cinta con lo último que NIC liberó, mientras el radar estuvo prendido. */
export default function Ticker() {
  const [rows, setRows] = useState<DomainRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ rows: DomainRow[] }>("/api/domains?sort=recent&fresh=1")
        .then((d) => alive && setRows(d.rows.slice(0, 24)))
        .catch(() => alive && setRows((prev) => prev ?? []));
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (rows === null) return <div className="ticker" aria-hidden="true" />;
  if (!rows.length) {
    return <div className="ticker ticker-empty">▸ escaneando nic.cl… sin liberaciones nuevas desde que el radar está activo</div>;
  }

  const items = rows.map((r) => (
    <span className="ticker-item" key={r.name}>
      ▲ <b>{r.name}</b>
      <span>{ageShort(r.firstSeenAt)}</span>
    </span>
  ));

  // Se duplica el contenido para que el desplazamiento no tenga saltos.
  return (
    <div className="ticker" aria-label="Últimos dominios liberados" role="marquee">
      <div className="ticker-track" style={{ ["--dur" as string]: `${Math.max(30, rows.length * 4)}s` }} aria-hidden="true">
        {items}
        {items}
      </div>
    </div>
  );
}
