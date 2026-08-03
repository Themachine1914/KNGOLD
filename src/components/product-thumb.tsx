import Image from "next/image";
import { productImage } from "@/lib/product-images";

export function ProductThumb({
  sku,
  alt,
  size = "md",
}: {
  sku: string;
  alt: string;
  size?: "sm" | "md" | "lg";
}) {
  const src = productImage(sku);
  const sizes = {
    sm: "h-12 w-12",
    md: "h-16 w-16",
    lg: "h-20 w-20",
  };
  const px = { sm: 48, md: 64, lg: 80 }[size];

  if (!src) {
    return (
      <div
        className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-xl bg-border/50 text-[10px] font-semibold text-muted`}
      >
        {sku}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={px}
      height={px}
      className={`${sizes[size]} shrink-0 rounded-xl border border-border bg-white object-contain`}
    />
  );
}
