import { api } from "./api";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

interface IOSNavigator extends Navigator {
  standalone?: boolean;
}

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as IOSNavigator).standalone === true;

function keyToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function getPushState(): Promise<PushState> {
  // En iPhone, push solo existe con la app instalada en la pantalla de inicio.
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Debe llamarse desde un toque del usuario: iOS no deja pedir el permiso de otra forma. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("No diste permiso para las notificaciones.");

  const [{ publicKey }, reg] = await Promise.all([
    api<{ publicKey: string }>("/api/push/key"),
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready),
  ]);

  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  const json = sub.toJSON();
  try {
    await api("/api/push/subscribe", { method: "POST", json: { endpoint: json.endpoint, keys: json.keys } });
  } catch (err) {
    // Si el servidor no la guardó, no la dejamos "a medias" en el teléfono.
    await sub.unsubscribe();
    throw err;
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("/api/push/subscribe", { method: "DELETE", json: { endpoint: sub.endpoint } });
  await sub.unsubscribe();
}
