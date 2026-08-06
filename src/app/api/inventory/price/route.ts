import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { updateProductPrice } from "@/lib/inventory";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isOpsManager(session.user.role)) {
    return NextResponse.json(
      { error: "Solo dueño o administrador puede cambiar precios" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const productId = String(body.productId || "");
    const netPrice = Number(body.netPrice);
    const listPrice =
      body.listPrice != null && body.listPrice !== ""
        ? Number(body.listPrice)
        : undefined;

    if (!productId || !Number.isFinite(netPrice)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const product = await updateProductPrice({
      productId,
      netPrice,
      listPrice,
      userId: session.user.id,
    });

    return NextResponse.json({ ok: true, product });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
