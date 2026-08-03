import Link from "next/link";
import { auth } from "@/lib/auth";
import { expireReservedQuotes, listQuotes } from "@/lib/inventory";
import { formatRD } from "@/lib/pricing";
import { quoteStatusLabel, quoteStatusTone } from "@/lib/labels";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import type { QuoteStatus } from "@/lib/types";

const FILTERS: { value: "" | QuoteStatus; label: string }[] = [
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
  const isOwner = session!.user.role === "OWNER";
  await expireReservedQuotes();

  const params = await searchParams;
  // Lista blanca: cualquier valor desconocido cae en "sin filtro" y nunca
  // llega a la capa de datos.
  const active = FILTERS.find((f) => f.value && f.value === params.status)?.value;

  const all = await listQuotes(isOwner ? undefined : session!.user.id);
  const quotes = active ? all.filter((q) => q.status === active) : all;

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        subtitle={isOwner ? "Todas las reservas del equipo." : "Tus cotizaciones y reservas."}
        action={
          <Link href="/quotes/new" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-ink transition hover:bg-gold-dark hover:text-white">
            Nueva
          </Link>
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const isActive = (active || "") === f.value;
          return (
            <Link
              key={f.value || "all"}
              href={f.value ? `/quotes?status=${f.value}` : "/quotes"}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ${
                isActive ? "bg-ink text-white" : "border border-border bg-white text-muted"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          title={active ? "Nada en este filtro" : "Aún no hay cotizaciones"}
          body={active ? undefined : "Crea una al visitar un cliente."}
          action={
            <Link href="/quotes/new" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-ink transition hover:bg-gold-dark hover:text-white">
              Nueva cotización
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
                      #{q.number} · {q.customer?.name}
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                      {formatRD(q.total)}
                    </p>
                    <p className="text-sm text-muted">
                      {(q.lines || []).length} ítems ·{" "}
                      {q.includeItbis ? "Con ITBIS" : "Sin ITBIS"}
                      {isOwner && q.seller?.name ? ` · ${q.seller.name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={quoteStatusTone(q.status)}>
                      {quoteStatusLabel(q.status)}
                    </Badge>
                    <p className="mt-2 text-sm text-muted">
                      {fmtDate(q.createdAt, "dd MMM HH:mm")}
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
