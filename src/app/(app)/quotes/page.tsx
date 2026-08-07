import Link from "next/link";
import { auth } from "@/lib/auth";
import { listAppUsers } from "@/lib/audit";
import { isOpsManager } from "@/lib/roles";
import { expireReservedQuotes, listQuotes } from "@/lib/inventory";
import {
  compareByDate,
  hasActiveListFilters,
  inDateRange,
  matchesSearch,
  parseListFilters,
} from "@/lib/list-filters";
import { formatRD } from "@/lib/pricing";
import {
  conduceLabel,
  paymentTermsLabel,
  quoteStatusLabel,
  quoteStatusTone,
} from "@/lib/labels";
import { ListFiltersBar } from "@/components/list-filters-bar";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default async function QuotesPage({
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

  await expireReservedQuotes();
  const [allQuotes, users] = await Promise.all([
    listQuotes(isOwner ? undefined : session!.user.id),
    isOwner ? listAppUsers() : Promise.resolve([]),
  ]);

  const quotes = allQuotes
    .filter((q) => {
      if (isOwner && filters.userId && q.sellerId !== filters.userId) return false;
      if (!inDateRange(q.createdAt, filters.from, filters.to)) return false;
      return matchesSearch(
        [
          q.number,
          q.customer?.name,
          q.seller?.name,
          q.notes,
          quoteStatusLabel(q.status),
          ...(q.lines || []).flatMap((l) => [l.product?.sku, l.product?.name]),
        ],
        filters.q
      );
    })
    .sort((a, b) => compareByDate(a.createdAt, b.createdAt, filters.sort));

  const sellerOptions = users
    .filter((u) => u.role === "SELLER" || u.role === "ADMIN" || u.role === "OWNER")
    .map((u) => ({ id: u.id, name: u.name }));

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle={isOwner ? "Todas las reservas del equipo." : "Tus pedidos y reservas."}
        action={
          <Link href="/quotes/new">
            <Button className="px-3 py-2 text-xs">Nuevo pedido</Button>
          </Link>
        }
      />

      <ListFiltersBar
        basePath="/quotes"
        filters={filters}
        users={isOwner ? sellerOptions : undefined}
        userLabel="Vendedor"
        searchPlaceholder="Cliente, #pedido, vendedor…"
      />

      {quotes.length === 0 ? (
        <EmptyState
          title={hasActiveListFilters(filters) ? "Sin resultados" : "Aún no hay pedidos"}
          body={
            hasActiveListFilters(filters)
              ? "Prueba otro buscador, vendedor o rango de fechas."
              : "Crea uno al visitar un cliente."
          }
        />
      ) : (
        <div className="space-y-2">
          <p className="px-0.5 text-xs text-muted">
            {quotes.length} pedido{quotes.length === 1 ? "" : "s"}
          </p>
          {quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`}>
              <Card className="mb-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      #{q.number} · {q.customer?.name}
                    </p>
                    <p className="text-sm text-muted">
                      {(q.lines || []).length} ítems · {formatRD(q.total)} ·{" "}
                      {paymentTermsLabel(q.paymentTerms)} ·{" "}
                      {conduceLabel(q.includeItbis)}
                    </p>
                    {isOwner ? (
                      <p className="mt-1 text-xs text-muted">{q.seller?.name}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <Badge tone={quoteStatusTone(q.status)}>{quoteStatusLabel(q.status)}</Badge>
                    <p className="mt-2 text-xs text-muted">
                      {format(parseISO(q.createdAt), "dd MMM HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
