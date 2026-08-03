/** Fotos bajadas de kngold.com.do (WooCommerce) mapeadas por SKU del sistema. */
export const PRODUCT_IMAGES: Record<string, string> = {
  "KN-SF1": "/products/KN-SF1.webp",
  "KN-0151": "/products/KN-0151.webp",
  "KN-76N": "/products/KN-76N.webp",
  "KN-76G": "/products/KN-76G.webp",
  "KN-6201": "/products/KN-6201.webp",
  "KN-7600": "/products/KN-7600.webp",
  "KN-60X": "/products/KN-60X.webp",
  "KN-80X": "/products/KN-80X.png",
  "KN-18": "/products/KN-18.png",
  "KN-22": "/products/KN-22.png",
  "KN-30": "/products/KN-30.png",
  "KN-560": "/products/KN-560.webp",
};

export function productImage(sku: string): string | null {
  return PRODUCT_IMAGES[sku] || null;
}
