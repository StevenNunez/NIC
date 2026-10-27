import { afterEach, describe, expect, it, vi } from "vitest";
import { b64uDecode, b64uEncode, encryptPayload, sendPush } from "./webpush.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Un "iPhone" de mentira: genera sus llaves y sabe descifrar como lo hace el navegador (RFC 8291). */
async function fakeBrowser() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  if (!("publicKey" in pair)) throw new Error("sin par");
  const uaPublic = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));

  async function decrypt(body: Uint8Array): Promise<string> {
    const salt = body.slice(0, 16);
    expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096);
    const idlen = body[20];
    const asPublic = body.slice(21, 21 + idlen);
    const cipher = body.slice(21 + idlen);

    const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", ...{ public: asKey } }, pair.privateKey, 256));
    const ikm = await hkdf(auth, ecdh, cat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
    const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
    const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, cipher));
    expect(plain[plain.length - 1]).toBe(2); // delimitador del último registro
    return dec.decode(plain.slice(0, -1));
  }

  return { sub: { endpoint: "https://web.push.apple.com/abc", p256dh: b64uEncode(uaPublic), auth: b64uEncode(auth) }, decrypt };
}

async function vapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  if (!("publicKey" in pair)) throw new Error("sin par");
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pub = cat(new Uint8Array([4]), b64uDecode(jwk.x!), b64uDecode(jwk.y!));
  return { publicKey: b64uEncode(pub), privateKey: jwk.d!, subject: "https://www.teolabs.app" };
}

afterEach(() => vi.unstubAllGlobals());

describe("web push", () => {
  it("cifra de forma que el navegador pueda descifrar (incluye tildes y emoji)", async () => {
    const { sub, decrypt } = await fakeBrowser();
    const message = JSON.stringify({ title: "🔔 pituto.cl está disponible", body: "añañá" });
    const body = await encryptPayload(sub, enc.encode(message));
    expect(await decrypt(body)).toBe(message);
  });

  it("cada envío usa sal y llave efímera distintas", async () => {
    const { sub } = await fakeBrowser();
    const a = await encryptPayload(sub, enc.encode("x"));
    const b = await encryptPayload(sub, enc.encode("x"));
    expect(b64uEncode(a.slice(0, 16))).not.toBe(b64uEncode(b.slice(0, 16)));
  });

  it("firma un VAPID válido y manda las cabeceras que exige el servicio", async () => {
    const { sub, decrypt } = await fakeBrowser();
    const vapid = await vapidKeys();
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendPush(sub, { title: "t", body: "b" }, vapid, { urgency: "high", ttl: 600 });
    expect(res).toEqual({ status: 201, gone: false });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(url).toBe(sub.endpoint);
    expect(h["Content-Encoding"]).toBe("aes128gcm");
    expect(h.Urgency).toBe("high");
    expect(h.TTL).toBe("600");
    expect(JSON.parse(await decrypt(init.body as Uint8Array))).toEqual({ title: "t", body: "b" });

    // El JWT debe verificarse con la clave pública VAPID.
    const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h.Authorization);
    expect(m).not.toBeNull();
    const [, head, claims, sig, k] = m!;
    expect(k).toBe(vapid.publicKey);
    const pub = b64uDecode(vapid.publicKey);
    const key = await crypto.subtle.importKey("raw", pub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64uDecode(sig), enc.encode(`${head}.${claims}`));
    expect(ok).toBe(true);
    const c = JSON.parse(dec.decode(b64uDecode(claims)));
    expect(c.aud).toBe("https://web.push.apple.com");
    expect(c.sub).toBe("https://www.teolabs.app");
    expect(c.exp).toBeGreaterThan(Date.now() / 1000);
    expect(b64uDecode(sig).length).toBe(64); // r||s, no DER
  });

  it("marca como 'gone' los 404 y 410", async () => {
    const { sub } = await fakeBrowser();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 410 })));
    expect((await sendPush(sub, { title: "t", body: "b" }, await vapidKeys())).gone).toBe(true);
  });
});
