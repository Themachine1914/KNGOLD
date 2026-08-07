import type { ImportStatus, MovementType, PaymentTerms, QuoteStatus } from "./types";

/** C/C = con conduce · S/C = sin conduce (campo includeItbis). */
export function conduceLabel(includeItbis: boolean): string {
  return includeItbis ? "C/C" : "S/C";
}

/** @deprecated usar conduceLabel */
export function comprobanteLabel(includeItbis: boolean): string {
  return conduceLabel(includeItbis);
}

export function paymentTermsLabel(
  terms: PaymentTerms | string | null | undefined
): string {
  if (terms === "CREDITO_30") return "Crédito a 30 días";
  if (terms === "CONTADO") return "Al contado";
  return "—";
}

export function quoteStatusLabel(status: QuoteStatus): string {
  const map: Record<QuoteStatus, string> = {
    DRAFT: "Borrador",
    RESERVED: "Reservada",
    CONFIRMED: "Facturada",
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
    LIBERACION_RESERVA: "Liberación",
    CONFIRMACION_VENTA: "Venta confirmada",
    ANULACION_VENTA: "Venta anulada",
    CAMBIO_PRECIO: "Cambio de precio",
  };
  return map[type];
}

export function movementTone(
  type: MovementType
): "neutral" | "gold" | "success" | "danger" | "warn" {
  if (
    type === "ENTRADA" ||
    type === "LIBERACION_RESERVA" ||
    type === "ANULACION_VENTA"
  ) {
    return "success";
  }
  if (type === "SALIDA" || type === "CONFIRMACION_VENTA") return "danger";
  if (type === "RESERVA" || type === "CAMBIO_PRECIO") return "gold";
  return "warn";
}

export function importStatusLabel(status: ImportStatus): string {
  const map: Record<ImportStatus, string> = {
    ORDERED: "Pedido",
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
