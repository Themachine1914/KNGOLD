import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { expireReservedQuotes, listMovements, movementDelta } from "@/lib/inventory";
import { movementLabel, movementTone } from "@/lib/labels";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ProductThumb } from "@/components/product-thumb";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default async function MovementsPage() {
  const session = await auth();
  if (session!.user.role !== "OWNER") redirect("/dashboard");

  await expireReservedQuotes();
  const movements = await listMovements(120);

  return (
    <div>
      <PageHeader
        title="Movimientos"
        subtitle="Cada cambio muestra cuánto resta y cuánto queda."
      />

      {movements.length === 0 ? (
        <EmptyState title="Sin movimientos aún" />
      ) : (
        <div className="space-y-2">
          {movements.map((m) => {
            const delta = movementDelta(m.type, m.qty);
            const remaining = delta.availableFocus ? m.availableAfter : m.stockAfter;
            return (
              <Card key={m.id} className="py-3">
                <div className="flex items-start gap-3">
                  <ProductThumb sku={m.product?.sku || "?"} alt={m.product?.name || ""} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={movementTone(m.type)}>{movementLabel(m.type)}</Badge>
                      {m.quote ? (
                        <span className="text-xs text-muted">Cot. #{m.quote.number}</span>
                      ) : null}
                    </div>
                    <p className="font-semibold">
                      {m.product?.sku} — {m.product?.name}
                    </p>
                    <p className="text-sm text-muted">
                      {m.user?.name || "Sistema"} ·{" "}
                      {format(parseISO(m.createdAt), "dd MMM · HH:mm", { locale: es })}
                    </p>
                    {m.note ? <p className="mt-1 text-sm text-muted">{m.note}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-lg font-semibold leading-none tabular-nums ${
                        delta.label.startsWith("−") ? "text-danger" : "text-success"
                      }`}
                    >
                      {delta.label}
                    </p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {delta.availableFocus ? "Disponible" : "Físico"}
                    </p>
                    <p className="text-2xl font-semibold leading-none tabular-nums text-ink">
                      {remaining}
                    </p>
                    {delta.availableFocus ? (
                      <p className="mt-1 text-sm text-muted">
                        Físico <span className="tabular-nums">{m.stockAfter}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
