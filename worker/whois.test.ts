import { describe, expect, it } from "vitest";
import { parseNicDate, parseWhois } from "./whois.ts";

const page = (body: string) => `<html><script>var x = "Fecha de expiración: 1999";</script><body>
  Buscar dominio: <input> Exacta Contenga ${body} Fecha Actual: 2026-10-27 20:52:57 CLST Para consultas...</body></html>`;

describe("whois de NIC", () => {
  it("lee las fechas de un dominio inscrito", () => {
    const info = parseWhois(
      page(`pituto.cl Titular: ALGUIEN (ALGUIEN) Agente Registrador: NIC Chile
        Fecha de creación: 2001-12-01 23:07:23 CLST Fecha de última modificación: 2022-12-22 13:50:15 CLST
        Fecha de expiración: 2026-12-26 20:07:23 CLST Servidor de Nombre: ns1.ejemplo.com`),
    );
    expect(info.state).toBe("registered");
    expect(new Date(info.expiresAt!).toISOString()).toBe("2026-12-26T23:07:23.000Z");
    expect(new Date(info.createdAt!).toISOString()).toBe("2001-12-02T02:07:23.000Z");
    expect(info.note).toBeNull();
  });

  it("no toma fechas de los scripts de la página", () => {
    expect(parseWhois(page("algo raro")).state).toBe("unknown");
  });

  it("detecta un dominio libre", () => {
    expect(parseWhois(page('Nombre de dominio no existe. Inscribir "acgi.cl" Ver Tarifas')).state).toBe("available");
  });

  it("un estado desconocido deja un extracto sin el titular", () => {
    const info = parseWhois(page("minuevo.cl Titular: JUAN PEREZ (JUAN PEREZ) Agente Registrador: NIC Chile Estado: en restauración"));
    expect(info.state).toBe("unknown");
    expect(info.note).toContain("restauración");
    expect(info.note).not.toContain("JUAN");
  });

  it("convierte horario de verano e invierno a UTC", () => {
    expect(new Date(parseNicDate("2026-12-26 20:07:23 CLST")!).toISOString()).toBe("2026-12-26T23:07:23.000Z");
    expect(new Date(parseNicDate("2026-07-01 10:00:00 CLT")!).toISOString()).toBe("2026-07-01T14:00:00.000Z");
    expect(parseNicDate("sin fecha")).toBeNull();
  });
});
