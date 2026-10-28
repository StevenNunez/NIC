import { useCallback, useEffect, useState } from "react";
import { api, UNAUTHORIZED_EVENT, type Stats } from "./api";
import Header from "./components/Header";
import Ticker from "./components/Ticker";
import Domains from "./views/Domains";
import Login from "./views/Login";
import Missing from "./views/Missing";
import Radar from "./views/Radar";
import Watchlist from "./views/Watchlist";

type Tab = "list" | "missing" | "watch" | "radar";
type Auth = "checking" | "in" | "out";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "list", label: "Listado", icon: "☰" },
  { key: "missing", label: "No existe", icon: "∅" },
  { key: "watch", label: "Vigilancia", icon: "◎" },
  { key: "radar", label: "Radar", icon: "◉" },
];

// Los avisos abren la app con ?w=<dominio> (vigilancia), ?h=<dominio> (liberado con historia) o ?v=new (resumen de la mañana).
const params = new URLSearchParams(location.search);
const focusWatch = params.get("w") ?? params.get("d") ?? "";
const startFresh = params.get("v") === "new";
const focusHistory = params.get("h") ?? "";

export default function App() {
  const [auth, setAuth] = useState<Auth>("checking");
  const [tab, setTab] = useState<Tab>(focusHistory ? "missing" : focusWatch ? "watch" : "list");
  const [stats, setStats] = useState<Stats | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setStats(await api<Stats>("/api/stats"));
    } catch {
      /* si falla, la cabecera queda con el último dato */
    }
  }, []);

  useEffect(() => {
    api("/api/session")
      .then(() => setAuth("in"))
      .catch(() => setAuth("out"));
    const out = () => setAuth("out");
    window.addEventListener(UNAUTHORIZED_EVENT, out);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, out);
  }, []);

  useEffect(() => {
    if (auth !== "in") return;
    void loadStats();
    const t = setInterval(() => void loadStats(), 30_000);
    return () => clearInterval(t);
  }, [auth, loadStats]);

  if (auth === "checking") return <div className="splash" role="status" aria-label="Cargando" />;
  if (auth === "out") return <Login onLogin={() => setAuth("in")} />;

  return (
    <div className="app">
      <Header stats={stats} />
      <Ticker />

      <main className="content">
        {/* Se mantiene montado el listado para no perder filtros ni scroll al cambiar de pestaña. */}
        <div hidden={tab !== "list"}>
          <Domains initialFresh={startFresh} />
        </div>
        {tab === "missing" && <Missing autoLookup={focusHistory} />}
        {tab === "watch" && <Watchlist focus={focusWatch} />}
        {tab === "radar" && <Radar stats={stats} reload={loadStats} onLogout={() => setAuth("out")} />}
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
