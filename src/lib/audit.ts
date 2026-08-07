import type { Query } from "firebase-admin/firestore";
import type { AppUserSummary, UserActivityRow } from "./activity-export";
import { getDb } from "./firebase";
import { movementLabel } from "./labels";
import { productDisplayName } from "./product-label";
import type { InventoryMovement, User } from "./types";

export type { AppUserSummary, UserActivityRow } from "./activity-export";
export { buildActivityCsv } from "./activity-export";

/** Día calendario en hora RD (UTC-4). */
function dayStartIso(date: string): string {
  return `${date}T00:00:00.000-04:00`;
}

function dayEndIso(date: string): string {
  return `${date}T23:59:59.999-04:00`;
}

export async function listAppUsers(): Promise<AppUserSummary[]> {
  const snap = await getDb().collection("users").get();
  const users = snap.docs.map((d) => {
    const data = d.data() as User;
    return {
      id: d.id,
      name: data.name,
      email: data.email,
      role: data.role,
      active: data.active !== false,
    };
  });
  users.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return users;
}

export async function listUserActivity(opts: {
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<UserActivityRow[]> {
  const limit = opts.limit ?? 500;
  const fromIso = opts.from ? dayStartIso(opts.from) : null;
  const toIso = opts.to ? dayEndIso(opts.to) : null;

  let query: Query = getDb().collection("movements").orderBy("createdAt", "desc");

  if (fromIso) query = query.where("createdAt", ">=", fromIso);
  if (toIso) query = query.where("createdAt", "<=", toIso);

  // Extra margen si filtramos por usuario en memoria (sin índice compuesto).
  const fetchLimit = Math.min(opts.userId ? 2500 : Math.max(limit * 4, 400), 2500);
  const snap = await query.limit(fetchLimit).get();

  const usersCache = new Map<string, string>();
  const productsCache = new Map<string, { sku: string; name: string }>();
  const quotesCache = new Map<string, number>();

  const rows: UserActivityRow[] = [];

  for (const doc of snap.docs) {
    const m = { id: doc.id, ...doc.data() } as InventoryMovement;
    if (!m.userId) continue;
    if (opts.userId && m.userId !== opts.userId) continue;

    let userName = usersCache.get(m.userId);
    if (!userName) {
      const u = await getDb().collection("users").doc(m.userId).get();
      userName = u.exists ? String(u.data()?.name || "Usuario") : "Usuario";
      usersCache.set(m.userId, userName);
    }

    let product = productsCache.get(m.productId);
    if (!product) {
      const p = await getDb().collection("products").doc(m.productId).get();
      product = p.exists
        ? {
            sku: String(p.data()?.sku || "?"),
            name: String(p.data()?.name || "Producto"),
          }
        : { sku: "?", name: "Producto" };
      productsCache.set(m.productId, product);
    }

    let quoteNumber: number | null = null;
    if (m.quoteId) {
      const cached = quotesCache.get(m.quoteId);
      if (cached != null) {
        quoteNumber = cached;
      } else {
        const q = await getDb().collection("quotes").doc(m.quoteId).get();
        quoteNumber = q.exists ? Number(q.data()?.number || 0) : null;
        if (quoteNumber != null) quotesCache.set(m.quoteId, quoteNumber);
      }
    }

    rows.push({
      id: m.id,
      createdAt: m.createdAt,
      userId: m.userId,
      userName,
      type: m.type,
      actionLabel: movementLabel(m.type),
      productSku: product.sku,
      productName: productDisplayName(product.name),
      qty: m.qty,
      quoteId: m.quoteId ?? null,
      quoteNumber,
      note: m.note ?? null,
    });

    if (rows.length >= limit) break;
  }

  return rows;
}
