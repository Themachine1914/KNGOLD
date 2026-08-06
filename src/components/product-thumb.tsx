"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { productImage } from "@/lib/product-images";

export function ProductThumb({
  sku,
  alt,
  imageUrl,
  size = "md",
}: {
  sku: string;
  alt: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const src = productImage(sku, imageUrl);
  const [open, setOpen] = useState(false);
  const sizes = {
    sm: "h-12 w-12",
    md: "h-16 w-16",
    lg: "h-20 w-20",
  };
  const px = { sm: 48, md: 64, lg: 80 }[size];
  const isRemote = !!src && (src.startsWith("http://") || src.startsWith("https://"));
  const isApi = !!src && src.startsWith("/api/");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!src) {
    return (
      <div
        className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-2xl bg-border/50 text-[10px] font-semibold text-muted`}
      >
        {sku}
      </div>
    );
  }

  const img = isRemote || isApi ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="h-full w-full object-contain" />
  ) : (
    <Image
      src={src}
      alt={alt}
      width={px}
      height={px}
      className="h-full w-full object-contain"
    />
  );

  const imgLarge = isRemote || isApi ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="mx-auto max-h-[75dvh] w-auto object-contain"
    />
  ) : (
    <Image
      src={src}
      alt={alt}
      width={800}
      height={800}
      className="mx-auto max-h-[75dvh] w-auto object-contain"
      priority
    />
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${sizes[size]} shrink-0 overflow-hidden rounded-2xl border border-border bg-white p-0`}
        aria-label={`Ver imagen de ${alt || sku}`}
      >
        {img}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={alt || sku}
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-10 min-h-11 min-w-11 rounded-full bg-white/15 text-xl font-semibold text-white"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
          >
            ×
          </button>
          <div
            className="relative max-h-[85dvh] w-full max-w-lg overflow-hidden rounded-2xl bg-white p-3"
            onClick={(e) => e.stopPropagation()}
          >
            {imgLarge}
            {alt || sku ? (
              <p className="mt-2 text-center text-sm font-semibold text-ink">
                {alt || sku}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
