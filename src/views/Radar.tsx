import { useCallback, useEffect, useState } from "react";
import { api, type PollInfo, type Stats } from "../api";
import Credit from "../components/Credit";
import { timeAgo } from "../format";
import { disablePush, enablePush, getPushState, isStandalone, type PushState } from "../push";

export default function Radar({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [pushMsg, setPushMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await api<Stats>("/api/stats"));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    }
  }, []);

  useEffect(() => {
    void load();
    void getPushState().then(setPush);
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function pollNow() {
    setPolling(true);
    try {
      const r = await api<PollInfo>("/api/poll", { method: "POST" });
      if (!r.ok) setError(r.error ?? "NIC no respondió");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revisar");
    } finally {
      setPolling(false);
    }
  }

  async function togglePush() {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (push === "on") await disablePush();
      else await enablePush();
      setPush(await getPushState());
      await load();
    } catch (err) {
      setPushMsg({ kind: "error", text: err instanceof Error ? err.message : "No se pudo cambiar" });
    } finally {
      setPushBusy(false);
    }
  }

  async function testPush() {
    setPushBusy(true);
    setPushMsg(null);
    try {
      await api("/api/push/test", { method: "POST" });
      setPushMsg({ kind: "ok", text: "Enviada. Debería llegarte en unos segundos." });
    } catch (err) {
      setPushMsg({ kind: "error", text: err instanceof Error ? err.message : "No se pudo enviar" });
    } finally {
      setPushBusy(false);
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  const last = stats?.lastPoll;
  // De noche se revisa cada 15 min: hasta 20 min sin revisar todavía es normal.
  const healthy = !!last?.ok && Date.now() - last.at < 20 * 60_000;
  const max = Math.max(1, ...(stats?.byHour ?? [0]));

  return (
    <section className="stack">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="card">
        <h2>
          <span className={`dot ${stats ? (healthy ? "good" : "bad") : ""}`} aria-hidden="true" />
          Radar {stats ? (healthy ? "activo" : "con problemas") : ""}
        </h2>
        {stats && (
          <>
            <p className="muted">
              {last ? (
                <>
                  Última revisión {timeAgo(last.at)}
                  {last.ok ? ` · ${last.total?.toLocaleString("es-CL")} dominios en la lista de NIC` : ` · falló: ${last.error}`}
                </>
              ) : (
                "Todavía no ha revisado NIC."
              )}
            </p>
            <p className="muted">
              {stats.schedule.daytime
                ? `Modo día: revisa cada minuto (${stats.schedule.dayStart}:00 a ${stats.schedule.dayEnd}:00).`
                : `Modo noche: revisa cada ${stats.schedule.nightEveryMin} min. Solo suena si aparece algo de tu vigilancia.`}
            </p>
            <dl className="numbers">
              <div>
                <dt>Liberados en 24 h</dt>
                <dd>{stats.last24h}</dd>
              </div>
              <div>
                <dt>Vigilando</dt>
                <dd>{stats.watching}</dd>
              </div>
              <div>
                <dt>Dispositivos</dt>
                <dd>{stats.devices}</dd>
              </div>
            </dl>
          </>
        )}
        <button className="btn block" onClick={() => void pollNow()} disabled={polling}>
          {polling ? "Revisando NIC…" : "Revisar ahora"}
        </button>
      </div>

      <div className="card">
        <h2>Notificaciones</h2>
        {push === null && <p className="muted">Comprobando…</p>}
        {push === "unsupported" && <p className="muted">Este navegador no admite notificaciones push. Prueba con Chrome, Edge o Safari actualizado.</p>}
        {push === "needs-install" && (
          <p className="muted">
            En iPhone las notificaciones solo funcionan con la app instalada: abre esta página en <strong>Safari</strong>, toca{" "}
            <strong>Compartir</strong> y luego <strong>Agregar a inicio</strong>. Después ábrela desde el ícono y vuelve aquí.
          </p>
        )}
        {push === "denied" && (
          <p className="muted">Bloqueaste las notificaciones. Actívalas en Ajustes del teléfono, en Notificaciones, Radar NIC.</p>
        )}
        {(push === "off" || push === "on") && (
          <>
            <p className="muted">
              {push === "on"
                ? "Activadas en este dispositivo. Llegan aunque la app esté cerrada."
                : "Actívalas para que el aviso te llegue al celular apenas un dominio quede libre."}
              {!isStandalone() && push === "off" ? " (En iPhone, hazlo desde la app instalada.)" : ""}
            </p>
            <div className="btn-row">
              <button className={`btn ${push === "on" ? "" : "primary"}`} onClick={() => void togglePush()} disabled={pushBusy}>
                {push === "on" ? "Desactivar" : "Activar notificaciones"}
              </button>
              {push === "on" && (
                <button className="btn" onClick={() => void testPush()} disabled={pushBusy}>
                  Enviar prueba
                </button>
              )}
            </div>
          </>
        )}
        {pushMsg && (
          <p role={pushMsg.kind === "error" ? "alert" : "status"} className={pushMsg.kind === "error" ? "error" : "ok"}>
            {pushMsg.text}
          </p>
        )}
      </div>

      <div className="card">
        <h2>¿A qué hora libera NIC?</h2>
        {stats && stats.tracked < 30 ? (
          <p className="muted">Aún juntando datos ({stats.tracked} liberaciones vistas). Con unos días de uso se ve en qué horas conviene estar atento.</p>
        ) : (
          <p className="muted">Hora (de Chile) en que el radar vio por primera vez cada dominio liberado.</p>
        )}
        <div className="bars" role="img" aria-label="Dominios liberados por hora del día, hora de Chile">
          {(stats?.byHour ?? Array<number>(24).fill(0)).map((n, h) => (
            <div key={h} className="bar" title={`${h}:00 — ${n}`}>
              <span style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="bars-axis" aria-hidden="true">
          <span>0</span>
          <span>6</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>
      </div>

      <button className="btn block" onClick={() => void logout()}>
        Cerrar sesión
      </button>
      <Credit />
    </section>
  );
}
