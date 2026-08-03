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
  for (const line of input.lines) {
    if (line.qty <= 0) throw new Error("Cantidad inválida.");
  }

  const last = await db.importOrder.findFirst({
    orderBy: { number: "desc" },
    select: { number: true },
  });

  return db.importOrder.create({
    data: {
      number: (last?.number || 0) + 1,
      supplier: input.supplier?.trim() || null,
      eta: input.eta,
      notes: input.notes?.trim() || null,
      status: input.status || ImportStatus.ORDERED,
      createdById: input.createdById,
      lines: {
        create: input.lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
        })),
      },
    },
    include: {
      lines: { include: { product: true } },
      createdBy: true,
    },
  });
}

export async function updateImportStatus(
  db: PrismaClient,
  importId: string,
  status: ImportStatus
) {
  const existing = await db.importOrder.findUniqueOrThrow({
    where: { id: importId },
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

  return db.importOrder.update({
    where: { id: importId },
    data: { status },
    include: {
      lines: { include: { product: true } },
      createdBy: true,
    },
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
  const order = await db.importOrder.findUniqueOrThrow({
    where: { id: importId },
  });
  if (order.status === ImportStatus.ARRIVED) {
    throw new Error("No se puede cancelar un pedido ya recibido.");
  }
  return db.importOrder.update({
    where: { id: importId },
    data: { status: ImportStatus.CANCELLED },
    include: {
      lines: { include: { product: true } },
      createdBy: true,
    },
  });
}
