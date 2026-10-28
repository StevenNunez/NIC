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

/** "2026-10-27 20:55" en hora de Chile: formato de línea de registro. */
export function stamp(ms: number): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(ms)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Reloj de Chile con segundos. */
export function clockSeconds(ms: number): string {
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(ms);
}

/** "T+4 min" / "T+3 h" / "T+2 d": edad corta para el listado. */
export function ageShort(ms: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return "T+0";
  if (m < 60) return `T+${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `T+${h}h` : `T+${Math.round(h / 24)}d`;
}

/** "2002–2026" (o solo "2014" si es un único año). */
export function yearRange(first: number, last: number): string {
  const a = new Date(first).getUTCFullYear();
  const b = new Date(last).getUTCFullYear();
  return a === b ? String(a) : `${a}–${b}`;
}

/** Qué tan larga es la historia, para darle un nombre al número de años. */
export function historyLevel(years: number): "larga" | "media" | "corta" {
  return years >= 10 ? "larga" : years >= 3 ? "media" : "corta";
}
