import { normalizeDomain } from "../shared/domain.ts";

const STATUSES = ["clear", "risk", "unsure"];

interface Check {
  name: string;
  status: string;
  note: string | null;
  checkedAt: number;
}

/** Todas las revisiones guardadas: son pocas (solo lo que el usuario revisó a mano). */
export async function listTrademarks(env: Env): Promise<Check[]> {
  const { results } = await env.DB.prepare("SELECT name, status, note, checked_at AS checkedAt FROM trademark_checks ORDER BY checked_at DESC LIMIT 1000").all<Check>();
  return results;
}

/** Guarda (o reemplaza) la revisión de un dominio. Devuelve null si los datos no sirven. */
export async function saveTrademark(env: Env, data: { name?: string; status?: string; note?: string } | null): Promise<Check | null> {
  const name = normalizeDomain(data?.name ?? "");
  if (!name || !data?.status || !STATUSES.includes(data.status)) return null;
  const check: Check = { name, status: data.status, note: data.note?.trim().slice(0, 500) || null, checkedAt: Date.now() };
  await env.DB.prepare(
    `INSERT INTO trademark_checks (name, status, note, checked_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(name) DO UPDATE SET status = ?2, note = ?3, checked_at = ?4`,
  )
    .bind(check.name, check.status, check.note, check.checkedAt)
    .run();
  return check;
}

export async function removeTrademark(env: Env, name: string | null): Promise<boolean> {
  const n = normalizeDomain(name ?? "");
  if (!n) return false;
  await env.DB.prepare("DELETE FROM trademark_checks WHERE name = ?1").bind(n).run();
  return true;
}
