// Horario del radar, siempre en hora de Chile (cambia dos veces al año, por eso
// el cron corre todos los minutos y es el código quien decide si toca trabajar).

const TZ = "America/Santiago";

/** Desde las 8:00 hasta antes de las 23:00: se revisa NIC cada minuto. */
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 23;
/** De noche solo se revisa cada tantos minutos. */
export const NIGHT_EVERY_MIN = 15;

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface SantiagoTime {
  hour: number;
  minute: number;
  /** YYYY-MM-DD en hora de Chile */
  date: string;
}

export function santiagoTime(d: Date): SantiagoTime {
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  return { hour: Number(p.hour), minute: Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}

export function isDaytime(t: SantiagoTime): boolean {
  return t.hour >= DAY_START_HOUR && t.hour < DAY_END_HOUR;
}

export function shouldPoll(t: SantiagoTime): boolean {
  return isDaytime(t) || t.minute % NIGHT_EVERY_MIN === 0;
}

/** El resumen de la mañana sale en la primera revisión entre las 8:00 y las 12:00 de cada día. */
export function inDigestWindow(t: SantiagoTime): boolean {
  return t.hour >= DAY_START_HOUR && t.hour < 12;
}
