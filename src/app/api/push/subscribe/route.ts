import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { removePushSubscription, savePushSubscription } from "@/lib/push";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const subscription = body.subscription;
    await savePushSubscription(
      session.user.id,
      subscription,
      req.headers.get("user-agent")
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const endpoint = String(body.endpoint || "");
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint requerido" }, { status: 400 });
    }
    await removePushSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
