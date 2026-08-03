import Link from "next/link";
import { QuoteStatus, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireReservedQuotes } from "@/lib/inventory";
import { formatRD } from "@/lib/pricing";
import { quoteStatusLabel, quoteStatusTone } from "@/lib/labels";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const FILTERS = [
  { value: "", label: "Todas" },
  { value: "RESERVED", label: "Reservadas" },
  { value: "CONFIRMED", label: "Confirmadas" },
  { value: "EXPIRED", label: "Expiradas" },
  { value: "CANCELLED", label: "Canceladas" },
];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  const isOwner = session!.user.role === Role.OWNER;
  await expireReservedQuotes(prisma);

  const params = await searchParams;
  const status = FILTERS.some((f) => f.value && f.value === params.status)
    ? (params.status as QuoteStatus)
    : undefined;

  const quotes = await prisma.quote.findMany({
    orderBy: { createdAt: "desc" },
    where: {
      ...(isOwner ? {} : { sellerId: session!.user.id }),
      ...(status ? { status } : {}),
    },
    include: { customer: true, seller: true, lines: true },
  });

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        subtitle={isOwner ? "Todas las reservas del equipo." : "Tus cotizaciones y reservas."}
        action={
          <Link href="/quotes/new">
            <Button variant="gold">Nueva</Button>
          </Link>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const active = (params.status || "") === f.value;
          return (
            <Link
              key={f.value || "all"}
              href={f.value ? `/quotes?status=${f.value}` : "/quotes"}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ${
                active ? "bg-ink text-white" : "border border-border bg-white text-muted"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          title={status ? "Nada en este filtro" : "Aún no hay cotizaciones"}
          body={status ? undefined : "Crea una al visitar un cliente."}
          action={
            <Link href="/quotes/new">
              <Button variant="gold">Nueva cotización</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="block">
              <Card className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      #{q.number} · {q.customer.name}
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                      {formatRD(q.total)}
                    </p>
                    <p className="text-sm text-muted">
                      {q.lines.length} ítems ·{" "}
                      {q.includeItbis ? "Con ITBIS" : "Sin ITBIS"}
                      {isOwner ? ` · ${q.seller.name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={quoteStatusTone(q.status)}>
                      {quoteStatusLabel(q.status)}
                    </Badge>
                    <p className="mt-2 text-sm text-muted">
                      {format(q.createdAt, "dd MMM HH:mm", { locale: es })}
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
