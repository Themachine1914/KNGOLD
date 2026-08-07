import { buildCsv } from "./csv";
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

export function buildActivityCsv(rows: UserActivityRow[]): string {
  return buildCsv(
    [
      "Fecha",
      "Hora",
      "Usuario",
      "Accion",
      "Código",
      "Producto",
      "Cantidad",
      "Pedido",
      "Nota",
    ],
    rows.map((r) => {
      const d = new Date(r.createdAt);
      return [
        d.toISOString().slice(0, 10),
        d.toISOString().slice(11, 19),
        r.userName,
        r.actionLabel,
        r.productSku,
        r.productName,
        r.qty,
        r.quoteNumber != null ? `#${r.quoteNumber}` : "",
        r.note,
      ];
    })
  );
}
