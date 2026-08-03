import { getDb, newId } from "./firebase";
import { getReservedQty } from "./inventory";
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

/**
 * Reclama un pedido: comprueba y cambia su estado en una sola operación
 * atómica. Devuelve el pedido si el reclamo fue nuestro, o `null` si otro
 * proceso llegó primero.
 *
 * Sin esto, comprobar el estado y escribir eran dos pasos sueltos: un doble
 * toque sobre "Confirmar llegada" ingresaba la mercancía dos veces, y tocar
 * "Cancelar" mientras corría la llegada dejaba el pedido cancelado con el
 * stock ya sumado.
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

  // Igual que en cotizaciones: la API acepta JSON arbitrario, así que dos
  // líneas del mismo producto se suman en una sola.
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
  const now = new Date().toISOString();

  // Reclamamos ANTES de sumar stock. Si se hiciera al revés, un doble toque
  // sobre "Confirmar llegada" ingresaría la mercancía dos veces.
  const order = await claimImport(importId, isOpen, {
    status: "ARRIVED",
    arrivedAt: now,
  });
  if (!order) {
    const current = await getImport(importId);
    throw new Error(
      current?.status === "ARRIVED"
        ? "Este pedido ya fue recibido."
        : "No se puede recibir un pedido cancelado."
    );
  }

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
        stockAfter: next,
        availableAfter: next - reserved,
        userId,
        note: `Importación #${order.number} llegada`,
        createdAt: now,
      });
  }

  return getImport(importId);
}

export async function cancelImportOrder(importId: string) {
  const claimed = await claimImport(importId, isOpen, { status: "CANCELLED" });
  if (!claimed) {
    const current = await getImport(importId);
    throw new Error(
      current?.status === "ARRIVED"
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
