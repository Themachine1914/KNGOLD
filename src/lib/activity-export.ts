import type { MovementType, Role } from "./types";

export type AppUserSummary = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};

export type UserActivityRow = {
  id: string;
  createdAt: string;
  userId: string;
  userName: string;
  type: MovementType;
  actionLabel: string;
  productSku: string;
  productName: string;
  qty: number;
  quoteId: string | null;
  quoteNumber: number | null;
  note: string | null;
};

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildActivityCsv(rows: UserActivityRow[]): string {
  const header = [
    "Fecha",
    "Hora",
    "Usuario",
    "Accion",
    "SKU",
    "Producto",
    "Cantidad",
    "Cotizacion",
    "Nota",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const fecha = d.toISOString().slice(0, 10);
    const hora = d.toISOString().slice(11, 19);
    lines.push(
      [
        csvEscape(fecha),
        csvEscape(hora),
        csvEscape(r.userName),
        csvEscape(r.actionLabel),
        csvEscape(r.productSku),
        csvEscape(r.productName),
        csvEscape(r.qty),
        csvEscape(r.quoteNumber != null ? `#${r.quoteNumber}` : ""),
        csvEscape(r.note),
      ].join(",")
    );
  }
  return lines.join("\n");
}
