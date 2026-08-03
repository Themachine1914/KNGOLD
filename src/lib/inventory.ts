import { FieldValue } from "firebase-admin/firestore";
import { addHours } from "date-fns";
import { getDb, newId } from "./firebase";
import { calcQuoteTotals, round2 } from "./pricing";
import type {
  Customer,
  InventoryMovement,
  MovementType,
  Product,
  Quote,
  QuoteLine,
  User,
} from "./types";

function reservationHours(): number {
  // Ojo con el "0": es un valor válido (reserva inmediata) y un `||` lo
  // trataría como ausente, igual que un valor no numérico.
  const raw = process.env.RESERVATION_HOURS;
  if (raw == null || raw === "") return 48;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 48;
}

/** Una reserva vencida ya no aparta stock, aunque nadie la haya expirado aún. */
function stillReserving(data: FirebaseFirestore.DocumentData): boolean {
  if (data.status !== "RESERVED") return false;
  const until = data.reservedUntil as string | null | undefined;
  return !!until && new Date(until).getTime() > Date.now();
}

export async function getReservedQty(
  productId: string,
  excludeQuoteId?: string
): Promise<number> {
  const snap = await getDb()
    .collection("quotes")
    .where("status", "==", "RESERVED")
    .get();
  let total = 0;
  for (const doc of snap.docs) {
    if (excludeQuoteId && doc.id === excludeQuoteId) continue;
    if (!stillReserving(doc.data())) continue;
    const lines = (doc.data().lines || []) as QuoteLine[];
    for (const line of lines) {
      if (line.productId === productId) total += line.qty;
    }
  }
  return total;
}

export async function getProductsWithAvailability(): Promise<Product[]> {
  const snap = await getDb()
    .collection("products")
    .where("active", "==", true)
    .get();
  const products = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[];
  products.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)
  );

  const reservedMap = new Map<string, number>();
  const quotes = await getDb()
    .collection("quotes")
    .where("status", "==", "RESERVED")
    .get();
  for (const q of quotes.docs) {
    if (!stillReserving(q.data())) continue;
    for (const line of (q.data().lines || []) as QuoteLine[]) {
      reservedMap.set(line.productId, (reservedMap.get(line.productId) || 0) + line.qty);
    }
  }

  return products.map((p) => {
    const reserved = reservedMap.get(p.id) || 0;
    return { ...p, reserved, available: p.stockOnHand - reserved };
  });
}

async function nextNumber(counter: "quotes" | "imports"): Promise<number> {
  const ref = getDb().collection("counters").doc(counter);
  const n = await getDb().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const current = doc.exists ? Number(doc.data()?.seq || 0) : 0;
    const next = current + 1;
    tx.set(ref, { seq: next }, { merge: true });
    return next;
  });
  return n;
}

/**
 * Reclama una cotización: comprueba y cambia su estado en una sola operación
 * atómica. Devuelve la cotización si el reclamo fue nuestro, o `null` si otro
 * proceso llegó primero.
 *
 * Sin esto, comprobar el estado y escribir después son dos pasos separados:
 * dos confirmaciones simultáneas descontaban stock dos veces, y el barrido de
 * expiración podía pisar una confirmación en curso.
 */
async function claimQuote(
  quoteId: string,
  canClaim: (quote: Quote) => boolean,
  changes: Record<string, unknown>
): Promise<Quote | null> {
  const ref = getDb().collection("quotes").doc(quoteId);
  return getDb().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error("Cotización no encontrada");
    const quote = { id: doc.id, ...doc.data() } as Quote;
    if (!canClaim(quote)) return null;
    tx.update(ref, { ...changes, updatedAt: new Date().toISOString() });
    return quote;
  });
}

async function getProduct(id: string): Promise<Product> {
  const doc = await getDb().collection("products").doc(id).get();
  if (!doc.exists) throw new Error("Producto no encontrado");
  return { id: doc.id, ...doc.data() } as Product;
}

async function writeMovement(data: Omit<InventoryMovement, "id" | "createdAt"> & { id?: string }) {
  const id = data.id || newId();
  const createdAt = new Date().toISOString();
  await getDb()
    .collection("movements")
    .doc(id)
    .set({ ...data, id, createdAt });
}

export async function createReservedQuote(input: {
  sellerId: string;
  customer: {
    name: string;
    rnc?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
  includeItbis: boolean;
  notes?: string;
  lines: { productId: string; qty: number }[];
}): Promise<Quote> {
  if (!input.lines.length) throw new Error("La cotización debe tener al menos un producto.");

  // La API acepta JSON arbitrario, así que pueden llegar dos líneas del mismo
  // producto. Validadas por separado, cada una se compara contra el disponible
  // completo y entre las dos reservan de más: el disponible queda negativo y la
  // cotización se traba en RESERVED sin poder confirmarse ni liberarse.
  const wanted = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new Error("Cantidad inválida: debe ser un número entero positivo.");
    }
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.qty);
  }
  const lines = [...wanted].map(([productId, qty]) => ({ productId, qty }));

  for (const line of lines) {
    const product = await getProduct(line.productId);
    const reserved = await getReservedQty(line.productId);
    const available = product.stockOnHand - reserved;
    if (line.qty > available) {
      throw new Error(
        `Stock insuficiente para ${product.sku}: disponible ${available}, solicitado ${line.qty}.`
      );
    }
  }

  const customerId = newId();
  const customer: Customer = {
    id: customerId,
    name: input.customer.name.trim(),
    rnc: input.customer.rnc || null,
    phone: input.customer.phone || null,
    address: input.customer.address || null,
    email: input.customer.email || null,
  };
  await getDb().collection("customers").doc(customerId).set(customer);

  const builtLines: QuoteLine[] = [];
  for (const line of lines) {
    const product = await getProduct(line.productId);
    builtLines.push({
      id: newId(),
      productId: line.productId,
      qty: line.qty,
      unitPrice: product.netPrice,
      // Sin redondear, la suma de las líneas que ve el cliente puede diferir
      // un centavo del subtotal, que sí se redondea.
      lineTotal: round2(product.netPrice * line.qty),
    });
  }

  const totals = calcQuoteTotals(
    builtLines.map((l) => l.lineTotal),
    input.includeItbis
  );
  const number = await nextNumber("quotes");
  const quoteId = newId();
  const now = new Date().toISOString();
  const reservedUntil = addHours(new Date(), reservationHours()).toISOString();

  const quote: Quote = {
    id: quoteId,
    number,
    sellerId: input.sellerId,
    customerId,
    includeItbis: input.includeItbis,
    status: "RESERVED",
    subtotal: totals.subtotal,
    itbisAmount: totals.itbisAmount,
    total: totals.total,
    reservedUntil,
    notes: input.notes || null,
    createdAt: now,
    updatedAt: now,
    lines: builtLines,
  };
  await getDb().collection("quotes").doc(quoteId).set(quote);

  for (const line of builtLines) {
    const product = await getProduct(line.productId);
    const reserved = await getReservedQty(line.productId);
    await writeMovement({
      productId: line.productId,
      type: "RESERVA",
      qty: line.qty,
      stockAfter: product.stockOnHand,
      availableAfter: product.stockOnHand - reserved,
      quoteId,
      userId: input.sellerId,
      note: `Reserva cotización #${number}`,
    });
  }

  return quote;
}

export async function confirmQuote(quoteId: string, userId: string) {
  const ref = getDb().collection("quotes").doc(quoteId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Cotización no encontrada");
  const preview = { id: snap.id, ...snap.data() } as Quote;
  if (preview.status !== "RESERVED") {
    throw new Error("Solo se pueden confirmar cotizaciones reservadas.");
  }
  // El barrido de expiración solo corre al abrir ciertas páginas, así que una
  // reserva vencida puede seguir en RESERVED al llegar aquí.
  if (preview.reservedUntil && new Date(preview.reservedUntil).getTime() <= Date.now()) {
    throw new Error(
      "La reserva venció y el stock volvió a estar disponible. Crea una cotización nueva."
    );
  }

  // Comprobamos el stock antes de reclamar, para no dejar la cotización
  // confirmada si la mercancía ya no alcanza.
  for (const line of preview.lines || []) {
    const product = await getProduct(line.productId);
    if (product.stockOnHand < line.qty) {
      throw new Error(`Stock físico insuficiente para ${product.sku} al confirmar.`);
    }
  }

  const quote = await claimQuote(
    quoteId,
    (q) =>
      q.status === "RESERVED" &&
      (!q.reservedUntil || new Date(q.reservedUntil).getTime() > Date.now()),
    { status: "CONFIRMED", reservedUntil: null }
  );
  if (!quote) {
    throw new Error("La cotización cambió de estado; recarga la página.");
  }

  for (const line of quote.lines || []) {
    const pref = getDb().collection("products").doc(line.productId);
    await getDb().runTransaction(async (tx) => {
      const pdoc = await tx.get(pref);
      if (!pdoc.exists) throw new Error("Producto no encontrado");
      const stock = Number(pdoc.data()?.stockOnHand || 0);
      if (stock < line.qty) {
        throw new Error(`Stock físico insuficiente para ${pdoc.data()?.sku}`);
      }
      tx.update(pref, {
        stockOnHand: stock - line.qty,
        updatedAt: new Date().toISOString(),
      });
    });
    const product = await getProduct(line.productId);
    const reservedOthers = await getReservedQty(line.productId, quoteId);
    await writeMovement({
      productId: line.productId,
      type: "CONFIRMACION_VENTA",
      qty: line.qty,
      stockAfter: product.stockOnHand,
      availableAfter: product.stockOnHand - reservedOthers,
      quoteId,
      userId,
      note: `Confirmación cotización #${quote.number}`,
    });
  }
}

export async function cancelQuote(quoteId: string, userId: string) {
  const quote = await claimQuote(
    quoteId,
    (q) => q.status === "RESERVED" || q.status === "DRAFT",
    { status: "CANCELLED", reservedUntil: null }
  );
  if (!quote) {
    throw new Error("Esta cotización no se puede cancelar.");
  }

  if (quote.status === "RESERVED") {
    for (const line of quote.lines || []) {
      const product = await getProduct(line.productId);
      const reservedOthers = await getReservedQty(line.productId, quoteId);
      await writeMovement({
        productId: line.productId,
        type: "LIBERACION_RESERVA",
        qty: line.qty,
        stockAfter: product.stockOnHand,
        availableAfter: product.stockOnHand - reservedOthers,
        quoteId,
        userId,
        note: `Cancelación cotización #${quote.number}`,
      });
    }
  }
}

export async function expireReservedQuotes(): Promise<number> {
  const now = new Date().toISOString();
  const snap = await getDb()
    .collection("quotes")
    .where("status", "==", "RESERVED")
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    const candidate = { id: doc.id, ...doc.data() } as Quote;
    if (!candidate.reservedUntil || candidate.reservedUntil >= now) continue;

    // Esta función corre al renderizar varias páginas, así que dos pestañas
    // pueden entrar a la vez, y el vendedor puede estar confirmando justo
    // ahora. Marcamos EXPIRED primero, de forma atómica: si el reclamo no es
    // nuestro, no escribimos ningún movimiento.
    const quote = await claimQuote(
      doc.id,
      (q) =>
        q.status === "RESERVED" &&
        !!q.reservedUntil &&
        new Date(q.reservedUntil).getTime() <= Date.now(),
      { status: "EXPIRED", reservedUntil: null }
    );
    if (!quote) continue;

    for (const line of quote.lines || []) {
      const product = await getProduct(line.productId);
      const reservedOthers = await getReservedQty(line.productId, quote.id);
      await writeMovement({
        productId: line.productId,
        type: "LIBERACION_RESERVA",
        qty: line.qty,
        stockAfter: product.stockOnHand,
        availableAfter: product.stockOnHand - reservedOthers,
        quoteId: quote.id,
        note: `Expiración automática cotización #${quote.number}`,
      });
    }
    count++;
  }
  return count;
}

export async function adjustStock(input: {
  productId: string;
  qtyDelta: number;
  userId: string;
  note?: string;
}) {
  if (!input.qtyDelta) throw new Error("Datos inválidos");
  const pref = getDb().collection("products").doc(input.productId);
  let next = 0;
  await getDb().runTransaction(async (tx) => {
    const pdoc = await tx.get(pref);
    if (!pdoc.exists) throw new Error("Producto no encontrado");
    const stock = Number(pdoc.data()?.stockOnHand || 0);
    next = stock + input.qtyDelta;
    if (next < 0) throw new Error("El stock no puede quedar negativo.");
    tx.update(pref, { stockOnHand: next, updatedAt: new Date().toISOString() });
  });

  const reserved = await getReservedQty(input.productId);
  if (next < reserved) {
    // rollback-ish: put stock back
    await pref.update({
      stockOnHand: FieldValue.increment(-input.qtyDelta),
    });
    throw new Error(
      `No se puede bajar el stock por debajo de las reservas activas (${reserved}).`
    );
  }

  let type: MovementType = "AJUSTE";
  if (input.qtyDelta > 0) type = "ENTRADA";
  if (input.qtyDelta < 0) type = "SALIDA";

  await writeMovement({
    productId: input.productId,
    type,
    qty: Math.abs(input.qtyDelta),
    stockAfter: next,
    availableAfter: next - reserved,
    userId: input.userId,
    note:
      input.note ||
      `Ajuste de inventario (${input.qtyDelta > 0 ? "+" : ""}${input.qtyDelta})`,
  });
}

export function movementDelta(type: MovementType, qty: number) {
  switch (type) {
    case "ENTRADA":
      return { label: `+${qty}`, availableFocus: false };
    case "SALIDA":
    case "CONFIRMACION_VENTA":
      return { label: `−${qty}`, availableFocus: false };
    case "RESERVA":
      return { label: `−${qty} disp.`, availableFocus: true };
    case "LIBERACION_RESERVA":
      return { label: `+${qty} disp.`, availableFocus: true };
    default:
      return { label: `${qty}`, availableFocus: false };
  }
}

export async function listMovements(limit = 100): Promise<InventoryMovement[]> {
  const snap = await getDb()
    .collection("movements")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const out: InventoryMovement[] = [];
  for (const doc of snap.docs) {
    const m = { id: doc.id, ...doc.data() } as InventoryMovement;
    try {
      m.product = await getProduct(m.productId);
    } catch {
      m.product = undefined;
    }
    if (m.userId) {
      const u = await getDb().collection("users").doc(m.userId).get();
      m.user = u.exists ? { name: String(u.data()?.name || "Usuario") } : null;
    }
    if (m.quoteId) {
      const q = await getDb().collection("quotes").doc(m.quoteId).get();
      m.quote = q.exists ? { number: Number(q.data()?.number || 0) } : null;
    }
    out.push(m);
  }
  return out;
}

export async function listQuotes(sellerId?: string): Promise<Quote[]> {
  const snap = await getDb().collection("quotes").get();
  let quotes = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Quote[];
  if (sellerId) quotes = quotes.filter((q) => q.sellerId === sellerId);
  quotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const q of quotes) {
    const c = await getDb().collection("customers").doc(q.customerId).get();
    if (c.exists) q.customer = { id: c.id, ...c.data() } as Customer;
    const s = await getDb().collection("users").doc(q.sellerId).get();
    if (s.exists) q.seller = { id: s.id, ...s.data() } as User;
  }
  return quotes;
}

export async function getQuote(id: string): Promise<Quote | null> {
  const doc = await getDb().collection("quotes").doc(id).get();
  if (!doc.exists) return null;
  const quote = { id: doc.id, ...doc.data() } as Quote;
  const c = await getDb().collection("customers").doc(quote.customerId).get();
  if (c.exists) quote.customer = { id: c.id, ...c.data() } as Customer;
  const s = await getDb().collection("users").doc(quote.sellerId).get();
  if (s.exists) quote.seller = { id: s.id, ...s.data() } as User;
  if (quote.lines) {
    for (const line of quote.lines) {
      try {
        line.product = await getProduct(line.productId);
      } catch {
        /* ignore */
      }
    }
  }
  return quote;
}

export async function countReservedQuotes(sellerId?: string): Promise<number> {
  const snap = await getDb()
    .collection("quotes")
    .where("status", "==", "RESERVED")
    .get();
  if (!sellerId) return snap.size;
  return snap.docs.filter((d) => d.data().sellerId === sellerId).length;
}
