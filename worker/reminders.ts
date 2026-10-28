// Lógica pura de los avisos de calendario (30, 7 y 1 día antes, y al vencer) y de los
// cambios que NIC muestra de un dominio. Sin base de datos: así se prueba sola.

import type { EventSpec } from "./events.ts";
import type { WhoisInfo } from "./whois.ts";

const DAY = 24 * 60 * 60 * 1000;

export type ReminderKind = "d30" | "d7" | "d1" | "expired";

/** De más lejano a más cercano. */
export const REMINDER_LEVELS: { kind: ReminderKind; beforeMs: number }[] = [
  { kind: "d30", beforeMs: 30 * DAY },
  { kind: "d7", beforeMs: 7 * DAY },
  { kind: "d1", beforeMs: 1 * DAY },
  { kind: "expired", beforeMs: 0 },
];

export interface ReminderPlan {
  /** Umbral más cercano que ya se cruzó; es el único que se avisa. */
  kind: ReminderKind;
  /** Todos los umbrales cruzados y aún sin procesar (se marcan juntos para no repetir). */
  mark: ReminderKind[];
  /** false: el umbral ya había pasado cuando se agregó el dominio; se marca en silencio. */
  notify: boolean;
}

/**
 * Qué hacer con un dominio vigilado en este momento.
 * Solo avisa por umbrales que se cruzaron DESPUÉS de agregarlo: si lo agregas con 5 días
 * de plazo, no recibes de golpe "faltan 30" y "faltan 7"; ya viste la fecha al agregarlo.
 */
export function planReminder(expiresAt: number, watchedSince: number, alreadySent: ReminderKind[], now: number): ReminderPlan | null {
  const crossed = REMINDER_LEVELS.filter((l) => now >= expiresAt - l.beforeMs && !alreadySent.includes(l.kind));
  if (!crossed.length) return null;
  const tightest = crossed[crossed.length - 1];
  return {
    kind: tightest.kind,
    mark: crossed.map((l) => l.kind),
    notify: watchedSince < expiresAt - tightest.beforeMs,
  };
}

export interface WhoisSnapshot {
  state: WhoisInfo["state"] | null;
  expiresAt: number | null;
  note: string | null;
}

export interface WhoisDiff {
  events: EventSpec[];
  renewed: { from: number; to: number } | null;
}

/** Compara lo guardado con lo que NIC acaba de decir y devuelve lo que vale la pena registrar. */
export function diffWhois(prev: WhoisSnapshot, next: WhoisInfo): WhoisDiff {
  const events: EventSpec[] = [];
  let renewed: WhoisDiff["renewed"] = null;

  if (next.state === "registered" && next.expiresAt !== null) {
    if (prev.state !== "registered") {
      events.push({ kind: "whois_registered", detail: { expiresAt: next.expiresAt } });
    } else if (prev.expiresAt !== null && next.expiresAt > prev.expiresAt + DAY / 2) {
      // El dueño pagó: la fecha se corrió. Es lo que más importa saber.
      renewed = { from: prev.expiresAt, to: next.expiresAt };
      events.push({ kind: "renewed", detail: renewed });
    }
  } else if (next.state === "available") {
    if (prev.state !== "available") events.push({ kind: "available_whois", once: true });
  } else if (next.state === "unknown") {
    if (prev.state !== "unknown" || prev.note !== next.note) events.push({ kind: "unknown", detail: { note: next.note } });
  }
  return { events, renewed };
}

/** Días entre el vencimiento y la liberación (puede ser decimal). */
export function releaseLagDays(expiresAt: number, releasedAt: number): number {
  return Math.round(((releasedAt - expiresAt) / DAY) * 10) / 10;
}
