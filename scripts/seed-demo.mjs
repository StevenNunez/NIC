// Siembra datos de demostración en la base LOCAL (nunca en producción): diez días de
// liberaciones repartidas por hora, algunos favoritos y una vigilancia con un caso
// ya avisado. Sirve para probar y para mostrar la app sin tocar datos reales.
// Es idempotente: se puede correr de nuevo sin duplicar.
//
//   npm run db:migrate:local && npm run seed:demo
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WORDS = [
  "panaderia", "ferreteria", "veterinaria", "kinesiologia", "pasteleria", "mudanzas", "arriendos", "climatizacion",
  "contadores", "electricista", "gasfiter", "jardineria", "lavanderia", "optica", "turismo", "inmobiliaria",
  "fletes", "abogados", "dentista", "librosusados", "bicicletas", "mascotas", "cafeteria", "repuestos", "cerrajero",
];
const SUFFIX = ["", "sur", "norte", "centro", "online", "chile", "express", "pro"];
const BUSY_HOURS = [9, 9, 10, 10, 10, 11, 14, 15, 15, 16, 17, 6, 8, 12, 19, 22, 2]; // sesgo realista, no uniforme

// Pseudoaleatorio con semilla fija: la demo sale igual cada vez.
let seed = 20261027;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const now = Date.now();
const names = new Set(["pituto-demo.cl"]);
while (names.size < 120) names.add(`${pick(WORDS)}${pick(SUFFIX)}${rnd() < 0.15 ? Math.floor(rnd() * 99) : ""}.cl`);

const rows = [...names].map((name, i) => {
  const daysAgo = Math.floor(rnd() * 10);
  const hour = pick(BUSY_HOURS);
  const at = now - daysAgo * 86400_000 - ((new Date(now).getUTCHours() - ((hour + 3) % 24) + 24) % 24) * 3600_000;
  const status = i % 17 === 0 ? "favorite" : i % 23 === 0 ? "dismissed" : "new";
  return `INSERT OR IGNORE INTO domains (name, first_seen_at, first_seen_hour, baseline, status) VALUES ('${name}', ${at}, ${hour}, 0, '${status}');`;
});

const sql = [
  ...rows,
  `INSERT OR IGNORE INTO watchlist (name, created_at, notified_at) VALUES ('pituto-demo.cl', ${now - 3 * 86400_000}, ${now - 3600_000});`,
  `INSERT OR IGNORE INTO watchlist (name, created_at) VALUES ('veterinariasur.cl', ${now - 86400_000});`,
].join("\n");

const file = join(mkdtempSync(join(tmpdir(), "nic-demo-")), "seed.sql");
writeFileSync(file, sql);
// Se invoca el JS de wrangler con el mismo Node: sin shell, funciona igual en Windows y Linux.
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
execFileSync(process.execPath, [wrangler, "d1", "execute", "nic", "--local", `--file=${file}`], { stdio: "inherit" });
console.log(`Demo lista: ${names.size} dominios, 2 en vigilancia (solo base local).`);
