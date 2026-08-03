import { ImportStatus, MovementType, type PrismaClient } from "@prisma/client";
import { getReservedQty } from "./inventory";

export async function createImportOrder(
  db: PrismaClient,
  input: {
    createdById: string;
    supplier?: string;
    eta: Date;
    notes?: string;
    status?: ImportStatus;
    lines: { productId: string; qty: number }[];
  }
) {
  if (!input.lines.length) {
    throw new Error("El pedido debe tener al menos un producto.");
  }

  const wanted = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new Error("Cantidad inválida: debe ser un número entero positivo.");
    }
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.qty);
  }

  // El número se calculaba antes de abrir la transacción, así que dos
  // pedidos simultáneos chocaban contra el @unique con un error opaco.
  return db.$transaction(async (tx) => {
    const last = await tx.importOrder.findFirst({
      orderBy: { number: "desc" },
      select: { number: true },
    });

    return tx.importOrder.create({
      data: {
        number: (last?.number || 0) + 1,
        supplier: input.supplier?.trim() || null,
        eta: input.eta,
        notes: input.notes?.trim() || null,
        status: input.status || ImportStatus.ORDERED,
        createdById: input.createdById,
        lines: {
          create: [...wanted].map(([productId, qty]) => ({ productId, qty })),
        },
      },
      include: {
        lines: { include: { product: true } },
        createdBy: true,
      },
    });
  });
}

export async function updateImportStatus(
  db: PrismaClient,
  importId: string,
  status: ImportStatus
) {
  const existing = await db.importOrder.findUniqueOrThrow({
    where: { id: importId },
    select: { status: true, createdById: true },
  });
  if (existing.status === ImportStatus.ARRIVED) {
    throw new Error("Este pedido ya llegó; no se puede cambiar.");
  }
  if (existing.status === ImportStatus.CANCELLED) {
    throw new Error("Este pedido está cancelado.");
  }
  if (status === ImportStatus.ARRIVED) {
    return receiveImportOrder(db, importId, existing.createdById);
  }

  // Reclamamos el pedido en la misma operación en que lo cambiamos: entre
  // la lectura de arriba y este update, otro toque pudo marcarlo llegado.
  return db.$transaction(async (tx) => {
    const claimed = await tx.importOrder.updateMany({
      where: {
        id: importId,
        status: { in: [ImportStatus.ORDERED, ImportStatus.IN_TRANSIT] },
      },
      data: { status },
    });
    if (claimed.count === 0) {
      throw new Error("El pedido cambió de estado; recarga la página.");
    }
    return tx.importOrder.findUniqueOrThrow({
      where: { id: importId },
      include: {
        lines: { include: { product: true } },
        createdBy: true,
      },
    });
  });
}

/** Marca llegada e ingresa mercancía al inventario. */
export async function receiveImportOrder(
  db: PrismaClient,
  importId: string,
  userId: string
) {
  return db.$transaction(async (tx) => {
    const order = await tx.importOrder.findUniqueOrThrow({
      where: { id: importId },
      include: { lines: true },
    });

    if (order.status === ImportStatus.ARRIVED) {
      throw new Error("Este pedido ya fue recibido.");
    }
    if (order.status === ImportStatus.CANCELLED) {
      throw new Error("No se puede recibir un pedido cancelado.");
    }

    for (const line of order.lines) {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: line.productId },
      });
      const next = product.stockOnHand + line.qty;
      await tx.product.update({
        where: { id: line.productId },
        data: { stockOnHand: next },
      });
      const reserved = await getReservedQty(tx, line.productId);
      await tx.inventoryMovement.create({
        data: {
          productId: line.productId,
          type: MovementType.ENTRADA,
          qty: line.qty,
          stockAfter: next,
          availableAfter: next - reserved,
          userId,
          note: `Importación #${order.number} llegada`,
        },
      });
    }

    return tx.importOrder.update({
      where: { id: importId },
      data: {
        status: ImportStatus.ARRIVED,
        arrivedAt: new Date(),
      },
      include: {
        lines: { include: { product: true } },
        createdBy: true,
      },
    });
  });
}

export async function cancelImportOrder(db: PrismaClient, importId: string) {
  // Antes era leer-comprobar-escribir sin transacción: un doble toque sobre
  // "Confirmar llegada" y "Cancelar" podía dejar el pedido cancelado con la
  // mercancía ya ingresada al stock, y nada lo revertía.
  return db.$transaction(async (tx) => {
    const claimed = await tx.importOrder.updateMany({
      where: {
        id: importId,
        status: { in: [ImportStatus.ORDERED, ImportStatus.IN_TRANSIT] },
      },
      data: { status: ImportStatus.CANCELLED },
    });
    if (claimed.count === 0) {
      const order = await tx.importOrder.findUniqueOrThrow({
        where: { id: importId },
        select: { status: true },
      });
      throw new Error(
        order.status === ImportStatus.ARRIVED
          ? "No se puede cancelar un pedido ya recibido."
          : "Este pedido ya estaba cancelado."
      );
    }
    return tx.importOrder.findUniqueOrThrow({
      where: { id: importId },
      include: {
        lines: { include: { product: true } },
        createdBy: true,
      },
    });
  });
}
