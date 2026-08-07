import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { getProductsWithAvailability, getQuote } from "@/lib/inventory";
import { formatRD } from "@/lib/pricing";
import {
  paymentTermsLabel,
  quoteStatusLabel,
  quoteStatusTone,
} from "@/lib/labels";
import { productDisplayName } from "@/lib/product-label";
import { Badge, Card, PageHeader } from "@/components/ui";
import { QuoteActions } from "@/components/quote-actions";
import { EditQuoteLines } from "@/components/edit-quote-lines";
import { ShareQuotePdfButton } from "@/components/share-quote-pdf-button";
import { ProductThumb } from "@/components/product-thumb";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default async function QuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ share?: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const { share } = await searchParams;
  const quote = await getQuote(id);
  if (!quote) notFound();
  if (!isOpsManager(session!.user.role) && quote.sellerId !== session!.user.id) {
    notFound();
  }

  const canEdit =
    quote.status === "RESERVED" || quote.status === "CONFIRMED";
  const catalog = canEdit ? await getProductsWithAvailability() : [];
  const productOptions = catalog.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    type: p.type,
    netPrice: p.netPrice,
    available: p.available ?? 0,
    availableTransit: p.availableTransit ?? 0,
    availableTotal: p.availableTotal ?? p.available ?? 0,
    imageUrl: p.imageUrl ?? null,
  }));

  return (
    <div>
      <PageHeader
        title={`Pedido #${quote.number}`}
        subtitle={quote.customer?.name}
        action={<Badge tone={quoteStatusTone(quote.status)}>{quoteStatusLabel(quote.status)}</Badge>}
      />

      <div className="space-y-3">
        <ShareQuotePdfButton
          quoteId={quote.id}
          number={quote.number}
          customerName={quote.customer?.name || ""}
          customerPhone={quote.customer?.phone}
          total={quote.total}
          autoShare={share === "1"}
          label={
            quote.status === "CONFIRMED"
              ? "Imprimir / enviar PDF"
              : "Enviar por WhatsApp"
          }
          variant={quote.status === "CONFIRMED" ? "gold" : "secondary"}
        />

        <Card className="space-y-1 text-sm">
          <p><span className="text-muted">Vendedor:</span> {quote.seller?.name}</p>
          {quote.customer?.rnc ? <p><span className="text-muted">RNC:</span> {quote.customer.rnc}</p> : null}
          {quote.customer?.phone ? <p><span className="text-muted">Tel:</span> {quote.customer.phone}</p> : null}
          <p>
            <span className="text-muted">Creada:</span>{" "}
            {format(parseISO(quote.createdAt), "dd MMM yyyy HH:mm", { locale: es })}
          </p>
          {quote.status === "RESERVED" ? (
            <p>
              <span className="text-muted">Reserva:</span> indefinida (hasta
              facturar o anular)
            </p>
          ) : null}
          <p>
            <span className="text-muted">Condición:</span>{" "}
            {paymentTermsLabel(quote.paymentTerms)}
          </p>
          <p>
            <span className="text-muted">Cliente:</span>{" "}
            {quote.customer?.name || "—"}
          </p>
          {quote.notes ? (
            <p>
              <span className="text-muted">Observación:</span> {quote.notes}
            </p>
          ) : null}
        </Card>

        {(quote.lines || []).some((l) => (l.transitQty || 0) > 0) ? (
          <Card className="border-gold/40 bg-gold/5 text-sm">
            <p className="font-semibold text-gold-dark">Apartado en tránsito</p>
            <p className="mt-1 text-muted">
              {(quote.lines || []).reduce((s, l) => s + (l.transitQty || 0), 0)} UND
              esperan la importación. Al recibir el pedido, pasan a reserva de almacén.
              No se puede confirmar la venta hasta entonces.
            </p>
          </Card>
        ) : null}

        {canEdit ? (
          <EditQuoteLines
            key={`${quote.id}-${quote.updatedAt}`}
            quoteId={quote.id}
            lines={quote.lines || []}
            products={productOptions}
            mode={quote.status === "CONFIRMED" ? "CONFIRMED" : "RESERVED"}
            canEditPrice={isOpsManager(session!.user.role)}
          />
        ) : (
          <Card className="space-y-2">
            {(quote.lines || []).map((line) => (
              <div key={line.id} className="flex justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="flex items-start gap-3 min-w-0">
                  <ProductThumb
                    sku={line.product?.sku || "?"}
                    alt={productDisplayName(line.product?.name)}
                    imageUrl={line.product?.imageUrl}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {line.product?.sku} ·{" "}
                      {productDisplayName(line.product?.name)}
                    </p>
                    <p className="text-sm text-muted">
                      {line.qty} × {formatRD(line.unitPrice)}
                      {(line.transitQty || 0) > 0
                        ? ` · ${line.transitQty} en tránsito`
                        : ""}
                    </p>
                  </div>
                </div>
                <p className="font-semibold shrink-0">{formatRD(line.lineTotal)}</p>
              </div>
            ))}
            <div className="space-y-1 border-t border-border pt-2 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatRD(quote.subtotal)}</span></div>
              {quote.includeItbis ? (
                <div className="flex justify-between text-ink/35">
                  <span>ITBIS (18%)</span>
                  <span>{formatRD(quote.itbisAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span><span>{formatRD(quote.total)}</span>
              </div>
            </div>
          </Card>
        )}

        {canEdit ? (
          <Card className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span className="tabular-nums">{formatRD(quote.subtotal)}</span>
            </div>
            {quote.includeItbis ? (
              <div className="flex justify-between text-ink/35">
                <span>ITBIS (18%)</span>
                <span className="tabular-nums">{formatRD(quote.itbisAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatRD(quote.total)}</span>
            </div>
          </Card>
        ) : null}

        <QuoteActions
          quoteId={quote.id}
          status={quote.status}
          units={(quote.lines || []).reduce((s, l) => s + l.qty, 0)}
          productCount={(quote.lines || []).length}
          total={quote.total}
          number={quote.number}
          customerName={quote.customer?.name || ""}
          customerPhone={quote.customer?.phone}
        />

        <Link href="/quotes" className="block text-center text-sm font-semibold text-muted">
          Volver a pedidos
        </Link>
      </div>
    </div>
  );
}
