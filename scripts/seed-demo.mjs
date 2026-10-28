// Siembra datos de demostración en la base LOCAL (nunca en producción): diez días de
// liberaciones repartidas por hora, algunos favoritos y tres dominios vigilados con su
// historial (uno por vencer, uno vencido y uno ya liberado). Sirve para probar y para mostrar la app sin tocar datos reales.
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

// Historia en archive.org para parte de los dominios (el resto queda "sin revisar", como en producción al inicio).
const wbRows = [...names].flatMap((name) => {
  if (rnd() > 0.35) return [];
  const years = 1 + Math.floor(rnd() * 18);
  const first = 2003 + Math.floor(rnd() * 8);
  const last = Math.min(2025, first + years - 1);
  const f = Date.UTC(first, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27));
  const l = Date.UTC(last, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27));
  return [`UPDATE domains SET wb_checked_at = ${now}, wb_first = ${f}, wb_last = ${l}, wb_years = ${last - first + 1} WHERE name = '${name}';`];
});

const DAY = 86400_000;
const ev = (name, at, kind, detail) =>
  `INSERT INTO watch_events (name, at, kind, detail) VALUES ('${name}', ${at}, '${kind}', ${detail ? `'${JSON.stringify(detail)}'` : "NULL"});`;

// Tres casos creíbles de punta a punta: uno por vencer, uno ya vencido y uno ya liberado.
const w = (name, created, state, createdOn, expires, notified, checked) =>
  `INSERT OR REPLACE INTO watchlist (name, created_at, notified_at, whois_state, created_on, expires_at, whois_checked_at) VALUES ('${name}', ${created}, ${notified ?? "NULL"}, '${state}', ${createdOn ?? "NULL"}, ${expires ?? "NULL"}, ${checked});`;

const demoNames = ["veterinariasur.cl", "cafeteriapro.cl", "pituto-demo.cl"];
const vetExpires = now + 19 * DAY;
const cafeExpires = now - 3 * DAY;
const releasedAt = now - 3600_000;
const pitutoExpires = releasedAt - 31 * DAY;

const sql = [
  ...rows,
  ...wbRows,
  // Consultas hechas a mano en la sección "el dominio ya no existe".
  "DELETE FROM lookups WHERE name IN ('tiendaalpina.cl', 'panaderiasur.cl', 'nuncaexistio-demo.cl');",
  `INSERT INTO lookups (name, whois_state, expires_at, created_on, wb_first, wb_last, wb_years, checked_at, created_at) VALUES ('tiendaalpina.cl', 'available', NULL, NULL, ${Date.UTC(2009, 5, 3)}, ${Date.UTC(2021, 10, 18)}, 13, ${now - 600_000}, ${now - 600_000});`,
  `INSERT INTO lookups (name, whois_state, expires_at, created_on, wb_first, wb_last, wb_years, checked_at, created_at) VALUES ('panaderiasur.cl', 'registered', ${now + 47 * 86400_000}, ${Date.UTC(2012, 2, 9)}, ${Date.UTC(2012, 4, 20)}, ${Date.UTC(2026, 8, 2)}, 15, ${now - 3 * 3600_000}, ${now - 3 * 3600_000});`,
  `INSERT INTO lookups (name, whois_state, expires_at, created_on, wb_first, wb_last, wb_years, checked_at, created_at) VALUES ('nuncaexistio-demo.cl', 'available', NULL, NULL, NULL, NULL, 0, ${now - 86400_000}, ${now - 86400_000});`,
  `DELETE FROM watch_events WHERE name IN (${demoNames.map((n) => `'${n}'`).join(",")});`,
  `DELETE FROM watch_reminders WHERE name IN (${demoNames.map((n) => `'${n}'`).join(",")});`,

  // 1) Por vencer: faltan 19 días.
  w("veterinariasur.cl", now - 2 * DAY, "registered", Date.UTC(2008, 3, 14), vetExpires, null, now - 600_000),
  ev("veterinariasur.cl", now - 2 * DAY, "added"),
  ev("veterinariasur.cl", now - 2 * DAY + 2000, "whois_registered", { expiresAt: vetExpires }),

  // 2) Ya venció hace 3 días y sigue inscrito.
  w("cafeteriapro.cl", now - 40 * DAY, "registered", Date.UTC(2015, 8, 2), cafeExpires, null, now - 300_000),
  ev("cafeteriapro.cl", now - 40 * DAY, "added"),
  ev("cafeteriapro.cl", now - 40 * DAY + 2000, "whois_registered", { expiresAt: cafeExpires }),
  ev("cafeteriapro.cl", cafeExpires - 30 * DAY, "reminder", { level: "d30", delivered: 1 }),
  ev("cafeteriapro.cl", cafeExpires - 7 * DAY, "reminder", { level: "d7", delivered: 1 }),
  ev("cafeteriapro.cl", cafeExpires - 1 * DAY, "reminder", { level: "d1", delivered: 1 }),
  ev("cafeteriapro.cl", cafeExpires + 60_000, "expired", { expiresAt: cafeExpires }),
  ev("cafeteriapro.cl", cafeExpires + 60_000, "reminder", { level: "expired", delivered: 1 }),

  // 3) Ya se liberó (aviso enviado): 31 días después de vencer.
  w("pituto-demo.cl", now - 60 * DAY, "available", Date.UTC(2011, 0, 9), pitutoExpires, releasedAt, now - 3600_000),
  ev("pituto-demo.cl", now - 60 * DAY, "added"),
  ev("pituto-demo.cl", now - 60 * DAY + 2000, "whois_registered", { expiresAt: pitutoExpires }),
  ev("pituto-demo.cl", pitutoExpires + 60_000, "expired", { expiresAt: pitutoExpires }),
  ev("pituto-demo.cl", pitutoExpires + 5 * DAY, "unknown", { note: "estado de NIC distinto a inscrito" }),
  ev("pituto-demo.cl", releasedAt - 60_000, "available_whois"),
  ev("pituto-demo.cl", releasedAt, "in_list"),
  ev("pituto-demo.cl", releasedAt, "released", { via: "whois", expiresAt: pitutoExpires, lagDays: 31 }),
  ev("pituto-demo.cl", releasedAt + 1000, "alerted", { delivered: 1, via: "whois" }),
].join("\n");

const file = join(mkdtempSync(join(tmpdir(), "nic-demo-")), "seed.sql");
writeFileSync(file, sql);
// Se invoca el JS de wrangler con el mismo Node: sin shell, funciona igual en Windows y Linux.
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
execFileSync(process.execPath, [wrangler, "d1", "execute", "nic", "--local", `--file=${file}`], { stdio: "inherit" });
console.log(`Demo lista: ${names.size} dominios y 3 en vigilancia con historial (solo base local).`);
