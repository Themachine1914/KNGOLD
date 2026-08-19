import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { getProductHistory } from "@/lib/inventory";
import { ProductHistoryDocument } from "@/lib/pdf/product-history-document";
import { fmtDate } from "@/lib/dates";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { sku } = await params;
  const history = await getProductHistory(sku);
  if (!history) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const { product, incoming, stats } = history;
  const reservedWarehouse = product.reserved ?? 0;
  const transitApartado = product.transitApartado ?? 0;

  const data = {
    generatedAt: new Date(),
    sku: product.sku,
    name: product.name,
    type: product.type,
    description: product.description,
    color: product.color,
    netPrice: product.netPrice,
    registeredStock: stats.registeredStock,
    registeredAt: stats.registeredAt,
    stockOnHand: product.stockOnHand,
    reservedWarehouse,
    availableWarehouse: product.available ?? 0,
    inTransit: product.inTransit ?? 0,
    transitApartado,
    availableTransit: product.availableTransit ?? 0,
    reservedTotal: reservedWarehouse + transitApartado,
    soldQty: stats.soldQty,
    incoming: incoming.map((lot) => ({
      number: lot.number,
      supplier: lot.supplier,
      eta: lot.eta ? fmtDate(lot.eta, "d MMM yyyy") : "",
      qty: lot.qty,
      reservedOnArrival: lot.reservedOnArrival,
      freeOnArrival: lot.freeOnArrival,
    })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(<ProductHistoryDocument data={data} /> as any);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="resumen-${product.sku}.pdf"`,
    },
  });
}
