import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/api-error";
import { ImportStatus, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateImportStatus } from "@/lib/imports";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== Role.OWNER) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const order = await updateImportStatus(prisma, id, ImportStatus.IN_TRANSIT);
    return NextResponse.json({ ok: true, import: order });
  } catch (e) {
    const { message, status } = publicErrorMessage(e);
    return NextResponse.json({ error: message }, { status });
  }
}
