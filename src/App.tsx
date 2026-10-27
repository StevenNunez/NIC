import { useEffect, useState } from "react";
import { api, UNAUTHORIZED_EVENT } from "./api";
import Domains from "./views/Domains";
import Login from "./views/Login";
import Radar from "./views/Radar";
import Watchlist from "./views/Watchlist";

type Tab = "list" | "watch" | "radar";
type Auth = "checking" | "in" | "out";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "list", label: "Listado", icon: "☰" },
  { key: "watch", label: "Vigilancia", icon: "◎" },
  { key: "radar", label: "Radar", icon: "◉" },
];

// Los avisos abren la app con ?d=<dominio> (alerta) o ?v=new (resumen de la mañana).
const params = new URLSearchParams(location.search);
const startQuery = params.get("d") ?? "";
const startFresh = params.get("v") === "new";

export default function App() {
  const [auth, setAuth] = useState<Auth>("checking");
  const [tab, setTab] = useState<Tab>("list");

  useEffect(() => {
    api("/api/session")
      .then(() => setAuth("in"))
      .catch(() => setAuth("out"));
    const out = () => setAuth("out");
    window.addEventListener(UNAUTHORIZED_EVENT, out);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, out);
  }, []);

  if (auth === "checking") return <div className="splash" role="status" aria-label="Cargando" />;
  if (auth === "out") return <Login onLogin={() => setAuth("in")} />;

  return (
    <div className="app">
      <header className="top">
        <img src="/icon-192.png" alt="" width={28} height={28} />
        <h1>Radar NIC</h1>
      </header>

      <main className="content">
        {/* Se mantiene montado el listado para no perder filtros ni scroll al cambiar de pestaña. */}
        <div hidden={tab !== "list"}>
          <Domains initialQuery={startQuery} initialFresh={startFresh} />
        </div>
        {tab === "watch" && <Watchlist />}
        {tab === "radar" && <Radar onLogout={() => setAuth("out")} />}
      </main>

      <nav className="tabbar" aria-label="Secciones">
        {TABS.map((t) => (
          <button key={t.key} aria-current={tab === t.key ? "page" : undefined} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
