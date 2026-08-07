import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { createReservedQuote } from "@/lib/inventory";
import { notifyOpsNewQuote } from "@/lib/notifications";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const customer = body.customer || {};
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const includeItbis = Boolean(body.includeItbis);
    const paymentTermsRaw = String(body.paymentTerms || "");
    const paymentTerms =
      paymentTermsRaw === "CREDITO_30" || paymentTermsRaw === "CONTADO"
        ? paymentTermsRaw
        : null;
    const canOfferPrice = isOpsManager(session.user.role);

    if (!customer.name || !String(customer.name).trim()) {
      return NextResponse.json({ error: "El cliente es obligatorio" }, { status: 400 });
    }
    if (!paymentTerms) {
      return NextResponse.json(
        { error: "Elige la condición de venta: al contado o crédito a 30 días." },
        { status: 400 }
      );
    }

    const customerName = String(customer.name).trim();
    const quote = await createReservedQuote({
      sellerId: session.user.id,
      customer: {
        name: customerName,
        rnc: customer.rnc ? String(customer.rnc) : undefined,
        phone: customer.phone ? String(customer.phone) : undefined,
        address: customer.address ? String(customer.address) : undefined,
        email: customer.email ? String(customer.email) : undefined,
      },
      includeItbis,
      paymentTerms,
      notes: body.notes ? String(body.notes) : undefined,
      lines: lines.map(
        (l: { productId: string; qty: number; unitPrice?: number }) => ({
          productId: String(l.productId),
          qty: Number(l.qty),
          ...(canOfferPrice && l.unitPrice != null
            ? { unitPrice: Number(l.unitPrice) }
            : {}),
        })
      ),
    });

    // Solo avisar a administración cuando un vendedor crea el pedido
    if (!isOpsManager(session.user.role)) {
      void notifyOpsNewQuote({
        actorId: session.user.id,
        actorName: session.user.name || "Vendedor",
        quoteId: quote.id,
        quoteNumber: quote.number,
        customerName,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, quote });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
