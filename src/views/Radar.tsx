import { useEffect, useState } from "react";
import { api, type PatternRule, type PollInfo, type Settings, type Stats } from "../api";
import Credit from "../components/Credit";
import { timeAgo } from "../format";
import { disablePush, enablePush, getPushState, isStandalone, type PushState } from "../push";

export default function Radar({ stats, reload, onLogout }: { stats: Stats | null; reload: () => Promise<void>; onLogout: () => void }) {
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [pushMsg, setPushMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void getPushState().then(setPush);
    void reload();
    api<Settings>("/api/settings")
      .then(setSettings)
      .catch(() => {});
  }, [reload]);

  async function saveSettings(patch: Partial<Settings["historyAlert"]>) {
    if (!settings) return;
    await putSettings({ ...settings, historyAlert: { ...settings.historyAlert, ...patch } });
  }

  async function putSettings(next: Settings) {
    if (!settings) return;
    setSettings(next); // se ve el cambio de inmediato; si el servidor falla, se vuelve a lo guardado
    try {
      setSettings(await api<Settings>("/api/settings", { method: "PUT", json: next }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      setSettings(await api<Settings>("/api/settings").catch(() => settings));
    }
  }

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
        <h2>avisos por historia</h2>
        <p className="muted">
          cuando NIC libera un dominio con muchos años de sitio, te aviso aunque no lo vigiles. solo de día y solo si lo vi liberarse hace menos de 3 horas; lo que sale de noche va en el resumen de las 8:00.
        </p>
        {settings ? (
          <>
            <div className="setting">
              <span id="ha-on">avisos activados</span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.historyAlert.enabled}
                aria-labelledby="ha-on"
                className="switch"
                onClick={() => void saveSettings({ enabled: !settings.historyAlert.enabled })}
              />
            </div>
            <label className="setting">
              <span>años mínimos de historia</span>
              <select value={settings.historyAlert.minYears} onChange={(e) => void saveSettings({ minYears: Number(e.target.value) })} disabled={!settings.historyAlert.enabled}>
                {withCurrent([3, 5, 8, 10, 15, 20], settings.historyAlert.minYears).map((n) => (
                  <option key={n} value={n}>
                    {n} años
                  </option>
                ))}
              </select>
            </label>
            <label className="setting">
              <span>máximo de avisos cada 24 h</span>
              <select value={settings.historyAlert.maxPer24h} onChange={(e) => void saveSettings({ maxPer24h: Number(e.target.value) })} disabled={!settings.historyAlert.enabled}>
                {withCurrent([1, 3, 5, 10, 20], settings.historyAlert.maxPer24h).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {stats && <p className="muted">en las últimas 24 h: <b>{stats.archive.alerts24h}</b> avisos de este tipo.</p>}
          </>
        ) : (
          <p className="muted">cargando…</p>
        )}
      </div>

      <div className="card">
        <h2>avisos por patrón</h2>
        <p className="muted">
          dime qué tipo de dominio te interesa y te aviso cuando NIC libere uno que calce, aunque no tenga historia. de noche no suena: va en el resumen de las 8:00. un solo aviso por revisión, aunque calcen varios.
        </p>
        {settings ? (
          <PatternRules rules={settings.patterns} onChange={(patterns) => void putSettings({ ...settings, patterns })} />
        ) : (
          <p className="muted">cargando…</p>
        )}
      </div>

      <div className="card">
        <h2>historia en archive.org</h2>
        {stats && stats.total > 0 ? (
          <>
            <div className="meter" role="img" aria-label={`${stats.archive.checked} de ${stats.total} dominios revisados`}>
              <i style={{ width: `${Math.min(100, (stats.archive.checked / stats.total) * 100)}%` }} />
            </div>
            <p className="muted">
              revisados <b>{stats.archive.checked.toLocaleString("es-CL")}</b> de {stats.total.toLocaleString("es-CL")} · <b>{stats.archive.withHistory.toLocaleString("es-CL")}</b> tuvieron sitio.
              {stats.archive.checked < stats.total ? " sigo revisando en segundo plano, de a poco." : ""}
            </p>
          </>
        ) : (
          <p className="muted">sin datos todavía.</p>
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

const EMPTY_RULE: Omit<PatternRule, "id"> = { label: "", enabled: true, minLen: 0, maxLen: 0, noDigit: false, noHyphen: false, startsWith: "", endsWith: "", contains: "" };

function PatternRules({ rules, onChange }: { rules: PatternRule[]; onChange: (rules: PatternRule[]) => void }) {
  const [draft, setDraft] = useState(EMPTY_RULE);
  const set = <K extends keyof typeof EMPTY_RULE>(k: K, v: (typeof EMPTY_RULE)[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const num = (v: string) => Math.max(0, Math.min(63, Math.floor(Number(v)) || 0));
  const hasCondition = draft.minLen || draft.maxLen || draft.noDigit || draft.noHyphen || draft.startsWith || draft.endsWith || draft.contains;

  function add() {
    if (!hasCondition || rules.length >= 10) return;
    onChange([...rules, { ...draft, id: `r${Date.now().toString(36)}` }]);
    setDraft(EMPTY_RULE);
  }

  return (
    <>
      {rules.length === 0 && <p className="muted">sin reglas todavía. ejemplo: 4 letras, sin números ni guion.</p>}
      {rules.map((r) => (
        <div className="setting" key={r.id}>
          <span id={`pr-${r.id}`}>{r.label}</span>
          <span className="btn-row">
            <button
              type="button"
              role="switch"
              aria-checked={r.enabled}
              aria-labelledby={`pr-${r.id}`}
              className="switch"
              onClick={() => onChange(rules.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))}
            />
            <button type="button" className="btn" aria-label={`quitar ${r.label}`} onClick={() => onChange(rules.filter((x) => x.id !== r.id))}>
              quitar
            </button>
          </span>
        </div>
      ))}

      {rules.length < 10 && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="btn-row">
            <label className="setting">
              <span>largo mín.</span>
              <input type="number" inputMode="numeric" min={0} max={63} value={draft.minLen || ""} onChange={(e) => set("minLen", num(e.target.value))} />
            </label>
            <label className="setting">
              <span>largo máx.</span>
              <input type="number" inputMode="numeric" min={0} max={63} value={draft.maxLen || ""} onChange={(e) => set("maxLen", num(e.target.value))} />
            </label>
          </div>
          <label className="setting">
            <span>empieza con</span>
            <input value={draft.startsWith} maxLength={30} onChange={(e) => set("startsWith", e.target.value)} />
          </label>
          <label className="setting">
            <span>termina en</span>
            <input value={draft.endsWith} maxLength={30} onChange={(e) => set("endsWith", e.target.value)} />
          </label>
          <label className="setting">
            <span>contiene</span>
            <input value={draft.contains} maxLength={30} onChange={(e) => set("contains", e.target.value)} />
          </label>
          <label className="setting">
            <span>sin números</span>
            <input type="checkbox" checked={draft.noDigit} onChange={(e) => set("noDigit", e.target.checked)} />
          </label>
          <label className="setting">
            <span>sin guion</span>
            <input type="checkbox" checked={draft.noHyphen} onChange={(e) => set("noHyphen", e.target.checked)} />
          </label>
          <label className="setting">
            <span>nombre (opcional)</span>
            <input value={draft.label} maxLength={40} onChange={(e) => set("label", e.target.value)} />
          </label>
          <button className="btn block" type="submit" disabled={!hasCondition}>
            agregar regla ▸
          </button>
        </form>
      )}
    </>
  );
}

/** Las opciones del selector, con el valor guardado incluido aunque no esté entre las habituales. */
function withCurrent(options: number[], current: number): number[] {
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b);
}
