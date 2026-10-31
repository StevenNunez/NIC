import { describe, expect, it } from "vitest";
import { describeRule, findHits, matchesRule, normalizeRules, patternMessage } from "./pattern-alerts.ts";

const four = normalizeRules([{ minLen: 4, maxLen: 4, noDigit: true, noHyphen: true }])[0];

describe("reglas de patrón", () => {
  it("'4 letras sin números' calza solo con lo que corresponde", () => {
    expect(matchesRule("casa.cl", four)).toBe(true);
    expect(matchesRule("casas.cl", four)).toBe(false);
    expect(matchesRule("ca5a.cl", four)).toBe(false);
    expect(matchesRule("ca-a.cl", four)).toBe(false);
  });

  it("mide el largo sin el .cl", () => {
    expect(matchesRule("abcd.cl", four)).toBe(true);
  });

  it("empieza, termina y contiene", () => {
    const [r] = normalizeRules([{ startsWith: "tienda", contains: "mar" }]);
    expect(matchesRule("tiendamar.cl", r)).toBe(true);
    expect(matchesRule("tiendasol.cl", r)).toBe(false);
    expect(matchesRule("martienda.cl", r)).toBe(false);
  });

  it("una regla apagada no calza", () => {
    expect(matchesRule("casa.cl", { ...four, enabled: false })).toBe(false);
  });
});

describe("normalizeRules", () => {
  it("descarta reglas sin condiciones y lo que no es regla", () => {
    expect(normalizeRules([{}, null, "x", { label: "vacía" }])).toEqual([]);
    expect(normalizeRules("no")).toEqual([]);
  });

  it("ordena un rango invertido y limpia el texto", () => {
    const [r] = normalizeRules([{ minLen: 8, maxLen: 3, contains: " Tien$da! " }]);
    expect([r.minLen, r.maxLen, r.contains]).toEqual([3, 8, "tienda"]);
  });

  it("pone nombre automático y limita a 10 reglas", () => {
    expect(normalizeRules([{ minLen: 4, maxLen: 4, noDigit: true }])[0].label).toBe("4 letras, sin números");
    expect(normalizeRules(Array.from({ length: 15 }, () => ({ noDigit: true })))).toHaveLength(10);
  });

  it("describeRule", () => {
    expect(describeRule({ ...four, label: "" })).toBe("4 letras, sin números, sin guion");
  });
});

describe("findHits y mensaje", () => {
  const rules = normalizeRules([{ label: "cortos", minLen: 3, maxLen: 4 }, { label: "tienda", contains: "tienda" }]);

  it("devuelve cada dominio una vez, los de más valor primero", () => {
    const hits = findHits(["tiendaverde.cl", "abc.cl", "otro-largo.cl", "abcd.cl"], rules);
    expect(hits.map((h) => h.name).sort()).toEqual(["abc.cl", "abcd.cl", "tiendaverde.cl"]);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
    expect(hits[2].rule).toBe("tienda");
  });

  it("sin reglas activas no hay avisos", () => {
    expect(findHits(["abc.cl"], [])).toEqual([]);
  });

  it("un solo dominio nombra la regla; varios se resumen", () => {
    expect(patternMessage([{ name: "abc.cl", rule: "cortos", score: 70 }]).body).toContain("cortos");
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `a${i}.cl`, rule: "x", score: 50 }));
    const m = patternMessage(many);
    expect(m.title).toContain("8 dominios");
    expect(m.body).toContain("y 3 más");
  });
});
