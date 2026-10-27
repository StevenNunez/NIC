// Acceso de una sola persona: una contraseña y una cookie firmada (HMAC).

const enc = new TextEncoder();
const COOKIE = "nic_session";
const SESSION_DAYS = 30;
const MAX_ATTEMPTS_PER_HOUR = 10;

function b64u(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Compara en tiempo constante: se comparan los hashes, así el largo tampoco se filtra. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function makeSessionCookie(env: Env): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const sig = await hmac(env.SESSION_SECRET, `v1.${exp}`);
  return `${COOKIE}=v1.${exp}.${sig}; Max-Age=${SESSION_DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const raw = request.headers.get("Cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [v, exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (v !== "v1" || !exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, `v1.${exp}`));
}

export async function checkPassword(env: Env, given: string): Promise<boolean> {
  return safeEqual(given, env.APP_PASSWORD);
}

/** Cuenta el intento; devuelve false si esa IP ya agotó los de esta hora. */
export async function allowLoginAttempt(env: Env, ip: string): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 3600_000);
  const row = await env.DB.prepare(
    `INSERT INTO login_attempts (ip, window, n) VALUES (?1, ?2, 1)
     ON CONFLICT(ip, window) DO UPDATE SET n = n + 1 RETURNING n`,
  )
    .bind(ip, windowStart)
    .first<{ n: number }>();
  await env.DB.prepare("DELETE FROM login_attempts WHERE window < ?1").bind(windowStart - 24).run();
  return (row?.n ?? 1) <= MAX_ATTEMPTS_PER_HOUR;
}
