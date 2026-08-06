import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSeatInfo, revokeSupportUser, setUserActive } from "@/lib/users";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Solo el dueño" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    if (body.revokeSupport === true) {
      const user = await revokeSupportUser(id);
      const seats = await getSeatInfo();
      return NextResponse.json({ ok: true, user, seats });
    }

    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }

    const user = await setUserActive(id, body.active, session.user.id);
    const seats = await getSeatInfo();
    return NextResponse.json({ ok: true, user, seats });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
