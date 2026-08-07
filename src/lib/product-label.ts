import { COMPANY } from "./constants";

/** Nombre para mostrar: siempre termina con la marca KN GOLD. */
export function productDisplayName(name: string | null | undefined): string {
  const n = String(name || "").trim();
  const brand = COMPANY.brand;
  if (!n) return brand;
  if (n.toUpperCase().endsWith(brand.toUpperCase())) return n;
  return `${n} ${brand}`;
}
