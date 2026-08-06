import { addHours } from "date-fns";
import { getDb, newId } from "./firebase";
import { calcQuoteTotals, formatRD, round2 } from "./pricing";
import type {
  Customer,
  DailyInventorySummary,
  DailyReservationClient,
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

/** Unidades de la línea que ya están en almacén (no en tránsito). */
export function stockPortion(line: QuoteLine): number {
  const transit = Math.min(Math.max(0, Number(line.transitQty || 0)), line.qty);
  return Math.max(0, line.qty - transit);
}

export function transitPortion(line: QuoteLine): number {
  return Math.min(Math.max(0, Number(line.transitQty || 0)), line.qty);
}

/** Precio de oferta en cotización; si no viene override, usa el anterior o el catálogo. */
function resolveOfferUnitPrice(
  catalogNet: number,
  previous: number | undefined,
  override: number | undefined
): number {
  if (override != null && Number.isFinite(Number(override))) {
    const price = Math.round(Number(override) * 100) / 100;
    if (price < 0) throw new Error("El precio no puede ser negativo.");
    return price;
  }
  return previous ?? catalogNet;
}

/** Reserva sobre stock físico (excluye apartados en tránsito). */
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
      if (line.productId === productId) total += stockPortion(line);
    }
  }
  return total;
}

/** Unidades apartadas de importaciones aún no recibidas. */
export async function getTransitApartadoQty(
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
      if (line.productId === productId) total += transitPortion(line);
    }
  }
  return total;
}

/** Unidades pedidas/en tránsito (importaciones abiertas). */
export async function getInTransitQty(productId: string): Promise<number> {
  const snap = await getDb().collection("imports").get();
  let total = 0;
  for (const doc of snap.docs) {
    const status = doc.data().status as string;
    if (status !== "ORDERED" && status !== "IN_TRANSIT") continue;
    const lines = (doc.data().lines || []) as { productId: string; qty: number }[];
    for (const line of lines) {
      if (line.productId === productId) total += Number(line.qty || 0);
    }
  }
  return total;
}

/**
 * Al recibir una importación, convierte apartados en tránsito
 * en reservas de stock físico (hasta la cantidad llegada).
 */
export async function convertTransitApartadosOnArrival(
  productId: string,
  arrivedQty: number
): Promise<number> {
  if (arrivedQty <= 0) return 0;
  const snap = await getDb()
    .collection("quotes")
    .where("status", "==", "RESERVED")
    .get();
  const quotes = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Quote)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let remaining = arrivedQty;
  let convertedTotal = 0;

  for (const quote of quotes) {
    if (remaining <= 0) break;
    let changed = false;
    const lines = (quote.lines || []).map((line) => {
      if (line.productId !== productId || remaining <= 0) return line;
      const t = transitPortion(line);
      if (t <= 0) return line;
      const convert = Math.min(t, remaining);
      remaining -= convert;
      convertedTotal += convert;
      changed = true;
      return { ...line, transitQty: t - convert };
    });
    if (changed) {
      await getDb().collection("quotes").doc(quote.id).update({
        lines,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return convertedTotal;
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
  const transitApartadoMap = new Map<string, number>();
  const quotes = await getDb()
    .collection("quotes")
    .where("status", "==", "RESERVED")
    .get();
  for (const q of quotes.docs) {
    if (!stillReserving(q.data())) continue;
    for (const line of (q.data().lines || []) as QuoteLine[]) {
      reservedMap.set(
        line.productId,
        (reservedMap.get(line.productId) || 0) + stockPortion(line)
      );
      transitApartadoMap.set(
        line.productId,
        (transitApartadoMap.get(line.productId) || 0) + transitPortion(line)
      );
    }
  }

  const inTransitMap = new Map<string, number>();
  const imports = await getDb().collection("imports").get();
  for (const doc of imports.docs) {
    const status = doc.data().status as string;
    if (status !== "ORDERED" && status !== "IN_TRANSIT") continue;
    for (const line of (doc.data().lines || []) as { productId: string; qty: number }[]) {
      inTransitMap.set(
        line.productId,
        (inTransitMap.get(line.productId) || 0) + Number(line.qty || 0)
      );
    }
  }

  return products.map((p) => {
    const reserved = reservedMap.get(p.id) || 0;
    const available = p.stockOnHand - reserved;
    const inTransit = inTransitMap.get(p.id) || 0;
    const transitApartado = transitApartadoMap.get(p.id) || 0;
    const availableTransit = Math.max(0, inTransit - transitApartado);
    return {
      ...p,
      reserved,
      available,
      inTransit,
      transitApartado,
      availableTransit,
      availableTotal: available + availableTransit,
    };
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
  lines: { productId: string; qty: number; unitPrice?: number }[];
}): Promise<Quote> {
  if (!input.lines.length) throw new Error("La cotización debe tener al menos un producto.");

  type Planned = {
    productId: string;
    qty: number;
    transitQty: number;
    unitPrice: number;
    sku: string;
  };
  const planned: Planned[] = [];

  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new Error("Cantidad inválida: debe ser un número entero positivo.");
    }
    const product = await getProduct(line.productId);
    const reserved = await getReservedQty(line.productId);
    const availableStock = product.stockOnHand - reserved;
    const inTransit = await getInTransitQty(line.productId);
    const transitApartado = await getTransitApartadoQty(line.productId);
    const availableTransit = Math.max(0, inTransit - transitApartado);
    const availableTotal = availableStock + availableTransit;

    if (line.qty > availableTotal) {
      throw new Error(
        `Stock insuficiente para ${product.sku}: disponible ${availableStock}` +
          (availableTransit > 0 ? ` + ${availableTransit} en tránsito` : "") +
          `, solicitado ${line.qty}.`
      );
    }

    const fromStock = Math.min(line.qty, availableStock);
    const transitQty = line.qty - fromStock;
    planned.push({
      productId: line.productId,
      qty: line.qty,
      transitQty,
      unitPrice: resolveOfferUnitPrice(product.netPrice, undefined, line.unitPrice),
      sku: product.sku,
    });
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
  const builtLines: QuoteLine[] = planned.map((p) => ({
    id: newId(),
    productId: p.productId,
    qty: p.qty,
    transitQty: p.transitQty,
    unitPrice: p.unitPrice,
    lineTotal: round2(p.unitPrice * p.qty),
  }));

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

  const balances = new Map<string, { stockAfter: number; availableAfter: number; note: string; transitQty: number }>();
  for (const line of builtLines) {
    const product = await getProduct(line.productId);
    const reservedAntes = await getReservedQty(line.productId);
    const t = transitPortion(line);
    balances.set(line.productId, {
      stockAfter: product.stockOnHand,
      availableAfter: product.stockOnHand - reservedAntes - stockPortion(line),
      transitQty: t,
      note:
        t > 0
          ? `Reserva cotización #${number}: ${stockPortion(line)} en almacén + ${t} apartadas en tránsito`
          : `Reserva cotización #${number}`,
    });
  }

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
      transitQty: bal.transitQty,
      stockAfter: bal.stockAfter,
      availableAfter: bal.availableAfter,
      quoteId,
      userId: input.sellerId,
      note: bal.note,
      createdAt: now,
    });
  }
  await batch.commit();

  return quote;
}

export async function confirmQuote(quoteId: string, userId: string) {
  const db = getDb();
  const qref = db.collection("quotes").doc(quoteId);

  const reservedByProduct = new Map<string, number>();
  const preview = await qref.get();
  if (!preview.exists) throw new Error("Cotización no encontrada");
  const previewQuote = { id: preview.id, ...preview.data() } as Quote;
  const pendingTransit = (previewQuote.lines || []).reduce(
    (s, l) => s + transitPortion(l),
    0
  );
  if (pendingTransit > 0) {
    throw new Error(
      `Hay ${pendingTransit} uds apartadas en tránsito. Recibe la importación antes de confirmar la venta.`
    );
  }
  for (const line of (previewQuote.lines || [])) {
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
    if (quote.reservedUntil && new Date(quote.reservedUntil).getTime() <= Date.now()) {
      throw new Error(
        "La reserva venció y el stock volvió a estar disponible. Crea una cotización nueva."
      );
    }

    const lines = quote.lines || [];
    if (!lines.length) throw new Error("La cotización no tiene líneas.");
    if ((lines || []).reduce((s, l) => s + transitPortion(l), 0) > 0) {
      throw new Error(
        "Hay unidades apartadas en tránsito. Recibe la importación antes de confirmar la venta."
      );
    }

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
  const ref = getDb().collection("quotes").doc(quoteId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Cotización no encontrada");
  const existing = { id: snap.id, ...snap.data() } as Quote;

  if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
    throw new Error("Esta cotización ya está anulada o expirada.");
  }

  if (existing.status === "CONFIRMED") {
    const quote = await claimQuote(
      quoteId,
      (q) => q.status === "CONFIRMED",
      { status: "CANCELLED", reservedUntil: null }
    );
    if (!quote) throw new Error("Esta cotización no se puede anular.");

    const db = getDb();
    for (const line of quote.lines || []) {
      const pref = db.collection("products").doc(line.productId);
      const reserved = await getReservedQty(line.productId);
      await db.runTransaction(async (tx) => {
        const pdoc = await tx.get(pref);
        if (!pdoc.exists) throw new Error("Producto no encontrado");
        const stock = Number(pdoc.data()?.stockOnHand);
        if (!Number.isFinite(stock)) {
          throw new Error(`El producto ${pdoc.data()?.sku ?? pdoc.id} no tiene stock válido.`);
        }
        const next = stock + line.qty;
        const now = new Date().toISOString();
        tx.update(pref, { stockOnHand: next, updatedAt: now });
        const movId = newId();
        tx.set(db.collection("movements").doc(movId), {
          id: movId,
          productId: line.productId,
          type: "ANULACION_VENTA",
          qty: line.qty,
          stockAfter: next,
          availableAfter: next - reserved,
          quoteId,
          userId,
          note: `Anulación venta cotización #${quote.number}`,
          createdAt: now,
        });
      });
    }
    return;
  }

  const quote = await claimQuote(
    quoteId,
    (q) => q.status === "RESERVED" || q.status === "DRAFT",
    { status: "CANCELLED", reservedUntil: null }
  );
  if (!quote) {
    throw new Error("Esta cotización no se puede anular.");
  }

  if (quote.status === "RESERVED") {
    for (const line of quote.lines || []) {
      const product = await getProduct(line.productId);
      const reservedOthers = await getReservedQty(line.productId, quoteId);
      await writeMovement({
        productId: line.productId,
        type: "LIBERACION_RESERVA",
        qty: line.qty,
        transitQty: transitPortion(line),
        stockAfter: product.stockOnHand,
        availableAfter: product.stockOnHand - reservedOthers,
        quoteId,
        userId,
        note: `Anulación cotización #${quote.number}`,
      });
    }
  }
}

/**
 * Edita una cotización reservada o facturada (confirmada).
 * - RESERVED: ajusta reservas / tránsito.
 * - CONFIRMED: ajusta stock físico (venta) a la par.
 */
export async function updateQuoteLines(
  quoteId: string,
  userId: string,
  nextLinesInput: { productId: string; qty: number; unitPrice?: number }[]
): Promise<Quote> {
  const ref = getDb().collection("quotes").doc(quoteId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Cotización no encontrada");
  const quote = { id: snap.id, ...snap.data() } as Quote;
  if (quote.status === "CONFIRMED") {
    return updateConfirmedQuoteLines(quote, userId, nextLinesInput);
  }
  if (quote.status !== "RESERVED") {
    throw new Error("Solo se pueden editar cotizaciones reservadas o facturadas.");
  }

  const currentLines = quote.lines || [];
  const currentByProduct = new Map(
    currentLines.map((l) => [l.productId, l] as const)
  );

  const requested = new Map<string, number>();
  const priceOverride = new Map<string, number>();
  for (const row of nextLinesInput) {
    const qty = Math.floor(Number(row.qty) || 0);
    if (qty < 0) throw new Error("Cantidad inválida.");
    if (!row.productId) throw new Error("Producto inválido.");
    // Si el mismo producto llega dos veces, suma
    requested.set(row.productId, (requested.get(row.productId) || 0) + qty);
    if (row.unitPrice != null && Number.isFinite(Number(row.unitPrice))) {
      priceOverride.set(row.productId, Number(row.unitPrice));
    }
  }

  // Productos actuales omitidos en el payload = 0 (quitar)
  for (const line of currentLines) {
    if (!requested.has(line.productId)) requested.set(line.productId, 0);
  }

  const nextLines: QuoteLine[] = [];
  const deltas: { productId: string; delta: number; sku: string }[] = [];
  let pricesChanged = false;

  for (const [productId, nextQty] of requested) {
    const product = await getProduct(productId);
    const old = currentByProduct.get(productId);
    const oldQty = old?.qty || 0;

    if (nextQty === 0) {
      if (oldQty > 0) {
        deltas.push({ productId, delta: -oldQty, sku: product.sku });
      }
      continue;
    }

    // Disponibilidad libre de otros + lo que esta cotización ya tiene
    const availableStock =
      product.stockOnHand - (await getReservedQty(productId, quoteId));
    const availableTransit = Math.max(
      0,
      (await getInTransitQty(productId)) -
        (await getTransitApartadoQty(productId, quoteId))
    );
    const availableTotal = availableStock + availableTransit;

    if (nextQty > availableTotal) {
      throw new Error(
        `Stock insuficiente para ${product.sku}: disponible ${availableStock}` +
          (availableTransit > 0 ? ` + ${availableTransit} en tránsito` : "") +
          `, solicitado ${nextQty}.`
      );
    }

    const transitQty = Math.max(0, nextQty - availableStock);
    const unitPrice = resolveOfferUnitPrice(
      product.netPrice,
      old?.unitPrice,
      priceOverride.get(productId)
    );
    if (old && Math.round(old.unitPrice * 100) !== Math.round(unitPrice * 100)) {
      pricesChanged = true;
    }
    nextLines.push({
      id: old?.id || newId(),
      productId,
      qty: nextQty,
      transitQty,
      unitPrice,
      lineTotal: unitPrice * nextQty,
    });

    if (nextQty !== oldQty) {
      deltas.push({ productId, delta: nextQty - oldQty, sku: product.sku });
    }
  }

  if (!deltas.length && !pricesChanged) {
    return quote;
  }

  if (!nextLines.length) {
    await cancelQuote(quoteId, userId);
    const cancelled = await ref.get();
    return { id: cancelled.id, ...cancelled.data() } as Quote;
  }

  const totals = calcQuoteTotals(
    nextLines.map((l) => l.lineTotal),
    quote.includeItbis
  );
  const updatedAt = new Date().toISOString();
  await ref.update({
    lines: nextLines,
    subtotal: totals.subtotal,
    itbisAmount: totals.itbisAmount,
    total: totals.total,
    updatedAt,
  });

  for (const d of deltas) {
    const product = await getProduct(d.productId);
    const reserved = await getReservedQty(d.productId);
    const nextLine = nextLines.find((l) => l.productId === d.productId);
    const oldLine = currentByProduct.get(d.productId);
    const transitDelta =
      transitPortion(nextLine || { id: "", productId: d.productId, qty: 0, unitPrice: 0, lineTotal: 0 }) -
      transitPortion(oldLine || { id: "", productId: d.productId, qty: 0, unitPrice: 0, lineTotal: 0 });
    if (d.delta > 0) {
      await writeMovement({
        productId: d.productId,
        type: "RESERVA",
        qty: d.delta,
        transitQty: Math.max(0, transitDelta),
        stockAfter: product.stockOnHand,
        availableAfter: product.stockOnHand - reserved,
        quoteId,
        userId,
        note: `Ajuste cotización #${quote.number}: +${d.delta}`,
      });
    } else {
      await writeMovement({
        productId: d.productId,
        type: "LIBERACION_RESERVA",
        qty: Math.abs(d.delta),
        transitQty: Math.max(0, -transitDelta),
        stockAfter: product.stockOnHand,
        availableAfter: product.stockOnHand - reserved,
        quoteId,
        userId,
        note: `Ajuste cotización #${quote.number}: ${d.delta}`,
      });
    }
  }

  return {
    ...quote,
    lines: nextLines,
    subtotal: totals.subtotal,
    itbisAmount: totals.itbisAmount,
    total: totals.total,
    updatedAt,
  };
}

/** Edita una venta ya facturada: suma/baja productos y mueve stock físico. */
async function updateConfirmedQuoteLines(
  quote: Quote,
  userId: string,
  nextLinesInput: { productId: string; qty: number; unitPrice?: number }[]
): Promise<Quote> {
  const ref = getDb().collection("quotes").doc(quote.id);
  const currentLines = quote.lines || [];
  const currentByProduct = new Map(
    currentLines.map((l) => [l.productId, l] as const)
  );

  const requested = new Map<string, number>();
  const priceOverride = new Map<string, number>();
  for (const row of nextLinesInput) {
    const qty = Math.floor(Number(row.qty) || 0);
    if (qty < 0) throw new Error("Cantidad inválida.");
    if (!row.productId) throw new Error("Producto inválido.");
    requested.set(row.productId, (requested.get(row.productId) || 0) + qty);
    if (row.unitPrice != null && Number.isFinite(Number(row.unitPrice))) {
      priceOverride.set(row.productId, Number(row.unitPrice));
    }
  }
  for (const line of currentLines) {
    if (!requested.has(line.productId)) requested.set(line.productId, 0);
  }

  const nextLines: QuoteLine[] = [];
  const deltas: { productId: string; delta: number; sku: string }[] = [];
  let pricesChanged = false;

  for (const [productId, nextQty] of requested) {
    const product = await getProduct(productId);
    const old = currentByProduct.get(productId);
    const oldQty = old?.qty || 0;

    if (nextQty === 0) {
      if (oldQty > 0) {
        deltas.push({ productId, delta: -oldQty, sku: product.sku });
      }
      continue;
    }

    // Stock libre + lo ya vendido en esta factura (que se puede "devolver" al editar)
    const freeStock =
      product.stockOnHand - (await getReservedQty(productId));
    const maxAllowed = freeStock + oldQty;
    if (nextQty > maxAllowed) {
      throw new Error(
        `Stock insuficiente para ${product.sku}: disponible ${freeStock}, solicitado +${Math.max(0, nextQty - oldQty)}.`
      );
    }

    const unitPrice = resolveOfferUnitPrice(
      product.netPrice,
      old?.unitPrice,
      priceOverride.get(productId)
    );
    if (old && Math.round(old.unitPrice * 100) !== Math.round(unitPrice * 100)) {
      pricesChanged = true;
    }
    nextLines.push({
      id: old?.id || newId(),
      productId,
      qty: nextQty,
      transitQty: 0,
      unitPrice,
      lineTotal: unitPrice * nextQty,
    });

    if (nextQty !== oldQty) {
      deltas.push({ productId, delta: nextQty - oldQty, sku: product.sku });
    }
  }

  if (!deltas.length && !pricesChanged) return quote;

  if (!nextLines.length) {
    await cancelQuote(quote.id, userId);
    const cancelled = await ref.get();
    return { id: cancelled.id, ...cancelled.data() } as Quote;
  }

  const totals = calcQuoteTotals(
    nextLines.map((l) => l.lineTotal),
    quote.includeItbis
  );
  const updatedAt = new Date().toISOString();
  await ref.update({
    lines: nextLines,
    subtotal: totals.subtotal,
    itbisAmount: totals.itbisAmount,
    total: totals.total,
    updatedAt,
  });

  for (const d of deltas) {
    const pref = getDb().collection("products").doc(d.productId);
    if (d.delta > 0) {
      await getDb().runTransaction(async (tx) => {
        const pdoc = await tx.get(pref);
        if (!pdoc.exists) throw new Error("Producto no encontrado");
        const stock = Number(pdoc.data()?.stockOnHand || 0);
        if (stock < d.delta) {
          throw new Error(`Stock físico insuficiente para ${d.sku}`);
        }
        tx.update(pref, {
          stockOnHand: stock - d.delta,
          updatedAt: new Date().toISOString(),
        });
      });
      const product = await getProduct(d.productId);
      const reserved = await getReservedQty(d.productId);
      await writeMovement({
        productId: d.productId,
        type: "CONFIRMACION_VENTA",
        qty: d.delta,
        stockAfter: product.stockOnHand,
        availableAfter: product.stockOnHand - reserved,
        quoteId: quote.id,
        userId,
        note: `Ajuste factura #${quote.number}: +${d.delta}`,
      });
    } else {
      const add = Math.abs(d.delta);
      await getDb().runTransaction(async (tx) => {
        const pdoc = await tx.get(pref);
        if (!pdoc.exists) throw new Error("Producto no encontrado");
        const stock = Number(pdoc.data()?.stockOnHand || 0);
        tx.update(pref, {
          stockOnHand: stock + add,
          updatedAt: new Date().toISOString(),
        });
      });
      const product = await getProduct(d.productId);
      const reserved = await getReservedQty(d.productId);
      await writeMovement({
        productId: d.productId,
        type: "ANULACION_VENTA",
        qty: add,
        stockAfter: product.stockOnHand,
        availableAfter: product.stockOnHand - reserved,
        quoteId: quote.id,
        userId,
        note: `Ajuste factura #${quote.number}: −${add}`,
      });
    }
  }

  return {
    ...quote,
    lines: nextLines,
    subtotal: totals.subtotal,
    itbisAmount: totals.itbisAmount,
    total: totals.total,
    updatedAt,
  };
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
        transitQty: transitPortion(line),
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

  const reserved = await getReservedQty(input.productId);
  const db = getDb();
  const pref = db.collection("products").doc(input.productId);

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

/** Actualiza precios de catálogo (ofertas). Las cotizaciones nuevas usan netPrice. */
export async function updateProductPrice(input: {
  productId: string;
  netPrice: number;
  listPrice?: number;
  userId: string;
}): Promise<Product> {
  const netPrice = Math.round(Number(input.netPrice) * 100) / 100;
  if (!Number.isFinite(netPrice) || netPrice < 0) {
    throw new Error("Precio de venta inválido");
  }

  const ref = getDb().collection("products").doc(input.productId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Producto no encontrado");
  const current = { id: snap.id, ...snap.data() } as Product;

  const oldNet = Number(current.netPrice || 0);
  const oldList = Number(current.listPrice || oldNet);

  let listPrice =
    input.listPrice != null
      ? Math.round(Number(input.listPrice) * 100) / 100
      : oldList;
  if (!Number.isFinite(listPrice) || listPrice < 0) {
    throw new Error("Precio de lista inválido");
  }
  if (listPrice < netPrice) listPrice = netPrice;

  const discountPct =
    listPrice > 0
      ? Math.round(((listPrice - netPrice) / listPrice) * 10000) / 100
      : 0;

  const priceChanged =
    Math.round(oldNet * 100) !== Math.round(netPrice * 100) ||
    Math.round(oldList * 100) !== Math.round(listPrice * 100);

  const updatedAt = new Date().toISOString();
  await ref.update({
    netPrice,
    listPrice,
    discountPct,
    updatedAt,
  });

  if (priceChanged && input.userId) {
    const reserved = await getReservedQty(input.productId);
    const noteParts = [
      `Venta ${formatRD(oldNet)} → ${formatRD(netPrice)}`,
    ];
    if (Math.round(oldList * 100) !== Math.round(listPrice * 100)) {
      noteParts.push(`Lista ${formatRD(oldList)} → ${formatRD(listPrice)}`);
    }
    await writeMovement({
      productId: input.productId,
      type: "CAMBIO_PRECIO",
      qty: 0,
      stockAfter: current.stockOnHand,
      availableAfter: current.stockOnHand - reserved,
      userId: input.userId,
      note: noteParts.join(" · "),
    });
  }

  return {
    ...current,
    netPrice,
    listPrice,
    discountPct,
  };
}

export function movementDelta(type: MovementType, qty: number) {
  switch (type) {
    case "ENTRADA":
    case "ANULACION_VENTA":
      return { label: `+${qty}`, availableFocus: false };
    case "SALIDA":
    case "CONFIRMACION_VENTA":
      return { label: `−${qty}`, availableFocus: false };
    case "RESERVA":
      return { label: `−${qty} disp.`, availableFocus: true };
    case "LIBERACION_RESERVA":
      return { label: `+${qty} disp.`, availableFocus: true };
    case "CAMBIO_PRECIO":
      return { label: "·", availableFocus: false };
    default:
      return { label: `${qty}`, availableFocus: false };
  }
}

const DO_TZ = "America/Santo_Domingo";

function dayKeyInDO(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayLabelInDO(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return "Hoy";
  if (dateKey === yesterdayKey) return "Ayer";
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: DO_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(utc);
}

function parseTransitSplit(
  m: Pick<InventoryMovement, "qty" | "transitQty" | "note" | "type">
): { stock: number; transit: number } {
  const explicit = Math.min(Math.max(0, Number(m.transitQty || 0)), m.qty);
  if (m.transitQty != null && m.transitQty !== undefined) {
    return { stock: Math.max(0, m.qty - explicit), transit: explicit };
  }
  const note = m.note || "";
  const pair = note.match(
    /(\d+)\s+en almacén\s*\+\s*(\d+)\s+apartadas en tránsito/i
  );
  if (pair) {
    return { stock: Number(pair[1]), transit: Number(pair[2]) };
  }
  if (/apartadas en tránsito/i.test(note)) {
    return { stock: 0, transit: m.qty };
  }
  return { stock: m.qty, transit: 0 };
}

/**
 * Resumen por día (zona RD) de movimiento físico, reservas de almacén y tránsito.
 */
export async function getDailyInventorySummaries(
  dayCount = 14
): Promise<DailyInventorySummary[]> {
  const snap = await getDb()
    .collection("movements")
    .orderBy("createdAt", "desc")
    .limit(800)
    .get();

  const todayKey = dayKeyInDO(new Date().toISOString());
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterdayKey = dayKeyInDO(yest.toISOString());

  const byDay = new Map<string, DailyInventorySummary>();
  /** day -> quoteId -> accumulator */
  const reserveAcc = new Map<
    string,
    Map<
      string,
      { units: number; transitUnits: number; amount: number; lastAt: string }
    >
  >();
  /** day -> quoteIds confirmed / annulled (for money once per quote) */
  const soldQuotes = new Map<string, Set<string>>();
  const annulQuotes = new Map<string, Set<string>>();
  const quoteIdsNeeded = new Set<string>();

  type MovRow = InventoryMovement & { dayKey: string };

  function ensure(date: string): DailyInventorySummary {
    let row = byDay.get(date);
    if (!row) {
      row = {
        date,
        label: dayLabelInDO(date, todayKey, yesterdayKey),
        physicalIn: 0,
        physicalOut: 0,
        reserveIn: 0,
        reserveOut: 0,
        transitIn: 0,
        transitOut: 0,
        events: 0,
        reservedAmount: 0,
        soldAmount: 0,
        transitAmount: 0,
        reservations: [],
      };
      byDay.set(date, row);
    }
    return row;
  }

  // Pre-create empty days so the board always shows continuity
  for (let i = 0; i < dayCount; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    ensure(dayKeyInDO(d.toISOString()));
  }

  const pending: MovRow[] = [];
  for (const doc of snap.docs) {
    const m = { id: doc.id, ...doc.data() } as InventoryMovement;
    const key = dayKeyInDO(m.createdAt);
    if (!byDay.has(key)) continue;
    pending.push({ ...m, dayKey: key });
    if (m.quoteId) quoteIdsNeeded.add(m.quoteId);
  }

  type QuoteMeta = {
    number: number;
    customerName: string;
    total: number;
    unitByProduct: Map<string, number>;
  };
  const quoteMeta = new Map<string, QuoteMeta>();
  await Promise.all(
    [...quoteIdsNeeded].map(async (id) => {
      const q = await getDb().collection("quotes").doc(id).get();
      if (!q.exists) return;
      const data = q.data()!;
      let customerName = "Cliente";
      if (data.customerId) {
        const c = await getDb()
          .collection("customers")
          .doc(String(data.customerId))
          .get();
        if (c.exists) customerName = String(c.data()?.name || "Cliente");
      }
      const unitByProduct = new Map<string, number>();
      for (const line of (data.lines || []) as QuoteLine[]) {
        unitByProduct.set(line.productId, Number(line.unitPrice || 0));
      }
      quoteMeta.set(id, {
        number: Number(data.number || 0),
        customerName,
        total: Number(data.total || 0),
        unitByProduct,
      });
    })
  );

  function unitPrice(quoteId: string | null | undefined, productId: string): number {
    if (!quoteId) return 0;
    return quoteMeta.get(quoteId)?.unitByProduct.get(productId) || 0;
  }

  for (const m of pending) {
    // Bitácora de precio: no afecta inventario ni totales del tablero diario.
    if (m.type === "CAMBIO_PRECIO") continue;

    const row = ensure(m.dayKey);
    row.events += 1;
    const split = parseTransitSplit(m);
    const price = unitPrice(m.quoteId, m.productId);

    switch (m.type) {
      case "ENTRADA":
        row.physicalIn += m.qty;
        if (split.transit > 0) {
          // Apartados convertidos a reserva de almacén (unidades)
          row.transitOut += split.transit;
          row.reserveIn += split.transit;
        }
        break;
      case "ANULACION_VENTA":
        row.physicalIn += m.qty;
        if (m.quoteId) {
          let set = annulQuotes.get(m.dayKey);
          if (!set) {
            set = new Set();
            annulQuotes.set(m.dayKey, set);
          }
          set.add(m.quoteId);
        }
        break;
      case "SALIDA":
        row.physicalOut += m.qty;
        break;
      case "CONFIRMACION_VENTA":
        row.physicalOut += m.qty;
        if (m.quoteId) {
          let set = soldQuotes.get(m.dayKey);
          if (!set) {
            set = new Set();
            soldQuotes.set(m.dayKey, set);
          }
          set.add(m.quoteId);
        }
        break;
      case "AJUSTE": {
        const note = m.note || "";
        if (note.includes("-") || /ajuste de inventario\s*\(-\d+/i.test(note)) {
          row.physicalOut += m.qty;
        } else {
          row.physicalIn += m.qty;
        }
        break;
      }
      case "RESERVA": {
        row.reserveIn += split.stock;
        row.transitIn += split.transit;
        const stockMoney = split.stock * price;
        const transitMoney = split.transit * price;
        row.reservedAmount += stockMoney;
        row.transitAmount += transitMoney;
        if (m.quoteId) {
          let byQuote = reserveAcc.get(m.dayKey);
          if (!byQuote) {
            byQuote = new Map();
            reserveAcc.set(m.dayKey, byQuote);
          }
          const prev = byQuote.get(m.quoteId) || {
            units: 0,
            transitUnits: 0,
            amount: 0,
            lastAt: m.createdAt,
          };
          prev.units += m.qty;
          prev.transitUnits += split.transit;
          prev.amount += stockMoney + transitMoney;
          if (m.createdAt > prev.lastAt) prev.lastAt = m.createdAt;
          byQuote.set(m.quoteId, prev);
        }
        break;
      }
      case "LIBERACION_RESERVA": {
        row.reserveOut += split.stock;
        row.transitOut += split.transit;
        row.reservedAmount -= split.stock * price;
        row.transitAmount -= split.transit * price;
        break;
      }
      default:
        break;
    }
  }

  for (const [date, ids] of soldQuotes) {
    const row = byDay.get(date);
    if (!row) continue;
    for (const id of ids) {
      row.soldAmount += quoteMeta.get(id)?.total || 0;
    }
  }
  for (const [date, ids] of annulQuotes) {
    const row = byDay.get(date);
    if (!row) continue;
    for (const id of ids) {
      row.soldAmount -= quoteMeta.get(id)?.total || 0;
    }
  }

  for (const [date, byQuote] of reserveAcc) {
    const row = byDay.get(date);
    if (!row) continue;
    const list: DailyReservationClient[] = [];
    for (const [quoteId, acc] of byQuote) {
      const meta = quoteMeta.get(quoteId);
      list.push({
        quoteId,
        number: meta?.number || 0,
        customerName: meta?.customerName || "Cliente",
        units: acc.units,
        transitUnits: acc.transitUnits,
        amount: Math.round(acc.amount * 100) / 100,
        lastAt: acc.lastAt,
      });
    }
    list.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    row.reservations = list;
  }

  // Round money fields
  for (const row of byDay.values()) {
    row.reservedAmount = Math.round(row.reservedAmount * 100) / 100;
    row.soldAmount = Math.round(row.soldAmount * 100) / 100;
    row.transitAmount = Math.round(row.transitAmount * 100) / 100;
  }

  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
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
  quotes.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

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
