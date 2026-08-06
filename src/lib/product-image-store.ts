import { getDb } from "./firebase";

const MAX_BYTES = 700_000; // bajo el límite de 1MB de un doc Firestore

export async function saveProductImage(input: {
  productId: string;
  sku: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  if (input.buffer.byteLength > MAX_BYTES) {
    throw new Error(
      "La foto es muy pesada. Usa una imagen más liviana (máx. ~700 KB)."
    );
  }
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(input.contentType)) {
    throw new Error("Formato no permitido. Usa JPG, PNG o WebP.");
  }

  const now = new Date().toISOString();
  await getDb()
    .collection("product_images")
    .doc(input.productId)
    .set({
      productId: input.productId,
      sku: input.sku,
      contentType: input.contentType,
      data: input.buffer.toString("base64"),
      bytes: input.buffer.byteLength,
      updatedAt: now,
      createdAt: now,
    });

  return `/api/product-image/${input.productId}`;
}

export async function getProductImage(productId: string): Promise<{
  contentType: string;
  buffer: Buffer;
} | null> {
  const doc = await getDb().collection("product_images").doc(productId).get();
  if (!doc.exists) return null;
  const data = doc.data() || {};
  const b64 = String(data.data || "");
  if (!b64) return null;
  return {
    contentType: String(data.contentType || "image/jpeg"),
    buffer: Buffer.from(b64, "base64"),
  };
}
