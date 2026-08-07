import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { error: "Push no configurado" },
      { status: 503 }
    );
  }
  return NextResponse.json({ publicKey });
}
