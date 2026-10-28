import { describe, expect, it } from "vitest";
import { decideHistoryAlert, digestHistoryLine, FRESH_MS, historyAlertMessage } from "./history-alerts.ts";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.ts";

const NOW = Date.UTC(2026, 11, 1, 15, 0, 0);
const base = {
  settings: { enabled: true, minYears: 10, maxPer24h: 5 },
  years: 14,
  firstSeenAt: NOW - 20 * 60_000, // lo vio liberarse hace 20 minutos
  now: NOW,
  daytime: true,
  sentLast24h: 0,
};

describe("¿avisar de un dominio liberado con historia?", () => {
  it("avisa si es fresco, de día, con historia suficiente y bajo el tope", () => {
    expect(decideHistoryAlert(base)).toEqual({ send: true });
  });

  it("no avisa si el aviso está apagado", () => {
    expect(decideHistoryAlert({ ...base, settings: { ...base.settings, enabled: false } })).toEqual({ send: false, reason: "off" });
  });

  it("no avisa con menos años que el mínimo, pero sí justo en el mínimo", () => {
    expect(decideHistoryAlert({ ...base, years: 9 })).toEqual({ send: false, reason: "below" });
    expect(decideHistoryAlert({ ...base, years: 10 })).toEqual({ send: true });
  });

  it("no avisa si ya perdió la carrera (más de 3 horas liberado)", () => {
    expect(decideHistoryAlert({ ...base, firstSeenAt: NOW - FRESH_MS - 1 })).toEqual({ send: false, reason: "old" });
    expect(decideHistoryAlert({ ...base, firstSeenAt: NOW - FRESH_MS })).toEqual({ send: true });
  });

  it("de noche no suena: queda para el resumen", () => {
    expect(decideHistoryAlert({ ...base, daytime: false })).toEqual({ send: false, reason: "night" });
  });

  it("respeta el tope por 24 horas", () => {
    expect(decideHistoryAlert({ ...base, sentLast24h: 4 })).toEqual({ send: true });
    expect(decideHistoryAlert({ ...base, sentLast24h: 5 })).toEqual({ send: false, reason: "cap" });
  });

  it("una causa más clara gana sobre otra: sin historia suficiente, ni se mira el tope", () => {
    expect(decideHistoryAlert({ ...base, years: 2, sentLast24h: 99, daytime: false })).toEqual({ send: false, reason: "below" });
  });
});

describe("mensajes", () => {
  const first = Date.UTC(2009, 5, 3);
  const last = Date.UTC(2021, 10, 18);

  it("el aviso dice cuántos años y de cuándo a cuándo", () => {
    const m = historyAlertMessage("tiendaalpina.cl", 13, first, last);
    expect(m.title).toBe("🏛️ tiendaalpina.cl se liberó · 13 años de historia");
    expect(m.body).toContain("2009–2021");
  });

  it("un solo año no se muestra como rango", () => {
    expect(historyAlertMessage("x.cl", 1, Date.UTC(2014, 1, 1), Date.UTC(2014, 8, 1)).body).toContain("sitio 2014.");
  });

  it("la línea del resumen lista los dominios con sus años", () => {
    expect(digestHistoryLine([{ name: "a.cl", years: 14 }, { name: "b.cl", years: 11 }])).toBe("Con historia: a.cl (14 años), b.cl (11 años)");
  });
});

describe("ajustes", () => {
  it("sin nada guardado usa los valores por defecto", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("basura")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("acota los números a rangos razonables", () => {
    const s = normalizeSettings({ historyAlert: { enabled: false, minYears: 500, maxPer24h: -3 } });
    expect(s.historyAlert).toEqual({ enabled: false, minYears: 30, maxPer24h: 1 });
    expect(normalizeSettings({ historyAlert: { minYears: 1 } }).historyAlert.minYears).toBe(3);
  });

  it("ignora tipos equivocados y redondea", () => {
    const s = normalizeSettings({ historyAlert: { enabled: "sí", minYears: "8", maxPer24h: 6.6 } });
    expect(s.historyAlert).toEqual({ enabled: true, minYears: 10, maxPer24h: 7 });
  });
});
