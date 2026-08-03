import type { ImportStatus, MovementType, QuoteStatus } from "@prisma/client";

export function quoteStatusLabel(status: QuoteStatus): string {
  const map: Record<QuoteStatus, string> = {
    DRAFT: "Borrador",
    RESERVED: "Reservada",
    CONFIRMED: "Confirmada",
    CANCELLED: "Cancelada",
    EXPIRED: "Expirada",
  };
  return map[status];
}

export function quoteStatusTone(
  status: QuoteStatus
): "neutral" | "gold" | "success" | "danger" | "warn" {
  const map: Record<QuoteStatus, "neutral" | "gold" | "success" | "danger" | "warn"> = {
    DRAFT: "neutral",
    RESERVED: "gold",
    CONFIRMED: "success",
    CANCELLED: "danger",
    EXPIRED: "warn",
  };
  return map[status];
}

export function movementLabel(type: MovementType): string {
  const map: Record<MovementType, string> = {
    ENTRADA: "Entrada",
    SALIDA: "Salida",
    AJUSTE: "Ajuste",
    RESERVA: "Reserva",
    LIBERACION_RESERVA: "Reserva liberada",
    CONFIRMACION_VENTA: "Venta confirmada",
  };
  return map[type];
}

export function movementTone(
  type: MovementType
): "neutral" | "gold" | "success" | "danger" | "warn" {
  // Una venta confirmada es el mejor evento del negocio: va en verde,
  // aunque el stock baje. El signo − ya comunica la salida.
  if (
    type === "ENTRADA" ||
    type === "LIBERACION_RESERVA" ||
    type === "CONFIRMACION_VENTA"
  ) {
    return "success";
  }
  if (type === "SALIDA") return "danger";
  if (type === "RESERVA") return "gold";
  return "warn";
}

export function importStatusLabel(status: ImportStatus): string {
  const map: Record<ImportStatus, string> = {
    ORDERED: "Encargado",
    IN_TRANSIT: "En tránsito",
    ARRIVED: "Llegó",
    CANCELLED: "Cancelado",
  };
  return map[status];
}

export function importStatusTone(
  status: ImportStatus
): "neutral" | "gold" | "success" | "danger" | "warn" {
  const map: Record<ImportStatus, "neutral" | "gold" | "success" | "danger" | "warn"> = {
    ORDERED: "neutral",
    IN_TRANSIT: "gold",
    ARRIVED: "success",
    CANCELLED: "danger",
  };
  return map[status];
}
