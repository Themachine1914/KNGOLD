import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSupportUser, getSeatInfo } from "@/lib/users";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Solo el dueño" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const user = await createSupportUser({
      name: body.name ? String(body.name) : undefined,
      email: String(body.email || ""),
      password: String(body.password || ""),
      hours: body.hours != null ? Number(body.hours) : 48,
    });
    const seats = await getSeatInfo();
    return NextResponse.json({ ok: true, user, seats });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
