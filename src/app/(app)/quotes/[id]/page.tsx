import Link from "next/link";
import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatRD } from "@/lib/pricing";
import { quoteStatusLabel, quoteStatusTone } from "@/lib/labels";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { QuoteActions } from "@/components/quote-actions";
import { ProductThumb } from "@/components/product-thumb";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      seller: true,
      lines: { include: { product: true } },
    },
  });

  if (!quote) notFound();
  if (
    session!.user.role !== Role.OWNER &&
    quote.sellerId !== session!.user.id
  ) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        title={`Cotización #${quote.number}`}
        subtitle={quote.customer.name}
        action={<Badge tone={quoteStatusTone(quote.status)}>{quoteStatusLabel(quote.status)}</Badge>}
      />

      <div className="space-y-3">
        <Card className="space-y-1 text-sm">
          <p>
            <span className="text-muted">Vendedor:</span> {quote.seller.name}
          </p>
          {quote.customer.rnc ? (
            <p>
              <span className="text-muted">RNC:</span> {quote.customer.rnc}
            </p>
          ) : null}
          {quote.customer.phone ? (
            <p>
              <span className="text-muted">Tel:</span> {quote.customer.phone}
            </p>
          ) : null}
          <p>
            <span className="text-muted">Creada:</span>{" "}
            {format(quote.createdAt, "dd MMM yyyy HH:mm", { locale: es })}
          </p>
          {quote.reservedUntil && quote.status === "RESERVED" ? (
            <p>
              <span className="text-muted">Reserva hasta:</span>{" "}
              {format(quote.reservedUntil, "dd MMM HH:mm", { locale: es })}
            </p>
          ) : null}
          <p>
            <span className="text-muted">ITBIS:</span>{" "}
            {quote.includeItbis ? "Incluido (18%)" : "No aplica"}
          </p>
        </Card>

        <Card className="space-y-2">
          {quote.lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
              <div className="flex items-start gap-3 min-w-0">
                <ProductThumb sku={line.product.sku} alt={line.product.name} size="sm" />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {line.product.sku} · {line.product.name}
                  </p>
                  <p className="text-sm text-muted">
                    {line.qty} × {formatRD(line.unitPrice)}
                  </p>
                </div>
              </div>
              <p className="font-semibold shrink-0">{formatRD(line.lineTotal)}</p>
            </div>
          ))}
          <div className="space-y-1 border-t border-border pt-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatRD(quote.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>ITBIS</span>
              <span>{formatRD(quote.itbisAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatRD(quote.total)}</span>
            </div>
          </div>
        </Card>

        <QuoteActions quoteId={quote.id} status={quote.status} />

        <a href={`/api/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">
          <Button variant="secondary" className="w-full">
            Descargar / compartir PDF
          </Button>
        </a>

        <Link href="/quotes" className="block text-center text-sm font-semibold text-muted">
          Volver a cotizaciones
        </Link>
      </div>
    </div>
  );
}
