import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listAppUsers } from "@/lib/audit";
import { isOpsManager } from "@/lib/roles";
import { expireReservedQuotes, listMovements, movementDelta } from "@/lib/inventory";
import {
  compareByDate,
  hasActiveListFilters,
  inDateRange,
  matchesSearch,
  parseListFilters,
} from "@/lib/list-filters";
import { movementLabel, movementTone } from "@/lib/labels";
import { productDisplayName } from "@/lib/product-label";
import { ListFiltersBar } from "@/components/list-filters-bar";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ProductThumb } from "@/components/product-thumb";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    userId?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}) {
  const session = await auth();
  if (!isOpsManager(session!.user.role)) redirect("/dashboard");

  const filters = parseListFilters(await searchParams);
  await expireReservedQuotes();

  const [allMovements, users] = await Promise.all([
    listMovements(400),
    listAppUsers(),
  ]);

  const movements = allMovements
    .filter((m) => {
      if (filters.userId && m.userId !== filters.userId) return false;
      if (!inDateRange(m.createdAt, filters.from, filters.to)) return false;
      return matchesSearch(
        [
          m.product?.sku,
          m.product?.name,
          m.user?.name,
          m.note,
          m.quote?.number,
          movementLabel(m.type),
        ],
        filters.q
      );
    })
    .sort((a, b) => compareByDate(a.createdAt, b.createdAt, filters.sort));

  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));

  return (
    <div>
      <PageHeader
        title="Movimientos"
        subtitle="Cada cambio muestra cuánto resta y cuánto queda."
      />

      <ListFiltersBar
        basePath="/movements"
        filters={filters}
        users={userOptions}
        userLabel="Usuario"
        searchPlaceholder="Código, producto, nota, usuario…"
      />

      {movements.length === 0 ? (
        <EmptyState
          title={hasActiveListFilters(filters) ? "Sin resultados" : "Sin movimientos aún"}
          body={
            hasActiveListFilters(filters)
              ? "Prueba otro buscador, usuario o rango de fechas."
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          <p className="px-0.5 text-xs text-muted">
            {movements.length} movimiento{movements.length === 1 ? "" : "s"}
          </p>
          {movements.map((m) => {
            const delta = movementDelta(m.type, m.qty);
            const remaining = delta.availableFocus ? m.availableAfter : m.stockAfter;
            return (
              <Card key={m.id} className="py-3">
                <div className="flex items-start gap-3">
                  <ProductThumb
                    sku={m.product?.sku || "?"}
                    alt={productDisplayName(m.product?.name)}
                    imageUrl={m.product?.imageUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge tone={movementTone(m.type)}>{movementLabel(m.type)}</Badge>
                      {m.quote ? (
                        <span className="text-xs text-muted">
                          Pedido #{m.quote.number}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-semibold">
                      {m.product?.sku} — {productDisplayName(m.product?.name)}
                    </p>
                    <p className="text-sm text-muted">
                      {m.user?.name || "Sistema"} ·{" "}
                      {format(parseISO(m.createdAt), "dd MMM · HH:mm", { locale: es })}
                    </p>
                    {m.note ? <p className="mt-1 text-xs text-muted">{m.note}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    {m.type === "CAMBIO_PRECIO" ? (
                      <p className="max-w-[9rem] text-right text-xs font-semibold leading-snug text-gold-dark">
                        {m.note || "Precio actualizado"}
                      </p>
                    ) : (
                      <>
                        <p className="text-lg font-bold leading-none text-ink">{delta.label}</p>
                        <p className="mt-1.5 text-[11px] font-medium tracking-wide text-muted">
                          {delta.availableFocus ? "Disp." : "Quedan"}
                        </p>
                        <p className="text-xl font-semibold leading-none">{remaining}</p>
                      </>
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
