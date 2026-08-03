import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/api-error";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmQuote } from "@/lib/inventory";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  if (
    session.user.role !== Role.OWNER &&
    existing.sellerId !== session.user.id
  ) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const quote = await confirmQuote(prisma, id, session.user.id);
    return NextResponse.json({ ok: true, quote });
  } catch (e) {
    const { message, status } = publicErrorMessage(e);
    return NextResponse.json({ error: message }, { status });
  }
}
