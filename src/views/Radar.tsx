import { useEffect, useState } from "react";
import { api, type PollInfo, type Stats } from "../api";
import Credit from "../components/Credit";
import { timeAgo } from "../format";
import { disablePush, enablePush, getPushState, isStandalone, type PushState } from "../push";

export default function Radar({ stats, reload, onLogout }: { stats: Stats | null; reload: () => Promise<void>; onLogout: () => void }) {
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [pushMsg, setPushMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    void getPushState().then(setPush);
    void reload();
  }, [reload]);

  async function pollNow() {
    setPolling(true);
    setError("");
    try {
      const r = await api<PollInfo>("/api/poll", { method: "POST" });
      if (!r.ok) setError(r.error ?? "NIC no respondió");
      await reload();
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
      await reload();
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
      setPushMsg({ kind: "ok", text: "enviada. debería llegarte en unos segundos." });
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
  const max = Math.max(1, ...(stats?.byHour ?? [0]));
  const lag = stats?.releaseLag;

  return (
    <section className="stack">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="card">
        <h2>estado del radar</h2>
        {stats ? (
          <>
            <p className="muted">
              {last ? (
                last.ok ? (
                  <>
                    última revisión {timeAgo(last.at)} · <b>{last.total?.toLocaleString("es-CL")}</b> dominios en la lista de NIC
                  </>
                ) : (
                  <>última revisión falló: {last.error}</>
                )
              ) : (
                "todavía no ha revisado NIC."
              )}
            </p>
            <p className="muted">
              {stats.schedule.daytime
                ? `modo día: cada minuto (${stats.schedule.dayStart}:00 a ${stats.schedule.dayEnd}:00).`
                : `modo noche: cada ${stats.schedule.nightEveryMin} min. solo suena lo que esté en tu vigilancia.`}
            </p>
            <dl className="numbers">
              <div>
                <dt>liberados 24 h</dt>
                <dd>{stats.last24h}</dd>
              </div>
              <div>
                <dt>vigilando</dt>
                <dd>{stats.watching}</dd>
              </div>
              <div>
                <dt>dispositivos</dt>
                <dd>{stats.devices}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="muted">cargando…</p>
        )}
        <button className="btn block" onClick={() => void pollNow()} disabled={polling}>
          {polling ? "revisando NIC…" : "revisar ahora ▸"}
        </button>
      </div>

      <div className="card">
        <h2>notificaciones</h2>
        {push === null && <p className="muted">comprobando…</p>}
        {push === "unsupported" && <p className="muted">este navegador no admite notificaciones push. prueba con Chrome, Edge o Safari actualizado.</p>}
        {push === "needs-install" && (
          <p className="muted">
            en iPhone las notificaciones solo funcionan con la app instalada: abre esta página en <strong>Safari</strong>, toca <strong>Compartir</strong> y luego{" "}
            <strong>Agregar a inicio</strong>. después ábrela desde el ícono y vuelve aquí.
          </p>
        )}
        {push === "denied" && <p className="muted">bloqueaste las notificaciones. actívalas en Ajustes del teléfono, en Notificaciones, Radar NIC.</p>}
        {(push === "off" || push === "on") && (
          <>
            <p className="muted">
              {push === "on" ? "activadas en este dispositivo. llegan aunque la app esté cerrada." : "actívalas para que el aviso te llegue al celular apenas un dominio quede libre."}
              {!isStandalone() && push === "off" ? " (en iPhone, hazlo desde la app instalada.)" : ""}
            </p>
            <div className="btn-row">
              <button className={`btn ${push === "on" ? "" : "primary"}`} onClick={() => void togglePush()} disabled={pushBusy}>
                {push === "on" ? "desactivar" : "activar notificaciones"}
              </button>
              {push === "on" && (
                <button className="btn" onClick={() => void testPush()} disabled={pushBusy}>
                  enviar prueba
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
        <h2>¿cuánto tarda NIC en liberar?</h2>
        {lag ? (
          <>
            <dl className="numbers">
              <div>
                <dt>promedio</dt>
                <dd>{Number(lag.avgDays?.toFixed(1))}d</dd>
              </div>
              <div>
                <dt>mínimo</dt>
                <dd>{lag.minDays}d</dd>
              </div>
              <div>
                <dt>máximo</dt>
                <dd>{lag.maxDays}d</dd>
              </div>
            </dl>
            <p className="muted">días entre el vencimiento y la liberación, medido en {lag.n} dominio(s) que vigilaste.</p>
          </>
        ) : (
          <p className="muted">
            sin datos todavía. cuando un dominio que vigilas venza y NIC lo libere, aquí queda cuántos días pasaron entre una cosa y la otra. con eso se sabe desde qué día estar atento.
          </p>
        )}
      </div>

      <div className="card">
        <h2>horas de liberación</h2>
        {stats && stats.tracked < 30 ? (
          <p className="muted">aún juntando datos ({stats.tracked} liberaciones vistas). con unos días de uso se ve en qué horas conviene estar atento.</p>
        ) : (
          <p className="muted">hora de Chile en que el radar vio por primera vez cada dominio liberado.</p>
        )}
        <div className="bars" role="img" aria-label="Dominios liberados por hora del día, hora de Chile">
          {(stats?.byHour ?? Array<number>(24).fill(0)).map((n, h) => (
            <div key={h} className="bar" title={`${h}:00 — ${n}`}>
              <span className={n ? "" : "zero"} style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 100)}%` }} />
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
        cerrar sesión
      </button>
      <Credit />
    </section>
  );
}
