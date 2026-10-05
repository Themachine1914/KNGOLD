"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { compressImageFile } from "@/lib/compress-image";
import { Button } from "./ui";

export function ChangePhotoButton({ productId }: { productId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onPick(file: File | null) {
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      let compressed: File;
      try {
        compressed = await compressImageFile(file);
      } catch {
        setError("No se pudo leer la imagen.");
        return;
      }
      if (compressed.size > 700_000) {
        setError("La foto sigue muy pesada. Prueba otra más liviana.");
        return;
      }
      const form = new FormData();
      form.set("productId", productId);
      form.set("photo", compressed);
      const res = await fetch("/api/inventory/photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo cambiar la foto");
        return;
      }
      router.refresh();
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        loading={loading}
        onClick={() => inputRef.current?.click()}
      >
        Cambiar foto
      </Button>
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
