import { useState } from "react";
import { scoreDomain, TRADEMARK_LABEL, trademarkLinks, type TrademarkStatus } from "../../shared/value";
import { clearCheck, saveCheck, useTrademark, type TrademarkCheck } from "../trademarks";

const STATUSES: TrademarkStatus[] = ["clear", "unsure", "risk"];

/** Puntaje de valor del dominio y, al abrirlo, el desglose y la revisión de marcas. */
export default function ValueInfo({ name, wbYears = null }: { name: string; wbYears?: number | null }) {
  const [open, setOpen] = useState(false);
  const v = scoreDomain(name, wbYears);
  const check = useTrademark(name);
  const flagged = v.brand || check?.status === "risk";

  return (
    <div className="value">
      <button className={`value-pill g-${v.grade}`} aria-expanded={open} onClick={() => setOpen(!open)} title="Puntaje de valor: ver cómo se calcula">
        valor {v.score}
        {flagged ? " ⚠" : check?.status === "clear" ? " ✓" : ""}
      </button>
      {open && (
        <div className="value-panel">
          <p className="muted">
            puntaje <b>{v.score}/100</b> · {v.grade}. estimación por reglas (largo, limpieza, pronunciación, palabra, historia): sirve para comparar, no es una tasación.
          </p>
          <ul className="factors">
            {v.factors.map((f) => (
              <li key={f.label}>
                <span>{f.label}</span>
                <span className="meter" role="img" aria-label={`${f.points} de ${f.max}`}>
                  <i style={{ width: `${(f.points / f.max) * 100}%` }} />
                </span>
                <span className="muted">
                  {f.points}/{f.max} · {f.note}
                </span>
              </li>
            ))}
          </ul>

          {v.brand && (
            <p role="alert" className="error">
              ⚠ el nombre {v.brand.kind === "exact" ? "es" : "contiene"} «{v.brand.brand}», una marca conocida. comprarlo puede terminar en un reclamo y casi no se puede revender, por eso el puntaje no pasa de 30.
            </p>
          )}

          <TrademarkReview name={name} check={check} />
        </div>
      )}
    </div>
  );
}

function TrademarkReview({ name, check }: { name: string; check: TrademarkCheck | undefined }) {
  const [note, setNote] = useState(check?.note ?? "");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const base = name.slice(0, -3);

  async function copy() {
    try {
      await navigator.clipboard.writeText(base);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg("no pude copiar: escribe el nombre a mano");
    }
  }

  async function mark(status: TrademarkStatus) {
    setMsg("");
    try {
      await saveCheck(name, status, note);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  return (
    <div className="tm">
      <h3>revisión de marcas</h3>
      <p className="muted">
        antes de comprar, busca «{base}» en los registros de marcas. INAPI pide un captcha, así que no puedo consultarlo por ti: copia el nombre, búscalo y anota aquí qué viste.
      </p>
      <p className="links">
        <button type="button" className="btn small" onClick={() => void copy()}>
          {copied ? "copiado ✓" : "copiar nombre"}
        </button>
        {trademarkLinks(name).map((l) => (
          <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" title={l.note}>
            {l.label} ↗
          </a>
        ))}
      </p>
      <input aria-label={`Nota de la revisión de ${name}`} placeholder="nota (ej. clase 35, titular X, vigente)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="btn-row">
        {STATUSES.map((s) => (
          <button key={s} type="button" className={`btn small ${check?.status === s ? "primary" : ""}`} aria-pressed={check?.status === s} onClick={() => void mark(s)}>
            {TRADEMARK_LABEL[s]}
          </button>
        ))}
        {check && (
          <button type="button" className="btn small" onClick={() => void clearCheck(name).then(() => setNote(""))}>
            borrar
          </button>
        )}
      </div>
      {check && (
        <p className="muted">
          revisado el {new Date(check.checkedAt).toLocaleDateString("es-CL")}: <b>{TRADEMARK_LABEL[check.status]}</b>
          {check.note ? ` · ${check.note}` : ""}
        </p>
      )}
      {msg && (
        <p role="alert" className="error">
          {msg}
        </p>
      )}
    </div>
  );
}
