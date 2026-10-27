// Dibuja el ícono del radar (anillos + barrido + un punto) y lo guarda como PNG.
// Sin dependencias: rasteriza a mano y codifica el PNG con node:zlib.
//   node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SS = 3; // supermuestreo para suavizar bordes

function mix(a, b, t) {
  return a + (b - a) * t;
}

/** Color (RGBA 0-255) del ícono en el punto (x, y) con x e y entre -1 y 1. */
function sample(x, y) {
  const r = Math.hypot(x, y);
  // Fondo: azul noche con un brillo suave al centro.
  const glow = Math.max(0, 1 - r / 1.2);
  let c = [mix(8, 18, glow), mix(13, 30, glow), mix(28, 52, glow)];

  const over = (rgb, a) => {
    c = [mix(c[0], rgb[0], a), mix(c[1], rgb[1], a), mix(c[2], rgb[2], a)];
  };

  const green = [52, 211, 153];
  // Barrido del radar: cuña que se desvanece contra el sentido del giro.
  const ang = Math.atan2(y, x); // 0 = derecha, -PI/2 = arriba
  const lead = -Math.PI / 4; // borde delantero (arriba a la derecha)
  const behind = (((lead - ang) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (r < 0.69 && behind < Math.PI / 2.2) over(green, 0.5 * (1 - behind / (Math.PI / 2.2)));

  // Anillos.
  for (const [ring, a] of [[0.23, 0.9], [0.46, 0.6], [0.69, 0.4]]) {
    if (Math.abs(r - ring) < 0.014) over(green, a);
  }
  // Línea delantera del barrido.
  if (r < 0.69 && Math.abs(Math.sin(ang - lead)) * r < 0.012 && Math.cos(ang - lead) > 0) over([167, 243, 208], 0.95);
  // Centro y punto detectado (el dominio que aparece).
  if (r < 0.045) over([209, 250, 229], 1);
  if (Math.hypot(x - 0.3, y + 0.31) < 0.055) over([251, 191, 36], 1);
  if (Math.hypot(x - 0.3, y + 0.31) < 0.11) over([251, 191, 36], 0.18);

  return c;
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filtro "ninguno"
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb] = sample(((px + (sx + 0.5) / SS) / size) * 2 - 1, ((py + (sy + 0.5) / SS) / size) * 2 - 1);
          r += cr; g += cg; b += cb;
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const n = SS * SS;
      raw[o] = r / n; raw[o + 1] = g / n; raw[o + 2] = b / n; raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = fileURLToPath(new URL("../public/", import.meta.url));
mkdirSync(out, { recursive: true });
for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(out + file, png(size));
  console.log(`${file} (${size}x${size})`);
}
