import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmQuote, getQuote } from "@/lib/inventory";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getQuote(id);
  if (!existing) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  if (session.user.role !== "OWNER" && existing.sellerId !== session.user.id) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    await confirmQuote(id, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
