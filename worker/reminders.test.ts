import { describe, expect, it } from "vitest";
import { diffWhois, planReminder, releaseLagDays } from "./reminders.ts";

const DAY = 86_400_000;
const EXPIRES = Date.UTC(2026, 11, 26, 23, 7, 23); // pituto.cl: 26-dic-2026 20:07 CLST
const at = (daysBeforeExpiry: number) => EXPIRES - daysBeforeExpiry * DAY;

describe("avisos de calendario", () => {
  it("no hay nada que avisar si falta más de 30 días", () => {
    expect(planReminder(EXPIRES, at(60), [], at(31))).toBeNull();
  });

  it("avisa 'faltan 30 días' al cruzar el umbral, si el dominio ya estaba vigilado", () => {
    const plan = planReminder(EXPIRES, at(60), [], at(30));
    expect(plan).toEqual({ kind: "d30", mark: ["d30"], notify: true });
  });

  it("no repite un umbral ya enviado", () => {
    expect(planReminder(EXPIRES, at(60), ["d30"], at(20))).toBeNull();
  });

  it("al cruzar el siguiente umbral avisa solo ese", () => {
    const plan = planReminder(EXPIRES, at(60), ["d30"], at(7));
    expect(plan).toEqual({ kind: "d7", mark: ["d7"], notify: true });
  });

  it("si el celular estuvo sin conexión y se cruzaron varios, avisa el más cercano y marca todos", () => {
    const plan = planReminder(EXPIRES, at(60), [], at(0.5));
    expect(plan?.kind).toBe("d1");
    expect(plan?.mark).toEqual(["d30", "d7", "d1"]);
    expect(plan?.notify).toBe(true);
  });

  it("al agregar un dominio con 5 días de plazo no manda los umbrales ya pasados", () => {
    const plan = planReminder(EXPIRES, at(5), [], at(5));
    expect(plan).toEqual({ kind: "d7", mark: ["d30", "d7"], notify: false });
    // ...pero sí avisa 'mañana' cuando llegue.
    expect(planReminder(EXPIRES, at(5), ["d30", "d7"], at(1))).toEqual({ kind: "d1", mark: ["d1"], notify: true });
  });

  it("avisa cuando vence", () => {
    expect(planReminder(EXPIRES, at(10), ["d30", "d7", "d1"], EXPIRES + 1000)).toEqual({ kind: "expired", mark: ["expired"], notify: true });
  });

  it("un dominio agregado ya vencido no recibe aviso de 'venció'", () => {
    const plan = planReminder(EXPIRES, EXPIRES + 3 * DAY, [], EXPIRES + 3 * DAY);
    expect(plan?.kind).toBe("expired");
    expect(plan?.notify).toBe(false);
  });
});

describe("cambios que muestra NIC", () => {
  const registered = (expiresAt: number) => ({ state: "registered" as const, createdAt: 1, expiresAt, note: null });

  it("la primera lectura queda registrada", () => {
    const d = diffWhois({ state: null, expiresAt: null, note: null }, registered(EXPIRES));
    expect(d.events).toEqual([{ kind: "whois_registered", detail: { expiresAt: EXPIRES } }]);
    expect(d.renewed).toBeNull();
  });

  it("una lectura igual a la anterior no genera ruido", () => {
    const d = diffWhois({ state: "registered", expiresAt: EXPIRES, note: null }, registered(EXPIRES));
    expect(d.events).toEqual([]);
  });

  it("detecta que el titular renovó", () => {
    const next = EXPIRES + 365 * DAY;
    const d = diffWhois({ state: "registered", expiresAt: EXPIRES, note: null }, registered(next));
    expect(d.renewed).toEqual({ from: EXPIRES, to: next });
    expect(d.events[0].kind).toBe("renewed");
  });

  it("un corrimiento de horas (no de un año) no cuenta como renovación", () => {
    const d = diffWhois({ state: "registered", expiresAt: EXPIRES, note: null }, registered(EXPIRES + 3600_000));
    expect(d.renewed).toBeNull();
  });

  it("registra una sola vez que NIC dice 'no existe'", () => {
    const next = { state: "available" as const, createdAt: null, expiresAt: null, note: null };
    expect(diffWhois({ state: "registered", expiresAt: EXPIRES, note: null }, next).events).toEqual([{ kind: "available_whois", once: true }]);
    expect(diffWhois({ state: "available", expiresAt: null, note: null }, next).events).toEqual([]);
  });

  it("registra un estado desconocido y su texto, y solo cuando cambia", () => {
    const next = { state: "unknown" as const, createdAt: null, expiresAt: null, note: "Estado: en restauración" };
    const first = diffWhois({ state: "registered", expiresAt: EXPIRES, note: null }, next);
    expect(first.events).toEqual([{ kind: "unknown", detail: { note: "Estado: en restauración" } }]);
    expect(diffWhois({ state: "unknown", expiresAt: null, note: "Estado: en restauración" }, next).events).toEqual([]);
  });
});

describe("rezago de liberación", () => {
  it("mide los días entre el vencimiento y la liberación", () => {
    expect(releaseLagDays(EXPIRES, EXPIRES + 30 * DAY)).toBe(30);
    expect(releaseLagDays(EXPIRES, EXPIRES + 12 * 3600_000)).toBe(0.5);
  });
});
