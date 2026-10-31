// Puntaje de valor de un dominio .cl y detección de marcas famosas. Lógica pura, compartida por el Worker y la app:
// se calcula al vuelo con lo que ya se sabe del dominio, sin consultar nada.

export interface ValueFactor {
  label: string;
  points: number;
  max: number;
  /** Explicación corta de por qué sacó esos puntos. */
  note: string;
}

export interface BrandHit {
  brand: string;
  kind: "exact" | "contains";
}

export interface ValueScore {
  score: number;
  grade: "alto" | "bueno" | "medio" | "bajo";
  factors: ValueFactor[];
  /** Si el nombre coincide con una marca conocida, el puntaje queda acotado. */
  brand: BrandHit | null;
}

/** Con una marca conocida el dominio casi no se puede revender: el puntaje no pasa de aquí. */
export const BRAND_CAP = 30;

/** Palabras que un comprador reconoce al tiro (español e inglés de uso comercial). Sin tildes ni ñ. */
const WORDS = new Set(
  (
    "casa casas hogar tienda tiendas shop store market mercado compra compras venta ventas oferta ofertas remate remates subasta " +
    "viaje viajes turismo hotel hoteles hostal cabana cabanas vuelo vuelos tour tours playa sur norte centro " +
    "auto autos carro carros moto motos camion taller repuestos arriendo arriendos rent leasing flota " +
    "salud clinica dental dentista medico doctor farmacia kinesio psicologo terapia yoga fitness gym deporte deportes nutricion " +
    "comida comidas pizza pizzeria sushi cafe cafeteria pan panaderia vino vinos cerveza bar pub restaurant restaurante delivery " +
    "banco credito prestamo prestamos seguro seguros inversion inversiones finanzas pago pagos cuenta factura " +
    "abogado abogados legal notaria contador contadores asesoria consultora consultoria servicio servicios " +
    "inmobiliaria propiedades propiedad terreno terrenos parcela parcelas depto deptos oficina oficinas arriendo " +
    "digital online web app nube datos tech tecnologia soft software cloud internet red redes cyber " +
    "moda ropa zapatos zapatilla joyas joyeria belleza peluqueria spa estetica regalo regalos flores " +
    "educacion curso cursos clases colegio jardin academia escuela universidad idiomas ingles " +
    "mascota mascotas perro perros gato gatos veterinaria campo agro fundo semillas huerto " +
    "construccion constructora ferreteria maderas pinturas muebles cocina bano jardin piscina energia solar " +
    "empleo trabajo trabajos pega pegas chile chilena chileno santiago andes patagonia cordillera pacifico " +
    "club grupo global total mundo premium plus pro express rapido directo facil simple smart nuevo nueva " +
    "oro plata verde azul rojo blanco negro sol luna estrella cielo mar rio lago volcan " +
    "amigo amigos familia bebe ninos juegos juego musica cine arte foto fotos video radio tv noticias " +
    "seguridad alarma camaras limpieza lavanderia transporte mudanza mudanzas bodega bodegas logistica envio envios courier"
  )
    .split(/\s+/)
    .filter((w) => w.length >= 3),
);

/** Marcas de las que basta que el nombre las contenga (son distintivas). */
const BRANDS_CONTAINS = [
  "google", "facebook", "instagram", "whatsapp", "youtube", "amazon", "microsoft", "netflix", "spotify", "tiktok", "twitter",
  "paypal", "mercadolibre", "mercadopago", "uber", "nike", "adidas", "samsung", "cocacola", "pepsi", "mcdonald", "starbucks",
  "disney", "tesla", "toyota", "chevrolet", "hyundai", "nissan", "volkswagen", "mercedes", "iphone", "apple", "mastercard",
  "falabella", "cencosud", "ripley", "unimarc", "santander", "bancoestado", "bancochile", "scotiabank", "copec", "entel",
  "movistar", "latam", "codelco", "sodimac", "tottus", "pedidosya", "cornershop", "fonasa", "aguasandinas", "conchaytoro",
  "cruzverde", "salcobrand", "farmaciasahumada", "lapolar", "abcdin", "chilexpress", "starken", "sernac", "carabineros", "gobierno",
  "pagnol", "teolabs",
];

/** Marcas cortas o de palabra común: solo cuentan si el nombre es justo eso (si no, "parisino" o "claroscuro" saltarían). */
const BRANDS_EXACT = [
  "bci", "wom", "vtr", "sky", "lan", "kia", "bmw", "ikea", "sony", "visa", "ford", "zara", "puma", "lg", "hp", "ibm", "dell",
  "paris", "lider", "jumbo", "easy", "claro", "corona", "cristal", "escudo", "itau", "enel", "cmpc", "bata", "hites", "tricot",
  "rappi", "cabify", "fintual", "buda", "polla", "mazda", "audi", "fiat", "opel", "oppo", "xiaomi", "huawei",
];

/** Quita tildes y pasa la ñ a n, para comparar sin sorpresas. */
function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** El nombre sin el ".cl". */
export function baseName(domain: string): string {
  return domain.endsWith(".cl") ? domain.slice(0, -3) : domain;
}

export function detectBrand(domain: string): BrandHit | null {
  const flat = plain(baseName(domain)).replace(/-/g, "");
  for (const b of BRANDS_EXACT) if (flat === b) return { brand: b, kind: "exact" };
  for (const b of BRANDS_CONTAINS) {
    if (flat === b) return { brand: b, kind: "exact" };
    if (flat.includes(b)) return { brand: b, kind: "contains" };
  }
  return null;
}

function lengthPoints(n: number): number {
  if (n <= 3) return 30;
  if (n <= 9) return [28, 25, 22, 19, 16, 13][n - 4];
  if (n === 10) return 10;
  if (n <= 12) return 7;
  if (n <= 15) return 4;
  return 1;
}

function historyPoints(years: number | null): { points: number; note: string } {
  if (years === null) return { points: 0, note: "aún sin revisar en archive.org" };
  if (years <= 0) return { points: 0, note: "sin capturas en archive.org" };
  const points = years >= 20 ? 15 : years >= 15 ? 13 : years >= 10 ? 11 : years >= 5 ? 7 : years >= 2 ? 4 : 2;
  return { points, note: `${years} ${years === 1 ? "año" : "años"} de sitio` };
}

/** ¿Se puede armar el texto entero con palabras del diccionario? Devuelve cuántas. */
function segment(text: string): number | null {
  const best: (number | null)[] = Array(text.length + 1).fill(null);
  best[0] = 0;
  for (let i = 1; i <= text.length; i++) {
    for (let j = Math.max(0, i - 12); j <= i - 3; j++) {
      const prev = best[j];
      if (prev !== null && WORDS.has(text.slice(j, i)) && (best[i] === null || prev + 1 < best[i]!)) best[i] = prev + 1;
    }
  }
  return best[text.length];
}

function wordPoints(letters: string): { points: number; note: string } {
  if (WORDS.has(letters)) return { points: 20, note: "es una palabra que se entiende sola" };
  const parts = letters.length >= 6 ? segment(letters) : null;
  if (parts !== null && parts >= 2) return { points: 14, note: `se arma con ${parts} palabras reconocibles` };
  for (const w of WORDS) if (w.length >= 4 && letters.length > w.length && (letters.startsWith(w) || letters.endsWith(w))) return { points: 8, note: `incluye «${w}»` };
  return { points: 0, note: "no calza con palabras conocidas" };
}

function pronouncePoints(letters: string): { points: number; note: string } {
  if (letters.length < 3) return { points: 12, note: "tan corto que da lo mismo" };
  const vowels = (letters.match(/[aeiou]/g) ?? []).length;
  if (vowels === 0) return letters.length <= 4 ? { points: 8, note: "sigla sin vocales" } : { points: 0, note: "sin vocales: impronunciable" };
  let points = 20;
  const notes: string[] = [];
  const ratio = vowels / letters.length;
  if (ratio < 0.25 || ratio > 0.7) (points -= 7), notes.push(ratio < 0.25 ? "muchas consonantes" : "muchas vocales");
  const longest = Math.max(...(letters.match(/[^aeiou]+/g) ?? [""]).map((r) => r.length));
  if (longest > 3) (points -= 7), notes.push(`${longest} consonantes seguidas`);
  if (/(.)\1\1/.test(letters)) (points -= 4), notes.push("letra triplicada");
  return { points: Math.max(0, points), note: notes.join(", ") || "se pronuncia fácil" };
}

/**
 * Puntaje de 0 a 100 de qué tan fácil sería revender el dominio: largo, limpieza (sin números ni guiones),
 * pronunciación, si es una palabra reconocible e historia en archive.org. Una marca famosa lo deja por los suelos.
 */
export function scoreDomain(domain: string, wbYears: number | null = null): ValueScore {
  const base = baseName(domain.toLowerCase());
  const letters = plain(base).replace(/[^a-z]/g, "");
  const hasDigit = /\d/.test(base);
  const hasHyphen = base.includes("-");

  const len = lengthPoints(base.length);
  const clean = (hasDigit ? 0 : 8) + (hasHyphen ? 0 : 7);
  const say = pronouncePoints(letters);
  const word = wordPoints(letters);
  const hist = historyPoints(wbYears);

  const factors: ValueFactor[] = [
    { label: "largo", points: len, max: 30, note: `${base.length} ${base.length === 1 ? "letra" : "letras"}` },
    {
      label: "limpieza",
      points: clean,
      max: 15,
      note: hasDigit && hasHyphen ? "tiene números y guion" : hasDigit ? "tiene números" : hasHyphen ? "tiene guion" : "solo letras",
    },
    { label: "pronunciación", points: say.points, max: 20, note: say.note },
    { label: "palabra", points: word.points, max: 20, note: word.note },
    { label: "historia", points: hist.points, max: 15, note: hist.note },
  ];

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const brand = detectBrand(domain);
  const score = brand ? Math.min(raw, BRAND_CAP) : raw;
  const grade = score >= 75 ? "alto" : score >= 55 ? "bueno" : score >= 35 ? "medio" : "bajo";
  return { score, grade, factors, brand };
}

// ---------- revisión de marcas ----------

export type TrademarkStatus = "clear" | "risk" | "unsure";

export const TRADEMARK_LABEL: Record<TrademarkStatus, string> = {
  clear: "sin conflicto",
  risk: "hay marca",
  unsure: "dudoso",
};

/** Buscadores oficiales para revisar a mano. El de INAPI exige reCAPTCHA y no admite búsqueda por enlace: se copia el nombre y se pega. */
export function trademarkLinks(domain: string): { label: string; url: string; note?: string }[] {
  const q = encodeURIComponent(baseName(domain));
  return [
    { label: "INAPI (Chile)", url: "https://buscadormarcas.inapi.cl/Marca/BuscarMarca.aspx", note: "pega el nombre en «Signo» y elige «contiene»" },
    { label: "TMview (varios países)", url: `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=${q}&territories=CL,WO,EM,US` },
    { label: "WIPO Global Brand", url: "https://branddb.wipo.int/", note: "busca por nombre de marca" },
    { label: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(`"${baseName(domain)}" marca`)}` },
  ];
}
