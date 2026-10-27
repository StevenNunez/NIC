// Lectura de la lista pública de NIC Chile: "Dominios eliminados disponibles para inscripción".
// La lista diaria viene cortada en 200; la semanal (~2.000) no, así que se lee siempre la semanal.

const WEEKLY_URL = "https://www.nic.cl/registry/Eliminados.do?t=1s&f=txt";
const LINE_RE = /^(?:[a-z0-9-]+\.)*[a-z0-9-]+\.cl$/;
/** Si NIC cambia el formato o responde una página de error, mejor fallar que guardar basura. */
const MIN_EXPECTED = 50;

export interface NicList {
  domains: string[];
}

export async function fetchWeeklyList(): Promise<NicList> {
  const res = await fetch(WEEKLY_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NIC-radar/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`NIC respondió HTTP ${res.status}`);
  return parseList(await res.text());
}

export function parseList(text: string): NicList {
  const domains = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (LINE_RE.test(line)) domains.add(line);
  }
  if (domains.size < MIN_EXPECTED) {
    throw new Error(`La lista de NIC trajo solo ${domains.size} dominios; se descarta`);
  }
  return { domains: [...domains] };
}
