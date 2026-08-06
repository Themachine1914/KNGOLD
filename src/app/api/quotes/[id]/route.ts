import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { getQuote, updateQuoteLines } from "@/lib/inventory";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  if (!isOpsManager(session.user.role) && quote.sellerId !== session.user.id) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const lines = Array.isArray(body.lines) ? body.lines : null;
    if (!lines) {
      return NextResponse.json({ error: "Líneas requeridas" }, { status: 400 });
    }

    const canOfferPrice = isOpsManager(session.user.role);
    const updated = await updateQuoteLines(
      id,
      session.user.id,
      lines.map((l: { productId: string; qty: number; unitPrice?: number }) => ({
        productId: String(l.productId),
        qty: Number(l.qty),
        ...(canOfferPrice && l.unitPrice != null
          ? { unitPrice: Number(l.unitPrice) }
          : {}),
      }))
    );

    return NextResponse.json({ ok: true, quote: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
