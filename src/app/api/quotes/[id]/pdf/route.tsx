import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      seller: true,
      lines: { include: { product: true } },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  if (
    session.user.role !== Role.OWNER &&
    quote.sellerId !== session.user.id
  ) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(<QuoteDocument quote={quote} /> as any);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cotizacion-KN-${quote.number}.pdf"`,
    },
  });
}
