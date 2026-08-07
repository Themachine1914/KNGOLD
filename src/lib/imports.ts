import { getDb, newId } from "./firebase";
import {
  convertTransitApartadosOnArrival,
  getInTransitQty,
  getReservedQty,
  getTransitApartadoQty,
} from "./inventory";
import type { ImportOrder, ImportOrderLine, ImportStatus, Product, User } from "./types";

async function nextImportNumber(): Promise<number> {
  const ref = getDb().collection("counters").doc("imports");
  return getDb().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const current = doc.exists ? Number(doc.data()?.seq || 0) : 0;
    const next = current + 1;
    tx.set(ref, { seq: next }, { merge: true });
    return next;
  });
}

function assertProduct(raw: Record<string, unknown>, id: string): Product {
  const p = { id, ...raw } as Product;
  for (const field of ["stockOnHand", "netPrice", "listPrice"] as const) {
    if (!Number.isFinite(Number(p[field]))) {
      throw new Error(
        `El producto ${p.sku ?? id} tiene el campo ${field} inválido o vacío.`
      );
    }
  }
  return p;
}

async function getProduct(id: string): Promise<Product> {
  const doc = await getDb().collection("products").doc(id).get();
  if (!doc.exists) throw new Error("Producto no encontrado");
  return assertProduct(doc.data() as Record<string, unknown>, doc.id);
}

/**
 * Reclama un pedido: comprueba y cambia su estado en una sola operación
 * atómica. Devuelve el pedido si el reclamo fue nuestro, o `null` si otro
 * proceso llegó primero.
 */
async function claimImport(
  importId: string,
  canClaim: (order: ImportOrder) => boolean,
  changes: Record<string, unknown>
): Promise<ImportOrder | null> {
  const ref = getDb().collection("imports").doc(importId);
  return getDb().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("Pedido no encontrado");
    const order = { id: doc.id, ...doc.data() } as ImportOrder;
    if (!canClaim(order)) return null;
    tx.update(ref, { ...changes, updatedAt: new Date().toISOString() });
    return order;
  });
}

/** Estados desde los que un pedido todavía se puede mover. */
function isOpen(order: ImportOrder): boolean {
  return order.status === "ORDERED" || order.status === "IN_TRANSIT";
}

export async function createImportOrder(input: {
  createdById: string;
  supplier?: string;
  eta: Date;
  notes?: string;
  status?: ImportStatus;
  lines: { productId: string; qty: number }[];
}): Promise<ImportOrder> {
  if (!input.lines.length) throw new Error("El pedido debe tener al menos un producto.");

  const wanted = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new Error("Cantidad inválida: debe ser un número entero positivo.");
    }
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.qty);
  }

  const lines: ImportOrderLine[] = [...wanted].map(([productId, qty]) => ({
    id: newId(),
    productId,
    qty,
  }));

  const id = newId();
  const now = new Date().toISOString();
  const order: ImportOrder = {
    id,
    number: await nextImportNumber(),
    supplier: input.supplier?.trim() || null,
    status: input.status || "ORDERED",
    eta: input.eta.toISOString(),
    arrivedAt: null,
    notes: input.notes?.trim() || null,
    createdById: input.createdById,
    createdAt: now,
    updatedAt: now,
    lines,
  };
  await getDb().collection("imports").doc(id).set(order);
  return order;
}

export async function updateImportStatus(importId: string, status: ImportStatus) {
  if (status === "ARRIVED") {
    throw new Error("Usa receiveImportOrder para marcar llegada");
  }
  const claimed = await claimImport(importId, isOpen, { status });
  if (!claimed) {
    throw new Error("El pedido cambió de estado; recarga la página.");
  }
  return getImport(importId);
}

export async function receiveImportOrder(importId: string, userId: string) {
  const db = getDb();
  const iref = db.collection("imports").doc(importId);

  const preview = await iref.get();
  if (!preview.exists) throw new Error("Pedido no encontrado");
  const reservedByProduct = new Map<string, number>();
  for (const line of (preview.data()?.lines || []) as ImportOrderLine[]) {
    if (!reservedByProduct.has(line.productId)) {
      reservedByProduct.set(line.productId, await getReservedQty(line.productId));
    }
  }

  const orderNumber = Number(preview.data()?.number || 0);
  const arrivedLines = (preview.data()?.lines || []) as ImportOrderLine[];

  await db.runTransaction(async (tx) => {
    const idoc = await tx.get(iref);
    if (!idoc.exists) throw new Error("Pedido no encontrado");
    const order = { id: idoc.id, ...idoc.data() } as ImportOrder;

    if (order.status === "ARRIVED") throw new Error("Este pedido ya fue recibido.");
    if (order.status === "CANCELLED") {
      throw new Error("No se puede recibir un pedido cancelado.");
    }

    const lines = order.lines || [];
    if (!lines.length) throw new Error("El pedido no tiene líneas.");

    const prefs = lines.map((l) => db.collection("products").doc(l.productId));
    const pdocs = await tx.getAll(...prefs);

    const updates = pdocs.map((pdoc, i) => {
      if (!pdoc.exists) throw new Error("Producto no encontrado");
      const sku = pdoc.data()?.sku ?? pdoc.id;
      const stock = Number(pdoc.data()?.stockOnHand);
      if (!Number.isFinite(stock)) {
        throw new Error(`El producto ${sku} no tiene stock válido registrado.`);
      }
      return { ref: prefs[i], next: stock + lines[i].qty };
    });

    const now = new Date().toISOString();
    tx.update(iref, { status: "ARRIVED", arrivedAt: now, updatedAt: now });

    updates.forEach(({ ref, next }, i) => {
      tx.update(ref, { stockOnHand: next, updatedAt: now });
      const movId = newId();
      tx.set(db.collection("movements").doc(movId), {
        id: movId,
        productId: lines[i].productId,
        type: "ENTRADA",
        qty: lines[i].qty,
        stockAfter: next,
        availableAfter: next - (reservedByProduct.get(lines[i].productId) ?? 0),
        userId,
        note: `Importación #${order.number} llegada`,
        createdAt: now,
      });
    });
  });

  // Después del ingreso atómico: apartados en tránsito → reserva de almacén.
  for (const line of arrivedLines) {
    const converted = await convertTransitApartadosOnArrival(line.productId, line.qty);
    if (converted <= 0) continue;
    // El movimiento ENTRADA ya quedó escrito; no reescribimos histórico aquí.
    void orderNumber;
  }

  return getImport(importId);
}

export async function cancelImportOrder(importId: string) {
  const current = await getImport(importId);
  if (!current) throw new Error("Pedido no encontrado");

  if (isOpen(current)) {
    for (const line of current.lines || []) {
      const apartado = await getTransitApartadoQty(line.productId);
      if (apartado <= 0) continue;
      const incoming = await getInTransitQty(line.productId);
      const remainingAfterCancel = incoming - line.qty;
      if (apartado > remainingAfterCancel) {
        throw new Error(
          `No se puede cancelar: hay ${apartado} UND apartadas de este producto en pedidos. Anula o edita esos pedidos primero.`
        );
      }
    }
  }

  const claimed = await claimImport(importId, isOpen, { status: "CANCELLED" });
  if (!claimed) {
    const again = await getImport(importId);
    throw new Error(
      again?.status === "ARRIVED"
        ? "No se puede cancelar un pedido ya recibido."
        : "Este pedido ya estaba cancelado."
    );
  }
  return getImport(importId);
}

export async function listImports(): Promise<ImportOrder[]> {
  const snap = await getDb().collection("imports").get();
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ImportOrder[];
  list.sort((a, b) => {
    if (a.status === b.status) return (a.eta ?? "").localeCompare(b.eta ?? "");
    return a.status.localeCompare(b.status);
  });
  for (const item of list) {
    const u = await getDb().collection("users").doc(item.createdById).get();
    if (u.exists) item.createdBy = { id: u.id, ...u.data() } as User;
  }
  return list;
}

export async function getImport(id: string): Promise<ImportOrder | null> {
  const doc = await getDb().collection("imports").doc(id).get();
  if (!doc.exists) return null;
  const order = { id: doc.id, ...doc.data() } as ImportOrder;
  const u = await getDb().collection("users").doc(order.createdById).get();
  if (u.exists) order.createdBy = { id: u.id, ...u.data() } as User;
  if (order.lines) {
    for (const line of order.lines) {
      try {
        line.product = await getProduct(line.productId);
        if (order.status === "ORDERED" || order.status === "IN_TRANSIT") {
          const apartado = await getTransitApartadoQty(line.productId);
          const incoming = await getInTransitQty(line.productId);
          line.productApartado = apartado;
          line.productLibre = Math.max(0, incoming - apartado);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return order;
}

export async function listUpcomingImports(limit = 5): Promise<ImportOrder[]> {
  const all = await listImports();
  return all
    .filter((i) => i.status === "ORDERED" || i.status === "IN_TRANSIT")
    .sort((a, b) => (a.eta ?? "").localeCompare(b.eta ?? ""))
    .slice(0, limit);
}

export async function listActiveProducts() {
  const snap = await getDb()
    .collection("products")
    .where("active", "==", true)
    .get();
  const products = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[];
  products.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)
  );
  return products;
}
