import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createReservedQuote } from "@/lib/inventory";
import { firstIssue, quoteInputSchema } from "@/lib/validation";
import { publicErrorMessage } from "@/lib/api-error";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const parsed = quoteInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
    }
    // `existingId` lo acepta el esquema pero la capa de datos aún no lo usa:
    // hoy toda cotización crea un cliente nuevo.
    const { existingId, ...customer } = parsed.data.customer;
    void existingId;

    const quote = await createReservedQuote({
      sellerId: session.user.id,
      ...parsed.data,
      customer,
    });

    return NextResponse.json({ ok: true, quote });
  } catch (e) {
    const { message, status } = publicErrorMessage(e);
    return NextResponse.json({ error: message }, { status });
  }
}
