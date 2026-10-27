export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface DomainRow {
  name: string;
  firstSeenAt: number;
  status: "new" | "favorite" | "dismissed";
  note: string | null;
  len: number;
  baseline: number;
  watched: number;
}

export interface WatchRow {
  name: string;
  createdAt: number;
  notifiedAt: number | null;
  seenAt: number | null;
  /** Lo que NIC dice del dominio (whois): estado, creación y vencimiento. */
  whoisState: "registered" | "available" | "unknown" | null;
  createdOn: number | null;
  expiresAt: number | null;
  whoisCheckedAt: number | null;
  whoisNote: string | null;
}

export interface PollInfo {
  ok: boolean;
  at: number;
  total?: number;
  added?: number;
  alerts?: number;
  ms: number;
  error?: string;
}

export interface Stats {
  total: number;
  last24h: number;
  tracked: number;
  byHour: number[];
  lastPoll: PollInfo | null;
  devices: number;
  watching: number;
  schedule: { daytime: boolean; dayStart: number; dayEnd: number; nightEveryMin: number };
}

export const UNAUTHORIZED_EVENT = "nic:unauthorized";

export async function api<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      message = ((await res.json()) as { error?: string }).error ?? message;
    } catch {
      /* respuesta sin cuerpo */
    }
    if (res.status === 401 && !path.endsWith("/login")) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}
