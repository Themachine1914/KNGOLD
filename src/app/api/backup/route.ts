import { requireOwner } from "@/lib/auth";
import { buildFullBackupZip } from "@/lib/backup-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireOwner();
  } catch {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { filename, bytes } = await buildFullBackupZip();
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("backup failed", e);
    return Response.json(
      { error: "No se pudo generar el respaldo" },
      { status: 500 }
    );
  }
}
