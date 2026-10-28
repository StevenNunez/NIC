import { useEffect, useState } from "react";
import type { Stats } from "../api";
import { clockSeconds, timeAgo } from "../format";

/** Marca, reloj de Chile en vivo y una línea de estado del radar. */
export default function Header({ stats }: { stats: Stats | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const last = stats?.lastPoll;
  // De noche se revisa cada 15 min: hasta 20 min sin revisar sigue siendo normal.
  const healthy = !!last?.ok && now - last.at < 20 * 60_000;

  return (
    <header className="top">
      <div className="top-row">
        <h1 className="brand">
          <img src="/icon-192.png" alt="" width={26} height={26} />
          <span>
            RADAR<span className="slash">//</span>NIC
          </span>
          <span className="cursor" aria-hidden="true" />
        </h1>
        <div className="clock" aria-label="Hora de Chile">
          {clockSeconds(now)}
          <small>CL</small>
        </div>
      </div>
      <div className="statusline" role="status">
        <span className={`led ${stats ? (healthy ? "on" : "bad") : ""}`} aria-hidden="true" />
        {!stats && <span>conectando…</span>}
        {stats && (
          <span>
            {healthy ? "scan ok" : "scan con problemas"} · {stats.schedule.daytime ? `día · cada 1 min` : `noche · cada ${stats.schedule.nightEveryMin} min`}
            {last ? ` · ${timeAgo(last.at, now)}` : ""}
          </span>
        )}
      </div>
    </header>
  );
}
