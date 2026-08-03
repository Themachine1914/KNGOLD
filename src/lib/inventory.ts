import {
  MovementType,
  Prisma,
  QuoteStatus,
  type PrismaClient,
} from "@prisma/client";
import { addHours } from "date-fns";
import { calcQuoteTotals, round2 } from "./pricing";

type Db = PrismaClient | Prisma.TransactionClient;

export async function getReservedQty(
  db: Db,
  productId: string,
  excludeQuoteId?: string
): Promise<number> {
  const lines = await db.quoteLine.findMany({
    where: {
      productId,
      quote: {
        status: QuoteStatus.RESERVED,
        // Una reserva vencida ya no aparta nada, aunque el barrido de
        // expiración todavía no haya pasado por ella.
        reservedUntil: { gt: new Date() },
        ...(excludeQuoteId ? { id: { not: excludeQuoteId } } : {}),
      },
    },
    select: { qty: true },
  });
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

export async function getAvailableQty(
  db: Db,
  productId: string,
  excludeQuoteId?: string
): Promise<{ stockOnHand: number; reserved: number; available: number }> {
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stockOnHand: true },
  });
  const reserved = await getReservedQty(db, productId, excludeQuoteId);
  return {
    stockOnHand: product.stockOnHand,
    reserved,
    available: product.stockOnHand - reserved,
  };
}

export async function getProductsWithAvailability(db: Db) {
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  const reservedQuotes = await db.quoteLine.findMany({
    where: {
      quote: {
        status: QuoteStatus.RESERVED,
        reservedUntil: { gt: new Date() },
      },
    },
    select: { productId: true, qty: true },
  });
  const reservedMap = new Map<string, number>();
  for (const line of reservedQuotes) {
    reservedMap.set(line.productId, (reservedMap.get(line.productId) || 0) + line.qty);
  }
  return products.map((p) => {
    const reserved = reservedMap.get(p.id) || 0;
    return {
      ...p,
      reserved,
      available: p.stockOnHand - reserved,
    };
  });
}

async function getReservationHours(db: Db): Promise<number> {
  const setting = await db.appSetting.findUnique({
    where: { key: "reservation_hours" },
  });
  // Ojo con el "0": es un valor válido (reserva inmediata) y un `||` lo
  // trataría como ausente. Igual con un valor no numérico en el entorno.
  for (const raw of [setting?.value, process.env.RESERVATION_HOURS]) {
    if (raw == null || raw === "") continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 48;
}

async function balancesAfter(
  db: Db,
  productId: string,
  stockOnHand: number
): Promise<{ stockAfter: number; availableAfter: number }> {
  const reserved = await getReservedQty(db, productId);
  return {
    stockAfter: stockOnHand,
    availableAfter: stockOnHand - reserved,
  };
}

export async function createReservedQuote(
  db: PrismaClient,
  input: {
    sellerId: string;
    customer: {
      name: string;
      rnc?: string;
      phone?: string;
      address?: string;
      email?: string;
      existingId?: string;
    };
    includeItbis: boolean;
    notes?: string;
    lines: { productId: string; qty: number }[];
  }
) {
  if (!input.lines.length) {
    throw new Error("La cotización debe tener al menos un producto.");
  }

  // La API acepta JSON arbitrario, así que dos líneas del mismo producto
  // pueden llegar por separado. Si se validan sueltas, cada una se compara
  // contra el disponible completo y entre las dos reservan de más.
  const wanted = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new Error("Cantidad inválida: debe ser un número entero positivo.");
    }
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.qty);
  }
  const lines = [...wanted].map(([productId, qty]) => ({ productId, qty }));

  return db.$transaction(async (tx) => {
    for (const line of lines) {
      const { available } = await getAvailableQty(tx, line.productId);
      const product = await tx.product.findUniqueOrThrow({
        where: { id: line.productId },
      });
      if (line.qty > available) {
        throw new Error(
          `Stock insuficiente para ${product.sku}: disponible ${available}, solicitado ${line.qty}.`
        );
      }
    }

    let customerId = input.customer.existingId;
    if (!customerId) {
      const customer = await tx.customer.create({
        data: {
          name: input.customer.name,
          rnc: input.customer.rnc || null,
          phone: input.customer.phone || null,
          address: input.customer.address || null,
          email: input.customer.email || null,
        },
      });
      customerId = customer.id;
    }

    const products = await tx.product.findMany({
      where: { id: { in: lines.map((l) => l.productId) } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const builtLines = lines.map((l) => {
      const product = productMap.get(l.productId)!;
      const unitPrice = product.netPrice;
      // Sin redondear aquí, la suma de las líneas que ve el cliente puede
      // diferir un centavo del subtotal, que sí se redondea.
      const lineTotal = round2(unitPrice * l.qty);
      return {
        productId: l.productId,
        qty: l.qty,
        unitPrice,
        lineTotal,
      };
    });

    const totals = calcQuoteTotals(
      builtLines.map((l) => l.lineTotal),
      input.includeItbis
    );

    const hours = await getReservationHours(tx);
    const reservedUntil = addHours(new Date(), hours);

    const last = await tx.quote.findFirst({
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const number = (last?.number || 0) + 1;

    const quote = await tx.quote.create({
      data: {
        number,
        sellerId: input.sellerId,
        customerId,
        includeItbis: input.includeItbis,
        status: QuoteStatus.RESERVED,
        subtotal: totals.subtotal,
        itbisAmount: totals.itbisAmount,
        total: totals.total,
        reservedUntil,
        notes: input.notes || null,
        lines: { create: builtLines },
      },
      include: {
        lines: { include: { product: true } },
        customer: true,
        seller: { select: { id: true, name: true, email: true } },
      },
    });

    for (const line of builtLines) {
      const product = productMap.get(line.productId)!;
      const bal = await balancesAfter(tx, line.productId, product.stockOnHand);
      await tx.inventoryMovement.create({
        data: {
          productId: line.productId,
          type: MovementType.RESERVA,
          qty: line.qty,
          stockAfter: bal.stockAfter,
          availableAfter: bal.availableAfter,
          quoteId: quote.id,
          userId: input.sellerId,
          note: `Reserva cotización #${quote.number}`,
        },
      });
    }

    return quote;
  });
}

export async function confirmQuote(
  db: PrismaClient,
  quoteId: string,
  userId: string
) {
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: { lines: true },
    });

    if (quote.status !== QuoteStatus.RESERVED) {
      throw new Error("Solo se pueden confirmar cotizaciones reservadas.");
    }

    // El barrido de expiración solo corre al abrir ciertas páginas, así que
    // una reserva vencida puede seguir en RESERVED al llegar aquí.
    if (quote.reservedUntil && quote.reservedUntil.getTime() <= Date.now()) {
      throw new Error(
        "La reserva venció y el stock volvió a estar disponible. Crea una cotización nueva."
      );
    }

    for (const line of quote.lines) {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: line.productId },
      });
      if (product.stockOnHand < line.qty) {
        throw new Error(
          `Stock físico insuficiente para ${product.sku} al confirmar.`
        );
      }
      const next = product.stockOnHand - line.qty;
      await tx.product.update({
        where: { id: line.productId },
        data: { stockOnHand: next },
      });
      // After confirm, this quote is no longer RESERVED — compute reserved excluding it
      const reservedOthers = await getReservedQty(tx, line.productId, quote.id);
      await tx.inventoryMovement.create({
        data: {
          productId: line.productId,
          type: MovementType.CONFIRMACION_VENTA,
          qty: line.qty,
          stockAfter: next,
          availableAfter: next - reservedOthers,
          quoteId: quote.id,
          userId,
          note: `Confirmación cotización #${quote.number}`,
        },
      });
    }

    return tx.quote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.CONFIRMED, reservedUntil: null },
      include: {
        lines: { include: { product: true } },
        customer: true,
        seller: { select: { id: true, name: true, email: true } },
      },
    });
  });
}

export async function cancelQuote(
  db: PrismaClient,
  quoteId: string,
  userId: string,
  reason?: string
) {
  return db.$transaction(async (tx) => {
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: quoteId },
      include: { lines: true },
    });

    if (quote.status !== QuoteStatus.RESERVED && quote.status !== QuoteStatus.DRAFT) {
      throw new Error("Esta cotización no se puede cancelar.");
    }

    if (quote.status === QuoteStatus.RESERVED) {
      for (const line of quote.lines) {
        const product = await tx.product.findUniqueOrThrow({
          where: { id: line.productId },
        });
        const reservedOthers = await getReservedQty(tx, line.productId, quote.id);
        await tx.inventoryMovement.create({
          data: {
            productId: line.productId,
            type: MovementType.LIBERACION_RESERVA,
            qty: line.qty,
            stockAfter: product.stockOnHand,
            availableAfter: product.stockOnHand - reservedOthers,
            quoteId: quote.id,
            userId,
            note: reason || `Cancelación cotización #${quote.number}`,
          },
        });
      }
    }

    return tx.quote.update({
      where: { id: quoteId },
      data: { status: QuoteStatus.CANCELLED, reservedUntil: null },
      include: {
        lines: { include: { product: true } },
        customer: true,
        seller: { select: { id: true, name: true, email: true } },
      },
    });
  });
}

export async function expireReservedQuotes(db: PrismaClient) {
  const candidates = await db.quote.findMany({
    where: {
      status: QuoteStatus.RESERVED,
      reservedUntil: { lt: new Date() },
    },
    select: { id: true },
  });

  let count = 0;
  for (const { id } of candidates) {
    // Esta función corre al renderizar varias páginas, así que dos pestañas
    // pueden entrar a la vez, y el vendedor puede estar confirmando la
    // cotización justo ahora. Reclamamos la fila con un update condicional
    // dentro de la transacción: si alguien se nos adelantó, no tocamos nada.
    const expired = await db.$transaction(async (tx) => {
      const claimed = await tx.quote.updateMany({
        where: {
          id,
          status: QuoteStatus.RESERVED,
          reservedUntil: { lt: new Date() },
        },
        data: { status: QuoteStatus.EXPIRED, reservedUntil: null },
      });
      if (claimed.count === 0) return false;

      const quote = await tx.quote.findUniqueOrThrow({
        where: { id },
        include: { lines: true },
      });

      for (const line of quote.lines) {
        const product = await tx.product.findUniqueOrThrow({
          where: { id: line.productId },
        });
        const reservedOthers = await getReservedQty(tx, line.productId, quote.id);
        await tx.inventoryMovement.create({
          data: {
            productId: line.productId,
            type: MovementType.LIBERACION_RESERVA,
            qty: line.qty,
            stockAfter: product.stockOnHand,
            availableAfter: product.stockOnHand - reservedOthers,
            quoteId: quote.id,
            note: `Expiración automática cotización #${quote.number}`,
          },
        });
      }
      return true;
    });

    if (expired) count++;
  }
  return count;
}

export async function adjustStock(
  db: PrismaClient,
  input: {
    productId: string;
    qtyDelta: number;
    userId: string;
    note?: string;
  }
) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUniqueOrThrow({
      where: { id: input.productId },
    });
    const next = product.stockOnHand + input.qtyDelta;
    if (next < 0) throw new Error("El stock no puede quedar negativo.");

    const reserved = await getReservedQty(tx, input.productId);
    if (next < reserved) {
      throw new Error(
        `No se puede bajar el stock por debajo de las reservas activas (${reserved}).`
      );
    }

    const updated = await tx.product.update({
      where: { id: input.productId },
      data: { stockOnHand: next },
    });

    let type: MovementType = MovementType.AJUSTE;
    if (input.qtyDelta > 0) type = MovementType.ENTRADA;
    if (input.qtyDelta < 0) type = MovementType.SALIDA;

    await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        type,
        qty: Math.abs(input.qtyDelta),
        stockAfter: next,
        availableAfter: next - reserved,
        userId: input.userId,
        note:
          input.note ||
          `Ajuste de inventario (${input.qtyDelta > 0 ? "+" : ""}${input.qtyDelta})`,
      },
    });

    return updated;
  });
}

/** Signo visual del movimiento sobre stock/disponible. */
export function movementDelta(type: MovementType, qty: number): {
  stockDelta: number;
  availableDelta: number;
  label: string;
} {
  switch (type) {
    case "ENTRADA":
      return { stockDelta: qty, availableDelta: qty, label: `+${qty}` };
    case "SALIDA":
    case "CONFIRMACION_VENTA":
      return { stockDelta: -qty, availableDelta: -qty, label: `−${qty}` };
    case "RESERVA":
      return { stockDelta: 0, availableDelta: -qty, label: `−${qty} disp.` };
    case "LIBERACION_RESERVA":
      return { stockDelta: 0, availableDelta: qty, label: `+${qty} disp.` };
    default:
      return { stockDelta: 0, availableDelta: 0, label: `${qty}` };
  }
}
