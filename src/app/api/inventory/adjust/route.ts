import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { adjustStock } from "@/lib/inventory";
import { adjustInputSchema, firstIssue } from "@/lib/validation";
import { publicErrorMessage } from "@/lib/api-error";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Solo el dueño puede ajustar stock" }, { status: 403 });
  }

  try {
    const parsed = adjustInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
    }

    await adjustStock({
      ...parsed.data,
      userId: session.user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { message, status } = publicErrorMessage(e);
    return NextResponse.json({ error: message }, { status });
  }
}
