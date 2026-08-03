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

  if (!src) {
    return (
      <div
        className={`${sizes[size]} shrink-0 rounded-xl bg-border/50 flex items-center justify-center text-[10px] font-semibold text-muted`}
      >
        {sku}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`${sizes[size]} shrink-0 rounded-xl object-contain bg-white border border-border`}
    />
  );
}
