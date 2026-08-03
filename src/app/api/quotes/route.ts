import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/api-error";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createReservedQuote } from "@/lib/inventory";
import { firstIssue, quoteInputSchema } from "@/lib/validation";

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

    const quote = await createReservedQuote(prisma, {
      sellerId: session.user.id,
      ...parsed.data,
    });

    return NextResponse.json({ ok: true, quote });
  } catch (e) {
    const { message, status } = publicErrorMessage(e);
    return NextResponse.json({ error: message }, { status });
  }
}
