import { NextResponse } from "next/server";
import { expireReservedQuotes } from "@/lib/inventory";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET || process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await expireReservedQuotes();
  return NextResponse.json({ ok: true, expired: count });
}

export async function POST(req: Request) {
  return GET(req);
}
