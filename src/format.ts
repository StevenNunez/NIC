export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "hace un momento";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

export function clock(ms: number): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
}

/** "26 dic 2026, 20:07" en hora de Chile. */
export function dateTime(ms: number): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);
}

/** Días enteros entre dos fechas (calendario de Chile, no 24 h corridas). */
function dayNumber(ms: number): number {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ms); // YYYY-MM-DD
  return Math.floor(Date.parse(`${p}T00:00:00Z`) / 86400_000);
}

export function daysUntil(ms: number, now = Date.now()): number {
  return dayNumber(ms) - dayNumber(now);
}

export function countdown(expiresAt: number, now = Date.now()): string {
  const d = daysUntil(expiresAt, now);
  if (d > 1) return `faltan ${d} días`;
  if (d === 1) return "vence mañana";
  if (d === 0) return expiresAt > now ? "vence hoy" : "venció hoy";
  return d === -1 ? "venció ayer" : `venció hace ${-d} días`;
}
