import { describe, expect, it } from "vitest";
import { normalizeDomain, registerUrl } from "../shared/domain.ts";
import { parseList } from "./nic.ts";

const sample = (n: number) => Array.from({ length: n }, (_, i) => `dominio${i}.cl`).join("\n");

describe("lista de NIC", () => {
  it("ignora la línea de fecha y lo que no es un dominio .cl", () => {
    const text = `Fecha Consulta: 2026-10-27 19:46:53\n${sample(60)}\n<html>\nfoo.com\n\n`;
    const { domains } = parseList(text);
    expect(domains).toHaveLength(60);
    expect(domains[0]).toBe("dominio0.cl");
  });

  it("acepta mayúsculas, CRLF y duplicados", () => {
    const { domains } = parseList(`${sample(60).replace(/\n/g, "\r\n")}\r\nDOMINIO0.CL\r\n`);
    expect(domains).toHaveLength(60);
  });

  it("acepta subdominios con guion y punycode", () => {
    const { domains } = parseList(`${sample(60)}\nmi-casa.cl\nxn--ao-zia.cl\nwww.ejemplo.cl`);
    expect(domains).toContain("mi-casa.cl");
    expect(domains).toContain("xn--ao-zia.cl");
    expect(domains).toContain("www.ejemplo.cl");
  });

  it("falla si NIC devuelve casi nada (página de error o formato nuevo)", () => {
    expect(() => parseList("<html>Error</html>")).toThrow(/descarta/);
    expect(() => parseList(sample(10))).toThrow(/descarta/);
  });
});

describe("dominios", () => {
  it("normaliza lo que se escribe a mano", () => {
    expect(normalizeDomain("Pituto")).toBe("pituto.cl");
    expect(normalizeDomain(" pituto.cl ")).toBe("pituto.cl");
    expect(normalizeDomain("https://www.pituto.cl/inicio")).toBe("www.pituto.cl");
    expect(normalizeDomain("mi-casa")).toBe("mi-casa.cl");
  });

  it("rechaza lo que no puede ser un .cl", () => {
    for (const bad of ["", "   ", "pituto.com", "a b", "x'; DROP TABLE domains;--", "ñandú", "a".repeat(80)]) {
      expect(normalizeDomain(bad)).toBeNull();
    }
  });

  it("arma el enlace de inscripción como el botón de NIC", () => {
    expect(registerUrl("acgi.cl")).toBe("https://clientes.nic.cl/registrar/agregarDominio.do?d=YWNnaS5jbA==");
  });
});
