import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listNotificationsBundle,
  markAllNotificationsRead,
} from "@/lib/notifications";

function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /RESOURCE_EXHAUSTED|Quota exceeded/i.test(msg);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { items, unread } = await listNotificationsBundle(session.user.id);
    return NextResponse.json({ items, unread });
  } catch (e) {
    if (isQuotaError(e)) {
      return NextResponse.json(
        { items: [], unread: 0, error: "quota" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}

export async function PATCH() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const marked = await markAllNotificationsRead(session.user.id);
    return NextResponse.json({ ok: true, marked });
  } catch (e) {
    if (isQuotaError(e)) {
      return NextResponse.json({ ok: false, error: "quota" }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
