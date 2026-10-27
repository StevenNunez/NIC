import { describe, expect, it } from "vitest";
import { inDigestWindow, isDaytime, santiagoTime, shouldPoll } from "./schedule.ts";

// Chile: UTC-3 en verano (desde septiembre) y UTC-4 en invierno.
describe("horario de Chile", () => {
  it("convierte a hora de Chile con horario de verano", () => {
    const t = santiagoTime(new Date("2026-10-27T11:00:00Z"));
    expect(t).toEqual({ hour: 8, minute: 0, date: "2026-10-27" });
  });

  it("convierte a hora de Chile con horario de invierno", () => {
    const t = santiagoTime(new Date("2026-07-01T12:00:00Z"));
    expect(t).toEqual({ hour: 8, minute: 0, date: "2026-07-01" });
  });

  it("de día revisa todos los minutos", () => {
    for (const iso of ["2026-10-27T11:01:00Z", "2026-10-27T15:37:00Z", "2026-10-28T01:59:00Z"]) {
      expect(shouldPoll(santiagoTime(new Date(iso)))).toBe(true);
    }
  });

  it("de noche solo revisa cada 15 minutos", () => {
    const night = (m: number) => santiagoTime(new Date(Date.UTC(2026, 9, 28, 5, m))); // 02:xx en Chile
    expect(isDaytime(night(0))).toBe(false);
    expect([0, 1, 7, 14, 15, 30, 45, 59].map((m) => shouldPoll(night(m)))).toEqual([true, false, false, false, true, true, true, false]);
  });

  it("el día va de 8:00 a 22:59", () => {
    expect(isDaytime(santiagoTime(new Date("2026-10-27T10:59:00Z")))).toBe(false); // 07:59
    expect(isDaytime(santiagoTime(new Date("2026-10-27T11:00:00Z")))).toBe(true); // 08:00
    expect(isDaytime(santiagoTime(new Date("2026-10-28T01:59:00Z")))).toBe(true); // 22:59
    expect(isDaytime(santiagoTime(new Date("2026-10-28T02:00:00Z")))).toBe(false); // 23:00
  });

  it("el resumen de la mañana sale entre las 8 y las 12", () => {
    expect(inDigestWindow(santiagoTime(new Date("2026-10-27T11:00:00Z")))).toBe(true);
    expect(inDigestWindow(santiagoTime(new Date("2026-10-27T14:59:00Z")))).toBe(true);
    expect(inDigestWindow(santiagoTime(new Date("2026-10-27T15:00:00Z")))).toBe(false);
    expect(inDigestWindow(santiagoTime(new Date("2026-10-27T10:00:00Z")))).toBe(false);
  });
});
