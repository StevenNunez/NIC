import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWayback, msToTs, parseAvailable, snapshotUrl, tsToMs, yearsBetween } from "./wayback.ts";

const snap = (timestamp: string, status = "200") => ({ archived_snapshots: { closest: { status, available: true, url: "x", timestamp } } });

afterEach(() => vi.unstubAllGlobals());

describe("marcas de tiempo de archive.org", () => {
  it("convierte ida y vuelta", () => {
    const ms = tsToMs("20020529225306");
    expect(new Date(ms).toISOString()).toBe("2002-05-29T22:53:06.000Z");
    expect(msToTs(ms)).toBe("20020529225306");
  });

  it("rechaza lo que no es una marca de tiempo", () => {
    expect(tsToMs("2002")).toBeNaN();
  });

  it("arma el enlace a la captura", () => {
    expect(snapshotUrl("pituto.cl", tsToMs("20020529225306"))).toBe("https://web.archive.org/web/20020529225306/pituto.cl");
  });

  it("cuenta los años de historia, ambos extremos incluidos", () => {
    expect(yearsBetween(tsToMs("20020529225306"), tsToMs("20260509160818"))).toBe(25);
    expect(yearsBetween(tsToMs("20100101000000"), tsToMs("20100301000000"))).toBe(1);
  });
});

describe("respuesta de la API de archive.org", () => {
  it("lee la captura más cercana", () => {
    expect(parseAvailable(snap("20020529225306"))).toBe("20020529225306");
  });

  it("sin capturas devuelve null", () => {
    expect(parseAvailable({ url: "x.cl", archived_snapshots: {}, timestamp: "19960101" })).toBeNull();
  });

  it("ignora capturas que no son una respuesta correcta", () => {
    expect(parseAvailable(snap("20020529225306", "404"))).toBeNull();
    expect(parseAvailable(snap("20020529225306", "301"))).toBeNull();
  });

  it("no se rompe con cualquier cosa", () => {
    for (const v of [null, undefined, 5, "texto", [], { archived_snapshots: null }, { archived_snapshots: { closest: { available: true, timestamp: 123 } } }]) {
      expect(parseAvailable(v)).toBeNull();
    }
  });
});

describe("historia de un dominio", () => {
  const respond = (body: string, status = 200) => vi.fn(async () => new Response(body, { status }));

  it("junta primera y última captura", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes("timestamp=19960101") ? snap("20020529225306") : snap("20260509160818"))),
    );
    vi.stubGlobal("fetch", fetchMock);
    const info = await fetchWayback("pituto.cl");
    expect(info).toMatchObject({ ok: true, years: 25 });
    expect(new Date(info.firstAt!).getUTCFullYear()).toBe(2002);
    expect(new Date(info.lastAt!).getUTCFullYear()).toBe(2026);
  });

  it("un dominio sin capturas es un resultado válido: 0 años", async () => {
    vi.stubGlobal("fetch", respond(JSON.stringify({ archived_snapshots: {} })));
    expect(await fetchWayback("nunca.cl")).toEqual({ ok: true, firstAt: null, lastAt: null, years: 0 });
  });

  it("si archive.org está caído y responde HTML, no inventa un 0: avisa que no sabe", async () => {
    vi.stubGlobal("fetch", respond("<html><title>Internet Archive: Temporarily Offline</title></html>"));
    const info = await fetchWayback("pituto.cl");
    expect(info.ok).toBe(false);
  });

  it("un error HTTP tampoco cuenta como 'sin historia'", async () => {
    vi.stubGlobal("fetch", respond("", 503));
    expect((await fetchWayback("pituto.cl")).ok).toBe(false);
  });
});
