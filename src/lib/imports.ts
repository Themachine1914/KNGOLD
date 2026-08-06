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

async function getProduct(id: string): Promise<Product> {
  const doc = await getDb().collection("products").doc(id).get();
  if (!doc.exists) throw new Error("Producto no encontrado");
  return { id: doc.id, ...doc.data() } as Product;
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
  for (const line of input.lines) {
    if (line.qty <= 0) throw new Error("Cantidad inválida.");
  }

  const lines: ImportOrderLine[] = input.lines.map((l) => ({
    id: newId(),
    productId: l.productId,
    qty: l.qty,
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
  const ref = getDb().collection("imports").doc(importId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Pedido no encontrado");
  const existing = snap.data() as ImportOrder;
  if (existing.status === "ARRIVED") throw new Error("Este pedido ya llegó; no se puede cambiar.");
  if (existing.status === "CANCELLED") throw new Error("Este pedido está cancelado.");
  if (status === "ARRIVED") {
    throw new Error("Usa receiveImportOrder para marcar llegada");
  }
  await ref.update({ status, updatedAt: new Date().toISOString() });
  return getImport(importId);
}

export async function receiveImportOrder(importId: string, userId: string) {
  const ref = getDb().collection("imports").doc(importId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Pedido no encontrado");
  const order = { id: snap.id, ...snap.data() } as ImportOrder;
  if (order.status === "ARRIVED") throw new Error("Este pedido ya fue recibido.");
  if (order.status === "CANCELLED") throw new Error("No se puede recibir un pedido cancelado.");

  const now = new Date().toISOString();
  for (const line of order.lines || []) {
    const pref = getDb().collection("products").doc(line.productId);
    let next = 0;
    await getDb().runTransaction(async (tx) => {
      const pdoc = await tx.get(pref);
      if (!pdoc.exists) throw new Error("Producto no encontrado");
      const stock = Number(pdoc.data()?.stockOnHand || 0);
      next = stock + line.qty;
      tx.update(pref, { stockOnHand: next, updatedAt: now });
    });

    // Apartados de este tránsito pasan a reserva de stock físico
    const converted = await convertTransitApartadosOnArrival(
      line.productId,
      line.qty
    );
    const reserved = await getReservedQty(line.productId);
    const movId = newId();
    await getDb()
      .collection("movements")
      .doc(movId)
      .set({
        id: movId,
        productId: line.productId,
        type: "ENTRADA",
        qty: line.qty,
        transitQty: converted > 0 ? converted : 0,
        stockAfter: next,
        availableAfter: next - reserved,
        userId,
        note:
          converted > 0
            ? `Importación #${order.number} llegada (${converted} apartados → reserva)`
            : `Importación #${order.number} llegada`,
        createdAt: now,
      });
  }

  await ref.update({
    status: "ARRIVED",
    arrivedAt: now,
    updatedAt: now,
  });
  return getImport(importId);
}

export async function cancelImportOrder(importId: string) {
  const ref = getDb().collection("imports").doc(importId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Pedido no encontrado");
  const order = { id: snap.id, ...snap.data() } as ImportOrder;
  if (order.status === "ARRIVED") {
    throw new Error("No se puede cancelar un pedido ya recibido.");
  }

  for (const line of order.lines || []) {
    const apartado = await getTransitApartadoQty(line.productId);
    if (apartado <= 0) continue;
    const incoming = await getInTransitQty(line.productId);
    const remainingAfterCancel = incoming - line.qty;
    if (apartado > remainingAfterCancel) {
      throw new Error(
        `No se puede cancelar: hay ${apartado} uds apartadas de este producto en cotizaciones. Anula o edita esas cotizaciones primero.`
      );
    }
  }

  await ref.update({ status: "CANCELLED", updatedAt: new Date().toISOString() });
  return getImport(importId);
}

export async function listImports(): Promise<ImportOrder[]> {
  const snap = await getDb().collection("imports").get();
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ImportOrder[];
  list.sort((a, b) => {
    if (a.status === b.status) return a.eta.localeCompare(b.eta);
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
    .sort((a, b) => a.eta.localeCompare(b.eta))
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
