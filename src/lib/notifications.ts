import { getDb, newId } from "./firebase";
import { sendPushToUsers } from "./push";
import { isOpsManager } from "./roles";
import type { AppNotification, NotificationType, User } from "./types";

function nowIso() {
  return new Date().toISOString();
}

async function listActiveUsers(): Promise<User[]> {
  const snap = await getDb().collection("users").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as User)
    .filter((u) => u.active);
}

export async function listOpsManagerIds(excludeUserId?: string): Promise<string[]> {
  const users = await listActiveUsers();
  return users
    .filter((u) => isOpsManager(u.role) && u.id !== excludeUserId)
    .map((u) => u.id);
}

export async function createNotifications(input: {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  quoteId: string;
  quoteNumber: number;
}): Promise<void> {
  const ids = [...new Set(input.userIds.filter(Boolean))];
  if (!ids.length) return;

  const db = getDb();
  const batch = db.batch();
  const createdAt = nowIso();

  for (const userId of ids) {
    const id = newId();
    const doc: AppNotification = {
      id,
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      quoteId: input.quoteId,
      quoteNumber: input.quoteNumber,
      read: false,
      createdAt,
    };
    batch.set(db.collection("notifications").doc(id), doc);
  }

  await batch.commit();

  // Aviso del sistema (suena con la app cerrada si el usuario activó push)
  void sendPushToUsers({
    userIds: ids,
    title: input.title,
    body: input.body,
    url: `/quotes/${input.quoteId}`,
    tag: `quote-${input.quoteId}-${input.type}`,
  }).catch(() => {});
}

/** Pedido nuevo → avisar a Administración / Admin (no al autor). */
export async function notifyOpsNewQuote(input: {
  actorId: string;
  actorName: string;
  quoteId: string;
  quoteNumber: number;
  customerName: string;
}): Promise<void> {
  const userIds = await listOpsManagerIds(input.actorId);
  await createNotifications({
    userIds,
    type: "QUOTE_CREATED",
    title: "Nuevo pedido",
    body: `${input.actorName} reservó el pedido #${input.quoteNumber} · ${input.customerName}`,
    quoteId: input.quoteId,
    quoteNumber: input.quoteNumber,
  });
}

/** Facturado por administración → avisar al vendedor del pedido. */
export async function notifySellerQuoteConfirmed(input: {
  actorId: string;
  actorName: string;
  sellerId: string;
  quoteId: string;
  quoteNumber: number;
  customerName: string;
}): Promise<void> {
  if (!input.sellerId || input.sellerId === input.actorId) return;
  await createNotifications({
    userIds: [input.sellerId],
    type: "QUOTE_CONFIRMED",
    title: "Pedido facturado",
    body: `${input.actorName} facturó el pedido #${input.quoteNumber} · ${input.customerName}`,
    quoteId: input.quoteId,
    quoteNumber: input.quoteNumber,
  });
}

export async function listNotificationsForUser(
  userId: string,
  limit = 40
): Promise<AppNotification[]> {
  const snap = await getDb()
    .collection("notifications")
    .where("userId", "==", userId)
    .limit(80)
    .get();

  const items = snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as AppNotification
  );
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, limit);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const snap = await getDb()
    .collection("notifications")
    .where("userId", "==", userId)
    .where("read", "==", false)
    .limit(50)
    .get();
  return snap.size;
}

export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<void> {
  const ref = getDb().collection("notifications").doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as AppNotification;
  if (data.userId !== userId) throw new Error("Sin permiso");
  if (data.read) return;
  await ref.update({ read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const snap = await getDb()
    .collection("notifications")
    .where("userId", "==", userId)
    .where("read", "==", false)
    .limit(100)
    .get();

  if (snap.empty) return 0;
  const batch = getDb().batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { read: true });
  }
  await batch.commit();
  return snap.size;
}
