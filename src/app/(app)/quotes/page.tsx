import Link from "next/link";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireReservedQuotes } from "@/lib/inventory";
import { formatRD } from "@/lib/pricing";
import { quoteStatusLabel, quoteStatusTone } from "@/lib/labels";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default async function QuotesPage() {
  const session = await auth();
  const isOwner = session!.user.role === Role.OWNER;
  await expireReservedQuotes(prisma);

  const quotes = await prisma.quote.findMany({
    orderBy: { createdAt: "desc" },
    where: isOwner ? undefined : { sellerId: session!.user.id },
    include: { customer: true, seller: true, lines: true },
  });

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        subtitle={isOwner ? "Todas las reservas del equipo." : "Tus cotizaciones y reservas."}
        action={
          <Link href="/quotes/new">
            <Button className="px-3 py-2 text-xs">Nueva</Button>
          </Link>
        }
      />

      {quotes.length === 0 ? (
        <EmptyState
          title="Aún no hay cotizaciones"
          body="Crea una al visitar un cliente."
        />
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`}>
              <Card className="mb-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      #{q.number} · {q.customer.name}
                    </p>
                    <p className="text-sm text-muted">
                      {q.lines.length} ítems · {formatRD(q.total)} ·{" "}
                      {q.includeItbis ? "Con ITBIS" : "Sin ITBIS"}
                    </p>
                    {isOwner ? (
                      <p className="mt-1 text-xs text-muted">{q.seller.name}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <Badge tone={quoteStatusTone(q.status)}>
                      {quoteStatusLabel(q.status)}
                    </Badge>
                    <p className="mt-2 text-xs text-muted">
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
