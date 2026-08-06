import type { Role } from "./types";

/** Dueño o administrador: operaciones (stock, pedidos, movimientos, etc.). */
export function isOpsManager(role: Role | string | undefined | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** Solo dueño: configuración, usuarios y licencia. */
export function isOwner(role: Role | string | undefined | null): boolean {
  return role === "OWNER";
}

/** Cuenta para el cupo del plan (además del dueño). */
export function countsTowardPlanSeats(role: Role): boolean {
  return role === "SELLER" || role === "ADMIN";
}

export function roleLabel(role: Role): string {
  if (role === "OWNER") return "Administración";
  if (role === "ADMIN") return "Administrador";
  return "Vendedor";
}
