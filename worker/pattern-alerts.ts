import { scoreDomain } from "../shared/value.ts";

// Alertas por patrón: reglas del usuario ("4 letras sin números", "contiene shop") contra dominios recién liberados. Lógica pura.

export interface PatternRule {
  id: string;
  label: string;
  enabled: boolean;
  /** Largo del nombre sin ".cl"; 0 = sin límite. */
  minLen: number;
  maxLen: number;
  noDigit: boolean;
  noHyphen: boolean;
  startsWith: string;
  endsWith: string;
  contains: string;
}

export const MAX_RULES = 10;
/** Nombres que se listan en el cuerpo del aviso. */
export const MAX_LISTED = 5;

const TEXT = /[^a-z0-9ñáéíóúü-]/g;
const clean = (v: unknown): string => (typeof v === "string" ? v.toLowerCase().replace(TEXT, "").slice(0, 30) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(63, Math.max(0, Math.round(v))) : 0);

/** Acepta cualquier cosa: descarta reglas inválidas y acota lo demás. */
export function normalizeRules(raw: unknown): PatternRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: PatternRule[] = [];
  for (const r of raw.slice(0, MAX_RULES)) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    let minLen = num(o.minLen);
    let maxLen = num(o.maxLen);
    if (minLen && maxLen && minLen > maxLen) [minLen, maxLen] = [maxLen, minLen];
    const rule: PatternRule = {
      id: typeof o.id === "string" && o.id ? o.id.slice(0, 40) : `r${rules.length + 1}`,
      label: typeof o.label === "string" ? o.label.trim().slice(0, 40) : "",
      enabled: typeof o.enabled === "boolean" ? o.enabled : true,
      minLen,
      maxLen,
      noDigit: o.noDigit === true,
      noHyphen: o.noHyphen === true,
      startsWith: clean(o.startsWith),
      endsWith: clean(o.endsWith),
      contains: clean(o.contains),
    };
    // Una regla sin ninguna condición avisaría de todo: no se guarda.
    if (!hasCondition(rule)) continue;
    rule.label ||= describeRule(rule);
    rules.push(rule);
  }
  return rules;
}

function hasCondition(r: PatternRule): boolean {
  return r.minLen > 0 || r.maxLen > 0 || r.noDigit || r.noHyphen || !!r.startsWith || !!r.endsWith || !!r.contains;
}

/** Descripción corta de lo que pide la regla, para cuando no se le puso nombre. */
export function describeRule(r: PatternRule): string {
  const parts: string[] = [];
  if (r.minLen && r.minLen === r.maxLen) parts.push(`${r.minLen} letras`);
  else {
    if (r.minLen) parts.push(`mín. ${r.minLen}`);
    if (r.maxLen) parts.push(`máx. ${r.maxLen}`);
  }
  if (r.noDigit) parts.push("sin números");
  if (r.noHyphen) parts.push("sin guion");
  if (r.startsWith) parts.push(`empieza con ${r.startsWith}`);
  if (r.endsWith) parts.push(`termina en ${r.endsWith}`);
  if (r.contains) parts.push(`contiene ${r.contains}`);
  return parts.join(", ");
}

/** ¿Calza el dominio (ej. "tienda.cl") con la regla? */
export function matchesRule(domain: string, r: PatternRule): boolean {
  if (!r.enabled) return false;
  const base = domain.endsWith(".cl") ? domain.slice(0, -3) : domain;
  if (r.minLen && base.length < r.minLen) return false;
  if (r.maxLen && base.length > r.maxLen) return false;
  if (r.noDigit && /\d/.test(base)) return false;
  if (r.noHyphen && base.includes("-")) return false;
  if (r.startsWith && !base.startsWith(r.startsWith)) return false;
  if (r.endsWith && !base.endsWith(r.endsWith)) return false;
  if (r.contains && !base.includes(r.contains)) return false;
  return true;
}

export interface PatternHit {
  name: string;
  rule: string;
  /** Puntaje de valor (0-100) sin contar historia, que aquí aún no se conoce. */
  score: number;
}

/** Dominios que calzan con alguna regla activa (cada uno una vez), los de más valor primero. */
export function findHits(names: string[], rules: PatternRule[]): PatternHit[] {
  const active = rules.filter((r) => r.enabled);
  if (!active.length) return [];
  const hits: PatternHit[] = [];
  for (const name of names) {
    const rule = active.find((r) => matchesRule(name, r));
    if (rule) hits.push({ name, rule: rule.label, score: scoreDomain(name).score });
  }
  return hits.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
}

/** Un solo mensaje por pasada, aunque calcen muchos: la lista semanal puede traer cientos de golpe. */
export function patternMessage(hits: PatternHit[]): { title: string; body: string } {
  const listed = hits.slice(0, MAX_LISTED).map((h) => `${h.name} (${h.score})`).join(", ");
  const more = hits.length > MAX_LISTED ? ` y ${hits.length - MAX_LISTED} más` : "";
  return {
    title: hits.length === 1 ? `🎯 ${hits[0].name} se liberó` : `🎯 ${hits.length} dominios calzan con tus patrones`,
    body: hits.length === 1 ? `Calza con «${hits[0].rule}». Valor ${hits[0].score}/100. Inscríbelo antes que otro.` : `${listed}${more}.`,
  };
}
