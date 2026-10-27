// Crea .dev.vars (solo local, ignorado por git) con una contraseña aleatoria, el
// secreto de sesión y un par de llaves VAPID para las notificaciones push.
// Es idempotente: si .dev.vars ya existe no lo toca.
//
//   node scripts/init-env.mjs          -> escribe .dev.vars
//   node scripts/init-env.mjs --print  -> solo imprime los valores (para `wrangler secret put`)
import { webcrypto as crypto } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const randomToken = (bytes) => b64u(crypto.getRandomValues(new Uint8Array(bytes)));

async function vapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKey = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]));
  return { publicKey, privateKey: jwk.d };
}

const target = fileURLToPath(new URL("../.dev.vars", import.meta.url));
const printOnly = process.argv.includes("--print");

if (!printOnly && existsSync(target)) {
  console.log(".dev.vars ya existe: no se modifica.");
  process.exit(0);
}

const vapid = await vapidKeys();
const password = randomToken(9); // 12 caracteres
const values = {
  APP_PASSWORD: password,
  SESSION_SECRET: randomToken(32),
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
};

if (printOnly) {
  for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`);
} else {
  writeFileSync(target, Object.entries(values).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  console.log(".dev.vars creado.");
  console.log(`Contraseña de acceso local: ${password}`);
}
