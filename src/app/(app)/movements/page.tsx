import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireReservedQuotes, movementDelta } from "@/lib/inventory";
import { movementLabel, movementTone } from "@/lib/labels";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ProductThumb } from "@/components/product-thumb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default async function MovementsPage() {
  const session = await auth();
  if (session!.user.role !== Role.OWNER) redirect("/dashboard");

  await expireReservedQuotes(prisma);

  const movements = await prisma.inventoryMovement.findMany({
    take: 120,
    orderBy: { createdAt: "desc" },
    include: {
      product: true,
      user: true,
      quote: true,
    },
  });

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
            const isPhysicalDrop =
              m.type === "SALIDA" || m.type === "CONFIRMACION_VENTA";
            const isReserve = m.type === "RESERVA";

            return (
              <Card key={m.id} className="py-3">
                <div className="flex items-start gap-3">
                  <ProductThumb sku={m.product.sku} alt={m.product.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={movementTone(m.type)}>{movementLabel(m.type)}</Badge>
                      {m.quote ? (
                        <span className="text-xs text-muted">Cot. #{m.quote.number}</span>
                      ) : null}
                    </div>
                    <p className="font-semibold">
                      {m.product.sku} — {m.product.name}
                    </p>
                    <p className="text-sm text-muted">
                      {m.user?.name || "Sistema"} ·{" "}
                      {format(m.createdAt, "dd MMM · HH:mm", { locale: es })}
                    </p>
                    {m.note ? <p className="mt-1 text-xs text-muted">{m.note}</p> : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={`text-lg font-bold leading-none ${
                        delta.stockDelta < 0 || delta.availableDelta < 0
                          ? "text-danger"
                          : delta.stockDelta > 0 || delta.availableDelta > 0
                            ? "text-success"
                            : "text-ink"
                      }`}
                    >
                      {delta.label}
                    </p>
                    <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {isReserve || m.type === "LIBERACION_RESERVA"
                        ? "Disp."
                        : "Quedan"}
                    </p>
                    <p
                      className={`text-xl font-semibold leading-none ${
                        isPhysicalDrop || isReserve ? "text-ink" : "text-ink"
                      }`}
                    >
                      {isReserve || m.type === "LIBERACION_RESERVA"
                        ? m.availableAfter
                        : m.stockAfter}
                    </p>
                    {(isReserve || m.type === "LIBERACION_RESERVA") && (
                      <p className="mt-1 text-[10px] text-muted">
                        Físico {m.stockAfter}
                      </p>
                    )}
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
