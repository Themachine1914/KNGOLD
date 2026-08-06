import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { cancelImportOrder } from "@/lib/imports";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !isOpsManager(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const order = await cancelImportOrder(id);
    return NextResponse.json({ ok: true, import: order });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
