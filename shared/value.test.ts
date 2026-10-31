import { describe, expect, it } from "vitest";
import { BRAND_CAP, detectBrand, scoreDomain, trademarkLinks } from "./value.ts";

describe("puntaje de valor", () => {
  it("un nombre corto, limpio y pronunciable vale más que uno largo con números", () => {
    expect(scoreDomain("casa.cl").score).toBeGreaterThan(scoreDomain("casa-de-juan-1989.cl").score);
    expect(scoreDomain("loma.cl").score).toBeGreaterThan(scoreDomain("loma2.cl").score);
  });

  it("se mantiene entre 0 y 100 y suma los factores", () => {
    for (const d of ["a.cl", "tienda.cl", "xkqzvwrtp-77777777.cl", "tiendaverde.cl"]) {
      const s = scoreDomain(d, 20);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(s.factors.reduce((n, f) => n + f.points, 0)).toBe(s.score);
      for (const f of s.factors) expect(f.points).toBeLessThanOrEqual(f.max);
    }
  });

  it("una palabra reconocible suma, y dos palabras juntas también", () => {
    expect(scoreDomain("tienda.cl").factors.find((f) => f.label === "palabra")?.points).toBe(20);
    expect(scoreDomain("tiendaverde.cl").factors.find((f) => f.label === "palabra")?.points).toBe(14);
    expect(scoreDomain("zxqwv.cl").factors.find((f) => f.label === "palabra")?.points).toBe(0);
  });

  it("la historia en archive.org sube el puntaje; sin revisar no resta", () => {
    const sin = scoreDomain("pituto.cl", null).score;
    expect(scoreDomain("pituto.cl", 25).score).toBe(sin + 15);
    expect(scoreDomain("pituto.cl", 0).score).toBe(sin);
  });

  it("lo impronunciable pierde puntos", () => {
    const f = (d: string) => scoreDomain(d).factors.find((x) => x.label === "pronunciación")!.points;
    expect(f("bolsa.cl")).toBeGreaterThan(f("bcdfgh.cl"));
    expect(f("hdgfsrt.cl")).toBe(0);
  });

  it("acepta tildes y ñ sin romperse", () => {
    expect(() => scoreDomain("añoñé.cl", 3)).not.toThrow();
  });

  it("asigna una nota por tramos", () => {
    expect(scoreDomain("casa.cl", 20).grade).toBe("alto");
    expect(scoreDomain("zq-7-xkwv-99.cl").grade).toBe("bajo");
  });
});

describe("marcas", () => {
  it("detecta marcas famosas aunque estén dentro del nombre", () => {
    expect(detectBrand("google.cl")).toEqual({ brand: "google", kind: "exact" });
    expect(detectBrand("mi-tienda-nike.cl")?.brand).toBe("nike");
    expect(detectBrand("falabellaofertas.cl")?.kind).toBe("contains");
  });

  it("las marcas cortas o de palabra común solo cuentan si el nombre es justo eso", () => {
    expect(detectBrand("paris.cl")).not.toBeNull();
    expect(detectBrand("parisino.cl")).toBeNull();
    expect(detectBrand("claroscuro.cl")).toBeNull();
    expect(detectBrand("mazda.cl")).not.toBeNull();
  });

  it("un dominio sin marca no se marca", () => {
    expect(detectBrand("pituto.cl")).toBeNull();
  });

  it("una marca famosa acota el puntaje", () => {
    const s = scoreDomain("nike.cl", 25);
    expect(s.brand?.brand).toBe("nike");
    expect(s.score).toBeLessThanOrEqual(BRAND_CAP);
  });

  it("los enlaces de revisión llevan el nombre sin .cl", () => {
    const links = trademarkLinks("pituto.cl");
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(links.some((l) => l.url.includes("pituto") && !l.url.includes("pituto.cl"))).toBe(true);
  });
});
