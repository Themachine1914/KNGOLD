import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/api-error";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { adjustStock } from "@/lib/inventory";
import { adjustInputSchema, firstIssue } from "@/lib/validation";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== Role.OWNER) {
    return NextResponse.json({ error: "Solo el dueño puede ajustar stock" }, { status: 403 });
  }

  try {
    const parsed = adjustInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
    }

    const product = await adjustStock(prisma, {
      ...parsed.data,
      userId: session.user.id,
    });

    return NextResponse.json({ ok: true, product });
  } catch (e) {
    const { message, status } = publicErrorMessage(e);
    return NextResponse.json({ error: message }, { status });
  }
}
