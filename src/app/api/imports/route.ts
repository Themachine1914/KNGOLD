import { NextResponse } from "next/server";
import { ImportStatus, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createImportOrder } from "@/lib/imports";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== Role.OWNER) {
    return NextResponse.json({ error: "Solo el dueño registra importaciones" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const etaRaw = String(body.eta || "");
    if (!etaRaw) {
      return NextResponse.json({ error: "Fecha ETA requerida" }, { status: 400 });
    }

    const eta = new Date(`${etaRaw}T12:00:00`);
    if (Number.isNaN(eta.getTime())) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }

    const status =
      body.status === "IN_TRANSIT" ? ImportStatus.IN_TRANSIT : ImportStatus.ORDERED;

    const order = await createImportOrder(prisma, {
      createdById: session.user.id,
      supplier: body.supplier ? String(body.supplier) : undefined,
      eta,
      notes: body.notes ? String(body.notes) : undefined,
      status,
      lines: lines.map((l: { productId: string; qty: number }) => ({
        productId: String(l.productId),
        qty: Number(l.qty),
      })),
    });

    return NextResponse.json({ ok: true, import: order });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
