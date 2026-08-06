import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { adjustStock } from "@/lib/inventory";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isOpsManager(session.user.role)) {
    return NextResponse.json(
      { error: "Solo dueño o administrador puede ajustar stock" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const productId = String(body.productId || "");
    const qtyDelta = Number(body.qtyDelta);
    const note = body.note ? String(body.note) : undefined;

    if (!productId || !Number.isFinite(qtyDelta) || qtyDelta === 0) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    await adjustStock({
      productId,
      qtyDelta,
      userId: session.user.id,
      note,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
