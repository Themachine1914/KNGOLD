/** Comprime una imagen en el navegador antes de subirla. */

export async function compressImageFile(
  file: File,
  opts?: { maxSide?: number; quality?: number }
): Promise<File> {
  const maxSide = opts?.maxSide ?? 1000;
  const quality = opts?.quality ?? 0.82;

  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo no es una imagen.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo comprimir la imagen."))),
      "image/jpeg",
      quality
    );
  });

  const base = file.name.replace(/\.[^.]+$/, "") || "producto";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
