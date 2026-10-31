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
  /** Años de historia en archive.org: null = sin revisar, 0 = sin capturas. */
  wbYears: number | null;
  wbFirst: number | null;
  wbLast: number | null;
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
  /** Años de historia en archive.org, si el dominio está en la lista de NIC y ya se revisó. */
  wbYears?: number | null;
}

export interface LookupRow {
  name: string;
  whoisState: "registered" | "available" | "unknown" | null;
  expiresAt: number | null;
  createdOn: number | null;
  note: string | null;
  wbFirst: number | null;
  wbLast: number | null;
  /** null: archive.org no respondió, no se sabe. */
  wbYears: number | null;
  checkedAt: number;
  watched?: number;
  problems?: string[];
}

export interface EventRow {
  at: number;
  kind: string;
  detail: Record<string, unknown> | null;
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
  archive: { checked: number; withHistory: number; alerts24h: number };
  byHour: number[];
  lastPoll: PollInfo | null;
  devices: number;
  releaseLag: { n: number; minDays: number | null; maxDays: number | null; avgDays: number | null } | null;
  watching: number;
  schedule: { daytime: boolean; dayStart: number; dayEnd: number; nightEveryMin: number };
}

export interface PatternRule {
  id: string;
  label: string;
  enabled: boolean;
  minLen: number;
  maxLen: number;
  noDigit: boolean;
  noHyphen: boolean;
  startsWith: string;
  endsWith: string;
  contains: string;
}

export interface Settings {
  historyAlert: { enabled: boolean; minYears: number; maxPer24h: number };
  patterns: PatternRule[];
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
