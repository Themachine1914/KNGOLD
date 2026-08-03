import { NextResponse } from "next/server";
import { expireReservedQuotes } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET || process.env.AUTH_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    // Allow unauthenticated in local/dev for simplicity when no header sent
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const count = await expireReservedQuotes(prisma);
  return NextResponse.json({ ok: true, expired: count });
}

export async function POST(req: Request) {
  return GET(req);
}
