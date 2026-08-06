import { NextResponse } from "next/server";
import { getLicense, setLicenseMaxUsers } from "@/lib/users";

/**
 * Ampliar cupo de usuarios (solo proveedor).
 * Header: x-provider-key = PROVIDER_ADMIN_KEY
 * Body: { maxUsers: number, note?: string }
 */
export async function GET(req: Request) {
  const key = req.headers.get("x-provider-key") || "";
  const expected = process.env.PROVIDER_ADMIN_KEY || "";
  if (!expected || key !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const license = await getLicense();
  return NextResponse.json({ license });
}

export async function POST(req: Request) {
  const key = req.headers.get("x-provider-key") || "";
  const expected = process.env.PROVIDER_ADMIN_KEY || "";
  if (!expected || key !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const license = await setLicenseMaxUsers(
      Number(body.maxUsers),
      body.note ? String(body.note) : undefined
    );
    return NextResponse.json({ ok: true, license });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
