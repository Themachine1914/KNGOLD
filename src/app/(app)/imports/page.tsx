import Link from "next/link";
import { auth } from "@/lib/auth";
import { listAppUsers } from "@/lib/audit";
import { isOpsManager } from "@/lib/roles";
import { listImports } from "@/lib/imports";
import {
  compareByDate,
  hasActiveListFilters,
  inDateRange,
  matchesSearch,
  parseListFilters,
} from "@/lib/list-filters";
import { importStatusLabel, importStatusTone } from "@/lib/labels";
import { ListFiltersBar } from "@/components/list-filters-bar";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { format, differenceInCalendarDays, isPast, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default async function ImportsPage({
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
  const isOwner = isOpsManager(session!.user.role);
  const filters = parseListFilters(await searchParams);

  const [allImports, users] = await Promise.all([
    listImports(),
    isOwner ? listAppUsers() : Promise.resolve([]),
  ]);

  const imports = allImports
    .filter((item) => {
      if (isOwner && filters.userId && item.createdById !== filters.userId) return false;
      // Rango sobre ETA (fecha de llegada estimada).
      if (!inDateRange(item.eta, filters.from, filters.to)) return false;
      return matchesSearch(
        [
          item.number,
          item.supplier,
          item.notes,
          item.createdBy?.name,
          importStatusLabel(item.status),
          ...(item.lines || []).flatMap((l) => [l.product?.sku, l.product?.name]),
        ],
        filters.q
      );
    })
    .sort((a, b) => compareByDate(a.eta, b.eta, filters.sort));

  const userOptions = users.map((u) => ({ id: u.id, name: u.name }));

  return (
    <div>
      <PageHeader
        title="Importaciones"
        subtitle="Mercancía en camino y fecha estimada de llegada."
        action={
          isOwner ? (
            <Link href="/imports/new">
              <Button className="px-3 py-2 text-xs">Nueva</Button>
            </Link>
          ) : null
        }
      />

      <ListFiltersBar
        basePath="/imports"
        filters={filters}
        users={isOwner ? userOptions : undefined}
        userLabel="Creado por"
        searchPlaceholder="Proveedor, #pedido, producto…"
      />

      {imports.length === 0 ? (
        <EmptyState
          title={
            hasActiveListFilters(filters) ? "Sin resultados" : "Sin pedidos de importación"
          }
          body={
            hasActiveListFilters(filters)
              ? "Prueba otro buscador, usuario o rango de fechas (ETA)."
              : isOwner
                ? "Registra el próximo contenedor o pedido."
                : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          <p className="px-0.5 text-xs text-muted">
            {imports.length} importación{imports.length === 1 ? "" : "es"}
          </p>
          {imports.map((item) => {
            const units = (item.lines || []).reduce((s, l) => s + l.qty, 0);
            const eta = parseISO(item.eta);
            const days = differenceInCalendarDays(eta, new Date());
            const late =
              item.status !== "ARRIVED" &&
              item.status !== "CANCELLED" &&
              isPast(eta);

            return (
              <Link key={item.id} href={`/imports/${item.id}`}>
                <Card className="mb-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        Pedido #{item.number}
                        {item.supplier ? ` · ${item.supplier}` : ""}
                      </p>
                      <p className="text-sm text-muted">
                        {(item.lines || []).length} electrodomésticos · {units} unidades
                      </p>
                      {isOwner && item.createdBy?.name ? (
                        <p className="mt-1 text-xs text-muted">{item.createdBy.name}</p>
                      ) : null}
                      <p className="mt-1 text-sm font-semibold text-ink">
                        ETA {format(eta, "dd MMM yyyy", { locale: es })}
                        {item.status !== "ARRIVED" && item.status !== "CANCELLED" ? (
                          <span className={late ? " text-danger" : " text-muted"}>
                            {" "}
                            ·{" "}
                            {late
                              ? `atrasado ${Math.abs(days)}d`
                              : days === 0
                                ? "llega hoy"
                                : `en ${days}d`}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Badge tone={importStatusTone(item.status)}>
                      {importStatusLabel(item.status)}
                    </Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
