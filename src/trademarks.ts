import { useSyncExternalStore } from "react";
import type { TrademarkStatus } from "../shared/value";
import { api } from "./api";

export interface TrademarkCheck {
  name: string;
  status: TrademarkStatus;
  note: string | null;
  checkedAt: number;
}

// Un solo mapa para toda la app: las revisiones son pocas y las usan tres pantallas.
let checks = new Map<string, TrademarkCheck>();
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load(): Promise<void> {
  loaded = true;
  try {
    checks = new Map((await api<{ rows: TrademarkCheck[] }>("/api/trademarks")).rows.map((r) => [r.name, r]));
    emit();
  } catch {
    loaded = false; // se reintenta en el próximo uso
  }
}

export async function saveCheck(name: string, status: TrademarkStatus, note: string): Promise<void> {
  const saved = await api<TrademarkCheck>("/api/trademarks", { method: "PUT", json: { name, status, note } });
  checks = new Map(checks).set(name, saved);
  emit();
}

export async function clearCheck(name: string): Promise<void> {
  await api("/api/trademarks", { method: "DELETE", json: { name } });
  const next = new Map(checks);
  next.delete(name);
  checks = next;
  emit();
}

export function useTrademark(name: string): TrademarkCheck | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      if (!loaded) void load();
      return () => listeners.delete(cb);
    },
    () => checks.get(name),
  );
}
