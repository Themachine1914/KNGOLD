import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createReservedQuote } from "@/lib/inventory";

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

    if (!customer.name || !String(customer.name).trim()) {
      return NextResponse.json({ error: "El cliente es obligatorio" }, { status: 400 });
    }

    const quote = await createReservedQuote({
      sellerId: session.user.id,
      customer: {
        name: String(customer.name).trim(),
        rnc: customer.rnc ? String(customer.rnc) : undefined,
        phone: customer.phone ? String(customer.phone) : undefined,
        address: customer.address ? String(customer.address) : undefined,
        email: customer.email ? String(customer.email) : undefined,
      },
      includeItbis,
      notes: body.notes ? String(body.notes) : undefined,
      lines: lines.map((l: { productId: string; qty: number }) => ({
        productId: String(l.productId),
        qty: Number(l.qty),
      })),
    });

    return NextResponse.json({ ok: true, quote });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
