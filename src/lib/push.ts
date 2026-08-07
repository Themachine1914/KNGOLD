import webpush from "web-push";
import { createHash } from "crypto";
import { getDb } from "./firebase";

export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export type StoredPushSubscription = {
  id: string;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
  updatedAt: string;
};

function vapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

function ensureWebPush() {
  if (!vapidConfigured()) {
    throw new Error("Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT");
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

export function subscriptionDocId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 40);
}

export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionJSON,
  userAgent?: string | null
): Promise<void> {
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error("Suscripción push inválida");
  }
  const id = subscriptionDocId(subscription.endpoint);
  const doc: StoredPushSubscription = {
    id,
    userId,
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    userAgent: userAgent || null,
    updatedAt: new Date().toISOString(),
  };
  await getDb().collection("push_subscriptions").doc(id).set(doc);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const id = subscriptionDocId(endpoint);
  await getDb().collection("push_subscriptions").doc(id).delete();
}

export async function sendPushToUsers(input: {
  userIds: string[];
  title: string;
  body: string;
  url: string;
  tag?: string;
}): Promise<void> {
  if (!vapidConfigured()) return;

  const ids = [...new Set(input.userIds.filter(Boolean))];
  if (!ids.length) return;

  ensureWebPush();
  const db = getDb();
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url,
    tag: input.tag || "kngold-alert",
  });

  for (const userId of ids) {
    const snap = await db
      .collection("push_subscriptions")
      .where("userId", "==", userId)
      .get();

    await Promise.all(
      snap.docs.map(async (doc) => {
        const sub = doc.data() as StoredPushSubscription;
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys,
            },
            payload,
            { urgency: "high", TTL: 60 * 60 * 24 }
          );
        } catch (e: unknown) {
          const status =
            e && typeof e === "object" && "statusCode" in e
              ? Number((e as { statusCode?: number }).statusCode)
              : 0;
          // Suscripción muerta o revocada
          if (status === 404 || status === 410) {
            await doc.ref.delete().catch(() => {});
          }
        }
      })
    );
  }
}
