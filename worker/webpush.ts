// Web Push (RFC 8030) con cifrado aes128gcm (RFC 8291) y VAPID (RFC 8292), solo con
// WebCrypto. La librería `web-push` de Node no corre en Workers.

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string; // clave pública del navegador, base64url (65 bytes)
  auth: string; // secreto de autenticación, base64url (16 bytes)
}

export interface VapidKeys {
  publicKey: string; // base64url, 65 bytes sin comprimir
  privateKey: string; // base64url, 32 bytes
  subject: string; // mailto: o https:
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface SendResult {
  status: number;
  /** 404/410: el dispositivo ya no existe; hay que borrar la suscripción. */
  gone: boolean;
}

const enc = new TextEncoder();

export function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8);
  return new Uint8Array(bits);
}

/** Cifra el mensaje para un navegador concreto (RFC 8291, un solo registro). */
export async function encryptPayload(sub: PushSubscriptionRecord, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64uDecode(sub.p256dh);
  const authSecret = b64uDecode(sub.auth);

  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  if (!("publicKey" in eph)) throw new Error("generateKey no devolvió un par de llaves");
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", eph.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // El estándar llama `public` a esta propiedad; los tipos de Workers la exponen como `$public`.
  // Se arma con spread para que compile con ambos y funcione igual en Workers y en Node (pruebas).
  const ecdhAlgo: SubtleCryptoDeriveKeyAlgorithm = { name: "ECDH", ...{ public: uaKey } };
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhAlgo, eph.privateKey, 256));

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 marca el último (y único) registro.
  const record = concat(plaintext, new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

async function vapidAuthHeader(endpoint: string, vapid: VapidKeys): Promise<string> {
  const pub = b64uDecode(vapid.publicKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
    d: vapid.privateKey,
    ext: true,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const header = b64uEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64uEncode(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: vapid.subject,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  // WebCrypto devuelve r||s (P1363), justo lo que exige ES256 en un JWT.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)));
  return `vapid t=${signingInput}.${b64uEncode(sig)}, k=${vapid.publicKey}`;
}

export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload,
  vapid: VapidKeys,
  opts: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high" } = {},
): Promise<SendResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthHeader(sub.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opts.ttl ?? 3600),
      Urgency: opts.urgency ?? "normal",
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  await res.body?.cancel();
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}
