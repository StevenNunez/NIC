import { sendPush, type PushPayload, type PushSubscriptionRecord } from "./webpush.ts";

/** Envía la notificación a todos los dispositivos suscritos. Devuelve cuántos la recibieron. */
export async function notifyAll(
  env: Env,
  payload: PushPayload,
  urgency: "normal" | "high" = "normal",
): Promise<number> {
  const { results } = await env.DB.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions").all<PushSubscriptionRecord>();
  if (!results.length) return 0;

  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
  let delivered = 0;

  await Promise.all(
    results.map(async (sub) => {
      try {
        const r = await sendPush(sub, payload, vapid, { urgency, ttl: urgency === "high" ? 6 * 3600 : 3600 });
        if (r.status >= 200 && r.status < 300) delivered++;
        else if (r.gone) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?1").bind(sub.endpoint).run();
        else console.error(JSON.stringify({ evt: "push_failed", status: r.status, host: new URL(sub.endpoint).host }));
      } catch (err) {
        console.error(JSON.stringify({ evt: "push_error", host: new URL(sub.endpoint).host, error: String(err) }));
      }
    }),
  );
  return delivered;
}
