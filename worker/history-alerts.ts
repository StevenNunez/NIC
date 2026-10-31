// Decide si un dominio recién liberado con historia merece un aviso al celular. Lógica pura.

import { scoreDomain } from "../shared/value.ts";
import type { Settings } from "./settings.ts";

/** Pasado este tiempo desde que el radar lo vio liberarse, ya perdió la carrera: no se avisa, va en el resumen. */
export const FRESH_MS = 3 * 60 * 60 * 1000;

export type Skip = "off" | "below" | "old" | "night" | "cap";
export type Decision = { send: true } | { send: false; reason: Skip };

export interface HistoryAlertInput {
  settings: Settings["historyAlert"];
  years: number;
  firstSeenAt: number;
  now: number;
  daytime: boolean;
  /** Avisos por historia enviados en las últimas 24 horas. */
  sentLast24h: number;
}

export function decideHistoryAlert(i: HistoryAlertInput): Decision {
  if (!i.settings.enabled) return { send: false, reason: "off" };
  if (i.years < i.settings.minYears) return { send: false, reason: "below" };
  if (i.now - i.firstSeenAt > FRESH_MS) return { send: false, reason: "old" };
  if (!i.daytime) return { send: false, reason: "night" };
  if (i.sentLast24h >= i.settings.maxPer24h) return { send: false, reason: "cap" };
  return { send: true };
}

export function historyAlertMessage(name: string, years: number, firstAt: number, lastAt: number): { title: string; body: string } {
  const from = new Date(firstAt).getUTCFullYear();
  const to = new Date(lastAt).getUTCFullYear();
  const v = scoreDomain(name, years);
  return {
    title: `🏛️ ${name} se liberó · ${years} años de historia`,
    body: `Tuvo sitio ${from === to ? from : `${from}–${to}`}. Valor ${v.score}/100${v.brand ? ` (¡ojo, parece la marca ${v.brand.brand}!)` : ""}. NIC lo acaba de liberar: inscríbelo antes que otro.`,
  };
}

/** Texto corto para el resumen de la mañana. */
export function digestHistoryLine(picks: { name: string; years: number }[]): string {
  return `Con historia: ${picks.map((p) => `${p.name} (${p.years} años)`).join(", ")}`;
}
