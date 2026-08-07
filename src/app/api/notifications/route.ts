import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
} from "@/lib/notifications";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const [items, unread] = await Promise.all([
    listNotificationsForUser(session.user.id),
    countUnreadNotifications(session.user.id),
  ]);

  return NextResponse.json({ items, unread });
}

export async function PATCH() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const marked = await markAllNotificationsRead(session.user.id);
  return NextResponse.json({ ok: true, marked });
}
