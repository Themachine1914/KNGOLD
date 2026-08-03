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

function assertProduct(raw: Record<string, unknown>, id: string): Product {
  const p = { id, ...raw } as Product;
  for (const field of ["stockOnHand", "netPrice", "listPrice"] as const) {
    if (!Number.isFinite(Number(p[field]))) {
      // Sin esto, `available` sale NaN y `line.qty > NaN` es false: la
      // validación de stock se salta y se reserva cantidad ilimitada, con
      // totales NaN guardados en la base.
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

  const builtLines: QuoteLine[] = [];
  const balances = new Map<string, { stockAfter: number; availableAfter: number }>();
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
    const reservedAntes = await getReservedQty(line.productId);
    balances.set(line.productId, {
      stockAfter: product.stockOnHand,
      // La reserva que estamos creando aún no está escrita, así que se suma
      // a mano para que el histórico refleje el disponible resultante.
      availableAfter: product.stockOnHand - reservedAntes - line.qty,
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

  // Cliente, cotización y movimientos van en un solo lote. Antes eran
  // escrituras sueltas: si fallaba a la mitad quedaba un cliente huérfano, o
  // una cotización apartando stock sin ningún movimiento que lo justificara.
  const db = getDb();
  const batch = db.batch();
  batch.set(db.collection("customers").doc(customerId), customer);
  batch.set(db.collection("quotes").doc(quoteId), quote);
  for (const line of builtLines) {
    const movId = newId();
    const bal = balances.get(line.productId)!;
    batch.set(db.collection("movements").doc(movId), {
      id: movId,
      productId: line.productId,
      type: "RESERVA",
      qty: line.qty,
      stockAfter: bal.stockAfter,
      availableAfter: bal.availableAfter,
      quoteId,
      userId: input.sellerId,
      note: `Reserva cotización #${number}`,
      createdAt: now,
    });
  }
  await batch.commit();

  return quote;
}

export async function confirmQuote(quoteId: string, userId: string) {
  const db = getDb();
  const qref = db.collection("quotes").doc(quoteId);

  // Todo en UNA transacción. Antes se reclamaba la cotización y después se
  // descontaba el stock línea por línea, cada una con su propia transacción:
  // si el proceso moría a la mitad —o una línea fallaba por stock—, la venta
  // quedaba CONFIRMED con la mercancía a medio descontar y la reserva ya
  // liberada. Esa mercancía se vendía dos veces.
  //
  // Firestore exige todas las lecturas antes de cualquier escritura, de ahí
  // el getAll previo.
  const reservedByProduct = new Map<string, number>();
  const preview = await qref.get();
  if (!preview.exists) throw new Error("Cotización no encontrada");
  for (const line of ((preview.data()?.lines || []) as QuoteLine[])) {
    if (!reservedByProduct.has(line.productId)) {
      reservedByProduct.set(
        line.productId,
        await getReservedQty(line.productId, quoteId)
      );
    }
  }

  await db.runTransaction(async (tx) => {
    const qdoc = await tx.get(qref);
    if (!qdoc.exists) throw new Error("Cotización no encontrada");
    const quote = { id: qdoc.id, ...qdoc.data() } as Quote;

    if (quote.status !== "RESERVED") {
      throw new Error("Solo se pueden confirmar cotizaciones reservadas.");
    }
    // El barrido de expiración solo corre al abrir ciertas páginas, así que
    // una reserva vencida puede seguir en RESERVED al llegar aquí.
    if (quote.reservedUntil && new Date(quote.reservedUntil).getTime() <= Date.now()) {
      throw new Error(
        "La reserva venció y el stock volvió a estar disponible. Crea una cotización nueva."
      );
    }

    const lines = quote.lines || [];
    if (!lines.length) throw new Error("La cotización no tiene líneas.");

    const prefs = lines.map((l) => db.collection("products").doc(l.productId));
    const pdocs = await tx.getAll(...prefs);

    const updates = pdocs.map((pdoc, i) => {
      if (!pdoc.exists) throw new Error("Producto no encontrado");
      const sku = pdoc.data()?.sku ?? pdoc.id;
      const stock = Number(pdoc.data()?.stockOnHand);
      if (!Number.isFinite(stock)) {
        throw new Error(`El producto ${sku} no tiene stock válido registrado.`);
      }
      if (stock < lines[i].qty) {
        throw new Error(`Stock físico insuficiente para ${sku} al confirmar.`);
      }
      return { ref: prefs[i], next: stock - lines[i].qty };
    });

    const now = new Date().toISOString();
    tx.update(qref, { status: "CONFIRMED", reservedUntil: null, updatedAt: now });

    updates.forEach(({ ref, next }, i) => {
      tx.update(ref, { stockOnHand: next, updatedAt: now });
      const movId = newId();
      tx.set(db.collection("movements").doc(movId), {
        id: movId,
        productId: lines[i].productId,
        type: "CONFIRMACION_VENTA",
        qty: lines[i].qty,
        stockAfter: next,
        availableAfter: next - (reservedByProduct.get(lines[i].productId) ?? 0),
        quoteId,
        userId,
        note: `Confirmación cotización #${quote.number}`,
        createdAt: now,
      });
    });
  });
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
  if (!Number.isInteger(input.qtyDelta) || input.qtyDelta === 0) {
    throw new Error("El ajuste debe ser un número entero distinto de cero.");
  }

  // Las reservas se leen antes: Firestore no admite consultas dentro de una
  // transacción. Se usan como límite inferior, no como dato del histórico.
  const reserved = await getReservedQty(input.productId);

  const db = getDb();
  const pref = db.collection("products").doc(input.productId);

  // Producto y movimiento en la MISMA transacción. Antes se bajaba el stock,
  // se leían las reservas y, si no cuadraba, se "deshacía" con un increment
  // negativo. Si el proceso moría entre medias, el stock quedaba bajado por
  // debajo de las reservas y sin ningún movimiento que lo registrara:
  // mercancía perdida de forma invisible.
  await db.runTransaction(async (tx) => {
    const pdoc = await tx.get(pref);
    if (!pdoc.exists) throw new Error("Producto no encontrado");
    const sku = pdoc.data()?.sku ?? pdoc.id;
    const stock = Number(pdoc.data()?.stockOnHand);
    if (!Number.isFinite(stock)) {
      throw new Error(`El producto ${sku} no tiene stock válido registrado.`);
    }

    const next = stock + input.qtyDelta;
    if (next < 0) throw new Error("El stock no puede quedar negativo.");
    if (next < reserved) {
      throw new Error(
        `No se puede bajar el stock por debajo de las reservas activas (${reserved}).`
      );
    }

    let type: MovementType = "AJUSTE";
    if (input.qtyDelta > 0) type = "ENTRADA";
    if (input.qtyDelta < 0) type = "SALIDA";

    const now = new Date().toISOString();
    tx.update(pref, { stockOnHand: next, updatedAt: now });

    const movId = newId();
    tx.set(db.collection("movements").doc(movId), {
      id: movId,
      productId: input.productId,
      type,
      qty: Math.abs(input.qtyDelta),
      stockAfter: next,
      availableAfter: next - reserved,
      userId: input.userId,
      note:
        input.note ||
        `Ajuste de inventario (${input.qtyDelta > 0 ? "+" : ""}${input.qtyDelta})`,
      createdAt: now,
    });
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
