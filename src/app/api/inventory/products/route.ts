import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb, newId } from "@/lib/firebase";
import { isOpsManager } from "@/lib/roles";
import { createProduct } from "@/lib/inventory";
import { saveProductImage } from "@/lib/product-image-store";

const MAX_UPLOAD = 700_000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isOpsManager(session.user.role)) {
    return NextResponse.json(
      { error: "Solo la administración puede crear productos" },
      { status: 403 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let sku = "";
    let name = "";
    let type = "";
    let description: string | undefined;
    let color: string | undefined;
    let listPrice = NaN;
    let netPrice = NaN;
    let stockOnHand = 0;
    let photo: { buffer: Buffer; contentType: string } | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      sku = String(form.get("sku") || "");
      name = String(form.get("name") || "");
      type = String(form.get("type") || "");
      description =
        form.get("description") != null ? String(form.get("description")) : undefined;
      color = form.get("color") != null ? String(form.get("color")) : undefined;
      listPrice = Number(form.get("listPrice"));
      netPrice = Number(form.get("netPrice"));
      stockOnHand =
        form.get("stockOnHand") != null && String(form.get("stockOnHand")) !== ""
          ? Number(form.get("stockOnHand"))
          : 0;

      const file = form.get("photo");
      if (file && typeof file === "object" && "arrayBuffer" in file) {
        const f = file as File;
        if (f.size > 0) {
          if (f.size > MAX_UPLOAD) {
            return NextResponse.json(
              { error: "La foto es muy pesada. Máximo ~700 KB." },
              { status: 400 }
            );
          }
          photo = {
            buffer: Buffer.from(await f.arrayBuffer()),
            contentType: f.type || "image/jpeg",
          };
        }
      }
    } else {
      const body = await req.json();
      sku = String(body.sku || "");
      name = String(body.name || "");
      type = String(body.type || "");
      description = body.description != null ? String(body.description) : undefined;
      color = body.color != null ? String(body.color) : undefined;
      listPrice = Number(body.listPrice);
      netPrice = Number(body.netPrice);
      stockOnHand =
        body.stockOnHand != null && body.stockOnHand !== ""
          ? Number(body.stockOnHand)
          : 0;
    }

    const normalizedSku = sku.trim().toUpperCase();
    if (normalizedSku) {
      const clash = await getDb()
        .collection("products")
        .where("sku", "==", normalizedSku)
        .limit(1)
        .get();
      if (!clash.empty) {
        return NextResponse.json(
          { error: `Ya existe un producto con el código ${normalizedSku}.` },
          { status: 400 }
        );
      }
    }

    const id = newId();
    let imageUrl: string | null = null;
    if (photo) {
      imageUrl = await saveProductImage({
        productId: id,
        sku: normalizedSku || id,
        buffer: photo.buffer,
        contentType: photo.contentType,
      });
    }

    const product = await createProduct({
      id,
      sku,
      name,
      type,
      description,
      color,
      listPrice,
      netPrice,
      stockOnHand,
      userId: session.user.id,
      imageUrl,
    });

    return NextResponse.json({ ok: true, product });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 }
    );
  }
}
