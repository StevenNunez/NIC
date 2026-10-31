// Ajustes del radar (se guardan como un solo valor JSON en la tabla meta).

import { normalizeRules, type PatternRule } from "./pattern-alerts.ts";

export interface Settings {
  historyAlert: {
    enabled: boolean;
    /** Años mínimos de historia en archive.org para avisar. */
    minYears: number;
    /** Máximo de avisos por historia en cualquier ventana de 24 horas. */
    maxPer24h: number;
  };
  /** Reglas de patrón: avisan de dominios recién liberados que calcen (ver pattern-alerts.ts). */
  patterns: PatternRule[];
}

export const DEFAULT_SETTINGS: Settings = { historyAlert: { enabled: true, minYears: 10, maxPer24h: 5 }, patterns: [] };

const clampInt = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Acepta cualquier cosa: lo que falte o venga mal toma el valor por defecto y los números se acotan. */
export function normalizeSettings(raw: unknown): Settings {
  const h = (typeof raw === "object" && raw !== null ? (raw as { historyAlert?: unknown }).historyAlert : null) as Record<string, unknown> | null;
  const d = DEFAULT_SETTINGS.historyAlert;
  return {
    historyAlert: {
      enabled: typeof h?.enabled === "boolean" ? h.enabled : d.enabled,
      minYears: clampInt(h?.minYears, 3, 30, d.minYears),
      maxPer24h: clampInt(h?.maxPer24h, 1, 30, d.maxPer24h),
    },
    patterns: normalizeRules(typeof raw === "object" && raw !== null ? (raw as { patterns?: unknown }).patterns : null),
  };
}

export async function getSettings(env: Env): Promise<Settings> {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'settings'").first<{ value: string }>();
  if (!row) return DEFAULT_SETTINGS;
  try {
    return normalizeSettings(JSON.parse(row.value));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(env: Env, settings: Settings): Promise<void> {
  await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('settings', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1")
    .bind(JSON.stringify(settings))
    .run();
}
