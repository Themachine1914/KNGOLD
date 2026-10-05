import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/firebase";
import { isOpsManager } from "@/lib/roles";
import { saveProductImage } from "@/lib/product-image-store";

const MAX_UPLOAD = 700_000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isOpsManager(session.user.role)) {
    return NextResponse.json(
      { error: "Solo dueño o administrador puede cambiar fotos" },
      { status: 403 }
    );
  }

  try {
    const form = await req.formData();
    const productId = String(form.get("productId") || "");
    const file = form.get("photo");
    if (!productId || !file || typeof file !== "object" || !("arrayBuffer" in file)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const f = file as File;
    if (f.size === 0) {
      return NextResponse.json({ error: "La foto está vacía." }, { status: 400 });
    }
    if (f.size > MAX_UPLOAD) {
      return NextResponse.json(
        { error: "La foto es muy pesada. Máximo ~700 KB." },
        { status: 400 }
      );
    }

    const ref = getDb().collection("products").doc(productId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const url = await saveProductImage({
      productId,
      sku: String(snap.data()?.sku || productId),
      buffer: Buffer.from(await f.arrayBuffer()),
      contentType: f.type || "image/jpeg",
    });
    // ?v= rompe la caché del navegador (la ruta de imagen cachea 1 día).
    const imageUrl = `${url}?v=${Date.now()}`;
    await ref.update({ imageUrl, updatedAt: new Date().toISOString() });

    return NextResponse.json({ ok: true, imageUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
