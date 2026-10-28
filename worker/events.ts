// Historial de cada dominio vigilado (tabla watch_events).

export type EventKind =
  | "added"
  | "rearmed"
  | "whois_registered"
  | "renewed"
  | "expired"
  | "unknown"
  | "available_whois"
  | "in_list"
  | "released"
  | "alerted"
  | "reminder";

export interface EventSpec {
  kind: EventKind;
  detail?: Record<string, unknown>;
  /** Un solo evento de este tipo por ciclo de vigilancia (se reinicia al agregar, volver a vigilar o renovarse). */
  once?: boolean;
}

export interface EventRow {
  at: number;
  kind: EventKind;
  detail: Record<string, unknown> | null;
}

export async function recordEvent(env: Env, name: string, spec: EventSpec, at = Date.now()): Promise<void> {
  const detail = spec.detail ? JSON.stringify(spec.detail) : null;
  if (!spec.once) {
    await env.DB.prepare("INSERT INTO watch_events (name, at, kind, detail) VALUES (?1, ?2, ?3, ?4)").bind(name, at, spec.kind, detail).run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO watch_events (name, at, kind, detail)
     SELECT ?1, ?2, ?3, ?4
     WHERE NOT EXISTS (
       SELECT 1 FROM watch_events
       WHERE name = ?1 AND kind = ?3
         AND at >= COALESCE((SELECT MAX(at) FROM watch_events WHERE name = ?1 AND kind IN ('added', 'rearmed', 'renewed')), 0)
     )`,
  )
    .bind(name, at, spec.kind, detail)
    .run();
}

export async function listEvents(env: Env, name: string, limit = 100): Promise<EventRow[]> {
  const { results } = await env.DB.prepare("SELECT at, kind, detail FROM watch_events WHERE name = ?1 ORDER BY at DESC, id DESC LIMIT ?2")
    .bind(name, limit)
    .all<{ at: number; kind: EventKind; detail: string | null }>();
  return results.map((r) => ({ at: r.at, kind: r.kind, detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null }));
}
