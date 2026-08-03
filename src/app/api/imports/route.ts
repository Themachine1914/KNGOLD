import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createImportOrder } from "@/lib/imports";
import { firstIssue, importInputSchema } from "@/lib/validation";
import { publicErrorMessage } from "@/lib/api-error";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Solo el dueño registra importaciones" }, { status: 403 });
  }

  try {
    const parsed = importInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
    }
    const { eta: etaRaw, ...rest } = parsed.data;

    // Con la Z el ancla es UTC. Sin ella se interpretaba en la zona del
    // servidor (UTC en Vercel, UTC-4 aquí) y la ETA se corría un día.
    const eta = new Date(`${etaRaw}T12:00:00Z`);
    if (Number.isNaN(eta.getTime())) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }

    const order = await createImportOrder({
      createdById: session.user.id,
      ...rest,
      eta,
    });

    return NextResponse.json({ ok: true, import: order });
  } catch (e) {
    const { message, status } = publicErrorMessage(e);
    return NextResponse.json({ error: message }, { status });
  }
}
