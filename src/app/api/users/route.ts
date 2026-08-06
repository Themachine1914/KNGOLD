import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createPlanUser, getSeatInfo, listManagedUsers } from "@/lib/users";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Solo el dueño" }, { status: 403 });
  }

  const [users, seats] = await Promise.all([listManagedUsers(), getSeatInfo()]);
  return NextResponse.json({ users, seats });
}

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
    const requested = String(body.role || "SELLER").toUpperCase();
    const role = requested === "ADMIN" ? "ADMIN" : "SELLER";
    const user = await createPlanUser({
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      role,
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
