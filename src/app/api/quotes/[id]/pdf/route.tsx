import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { getQuote } from "@/lib/inventory";
import { QuoteDocument } from "@/lib/pdf/quote-document";

export async function GET(
  _req: Request,
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
  if (session.user.role !== "OWNER" && quote.sellerId !== session.user.id) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const pdfQuote = {
    number: quote.number,
    includeItbis: quote.includeItbis,
    subtotal: quote.subtotal,
    itbisAmount: quote.itbisAmount,
    total: quote.total,
    createdAt: new Date(quote.createdAt),
    reservedUntil: quote.reservedUntil ? new Date(quote.reservedUntil) : null,
    status: quote.status,
    customer: {
      name: quote.customer?.name || "",
      rnc: quote.customer?.rnc || null,
      phone: quote.customer?.phone || null,
      address: quote.customer?.address || null,
    },
    seller: { name: quote.seller?.name || "" },
    lines: (quote.lines || []).map((line) => ({
      qty: line.qty,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      product: {
        sku: line.product?.sku || "",
        name: line.product?.name || "",
      },
    })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(<QuoteDocument quote={pdfQuote} /> as any);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cotizacion-KN-${quote.number}.pdf"`,
    },
  });
}
