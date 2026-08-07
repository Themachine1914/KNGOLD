"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Money, StickyBar } from "./ui";
import { QtyStepper } from "./qty-stepper";
import { ProductThumb } from "./product-thumb";
import { calcQuoteTotals, formatRD } from "@/lib/pricing";
import { comprobanteLabel } from "@/lib/labels";
import { shareQuotePdf } from "@/lib/share-quote-pdf";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";

type ProductOpt = {
  id: string;
  sku: string;
  name: string;
  type: string;
  netPrice: number;
  listPrice?: number;
  available: number;
  availableTransit: number;
  availableTotal: number;
  imageUrl?: string | null;
};

export function NewQuoteForm({
  products,
  canEditPrice = false,
}: {
  products: ProductOpt[];
  canEditPrice?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState({
    name: "",
    rnc: "",
    phone: "",
    address: "",
  });
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [priceByProduct, setPriceByProduct] = useState<Record<string, number>>({});
  const [includeItbis, setIncludeItbis] = useState(true);
  const [filter, setFilter] = useState("");

  function unitFor(p: ProductOpt) {
    if (!canEditPrice) return p.netPrice;
    const custom = priceByProduct[p.id];
    return custom != null && Number.isFinite(custom) ? custom : p.netPrice;
  }

  const selectedLines = useMemo(
    () =>
      products
        .filter((p) => (qtyByProduct[p.id] || 0) > 0)
        .map((p) => {
          const unit = unitFor(p);
          const qty = qtyByProduct[p.id];
          return {
            product: p,
            qty,
            unitPrice: unit,
            lineTotal: unit * qty,
            isOffer: canEditPrice && Math.round(unit * 100) !== Math.round(p.netPrice * 100),
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unitFor uses priceByProduct/canEditPrice
    [products, qtyByProduct, priceByProduct, canEditPrice]
  );

  const totals = calcQuoteTotals(
    selectedLines.map((l) => l.lineTotal),
    includeItbis
  );
  const totalUnits = selectedLines.reduce((s, l) => s + l.qty, 0);

  const filtered = products.filter((p) => {
    const q = filter.toLowerCase();
    return (
      !q ||
      p.sku.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q)
    );
  });

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          includeItbis,
          lines: selectedLines.map((l) => ({
            productId: l.product.id,
            qty: l.qty,
            ...(canEditPrice ? { unitPrice: l.unitPrice } : {}),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear la cotización");
        return;
      }
      const quote = data.quote as {
        id: string;
        number: number;
        total: number;
        customer?: { name?: string; phone?: string | null } | null;
      };

      await shareQuotePdf({
        quoteId: quote.id,
        number: quote.number,
        customerName: quote.customer?.name || customer.name,
        customerPhone: quote.customer?.phone || customer.phone,
        totalText: formatRD(quote.total ?? totals.total),
      });

      router.push(`/quotes/${quote.id}?share=1`);
      router.refresh();
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const steps = ["Cliente", "Electrodomésticos", "Resumen"];

  return (
    <div className="space-y-4">
      <div>
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-gold" : "bg-border"}`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs font-medium tracking-wide text-muted">
          Paso {step} de 3 · {steps[step - 1]}
        </p>
      </div>

      {step === 1 ? (
        <Card className="space-y-3">
          <p className="font-semibold">Datos del cliente</p>
          <div>
            <Label htmlFor="name">Nombre / negocio</Label>
            <Input
              id="name"
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              required
              placeholder="Ej: Villa Vasquez Comercial"
            />
          </div>
          <div>
            <Label htmlFor="rnc">RNC (opcional)</Label>
            <Input
              id="rnc"
              inputMode="numeric"
              value={customer.rnc}
              onChange={(e) => setCustomer({ ...customer, rnc: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              value={customer.phone}
              onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              value={customer.address}
              onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="gold"
            className="w-full"
            disabled={!customer.name.trim()}
            onClick={() => setStep(2)}
          >
            Continuar a electrodomésticos
          </Button>
        </Card>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3 pb-28">
          {canEditPrice ? (
            <p className="text-sm text-muted">
              Puedes ajustar el precio por unidad para ofertas. El catálogo no cambia.
            </p>
          ) : null}
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar electrodoméstico..."
            aria-label="Buscar electrodoméstico"
          />
          <div className="space-y-2">
            {filtered.map((p) => {
              const qty = qtyByProduct[p.id] || 0;
              const max = p.availableTotal;
              const fromTransit = Math.max(0, qty - p.available);
              const atMax = qty >= max && max > 0;
              const unit = unitFor(p);
              const isOffer =
                canEditPrice && Math.round(unit * 100) !== Math.round(p.netPrice * 100);
              return (
                <Card key={p.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <ProductThumb sku={p.sku} alt={p.name} imageUrl={p.imageUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold tracking-wide text-muted">
                        {p.type} · {p.sku}
                      </p>
                      <p className="font-semibold text-ink">{p.name}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {canEditPrice && qty > 0 ? (
                        <div>
                          <Label htmlFor={`price-${p.id}`}>Precio c/u (oferta)</Label>
                          <Input
                            id={`price-${p.id}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            value={unit}
                            onChange={(e) =>
                              setPriceByProduct({
                                ...priceByProduct,
                                [p.id]: Number(e.target.value),
                              })
                            }
                            className="max-w-[140px]"
                          />
                          {isOffer ? (
                            <p className="mt-1 text-xs text-gold-dark">
                              Catálogo {formatRD(p.netPrice)}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-muted">Precio de lista</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="text-base font-semibold tabular-nums text-ink">
                            {formatRD(p.netPrice)}
                          </p>
                          {(p.listPrice ?? 0) > p.netPrice ? (
                            <p className="text-xs text-muted line-through">
                              {formatRD(p.listPrice!)}
                            </p>
                          ) : null}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge
                          tone={
                            p.available <= 0
                              ? p.availableTransit > 0
                                ? "warn"
                                : "danger"
                              : p.available <= LOW_STOCK_THRESHOLD
                                ? "warn"
                                : "success"
                          }
                        >
                          Almacén {p.available}
                        </Badge>
                        {p.availableTransit > 0 ? (
                          <Badge tone="gold">Tránsito {p.availableTransit}</Badge>
                        ) : null}
                        {isOffer || (p.listPrice ?? 0) > p.netPrice ? (
                          <Badge tone="gold">Oferta</Badge>
                        ) : null}
                      </div>
                    </div>
                    <QtyStepper
                      value={qty}
                      max={max}
                      label={`${p.sku} ${p.name}`}
                      onChange={(next) => {
                        setQtyByProduct({ ...qtyByProduct, [p.id]: next });
                        if (next > 0 && priceByProduct[p.id] == null) {
                          setPriceByProduct({ ...priceByProduct, [p.id]: p.netPrice });
                        }
                      }}
                    />
                  </div>
                  {fromTransit > 0 ? (
                    <p className="mt-2 text-xs font-semibold text-gold-dark">
                      {fromTransit} uds se apartarán del tránsito (llegan con la importación).
                    </p>
                  ) : null}
                  {atMax ? (
                    <p className="mt-2 text-xs font-semibold text-warn">
                      Es todo lo disponible: {max}
                      {p.availableTransit > 0 ? " (almacén + tránsito)" : ""}
                    </p>
                  ) : null}
                  {max <= 0 ? (
                    <p className="mt-2 text-xs font-semibold text-danger">
                      Sin disponible para cotizar
                    </p>
                  ) : null}
                </Card>
              );
            })}
          </div>

          <StickyBar>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <p className="text-xs font-medium tracking-wide text-muted">
                  {selectedLines.length === 0
                    ? "Sin electrodomésticos"
                    : `${totalUnits} uds · ${selectedLines.length} ${
                        selectedLines.length === 1
                          ? "electrodoméstico"
                          : "electrodomésticos"
                      }`}
                </p>
                <Money amount={totals.total} size="strong" />
              </div>
              <p className="pb-1 text-xs text-muted">
                {comprobanteLabel(includeItbis)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setStep(1)}
              >
                Atrás
              </Button>
              <Button
                type="button"
                variant="gold"
                className="flex-1"
                disabled={selectedLines.length === 0}
                onClick={() => setStep(3)}
              >
                Continuar
              </Button>
            </div>
          </StickyBar>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <Card>
            <p className="mb-3 font-semibold">¿c/c o s/c?</p>
            <div className="grid grid-cols-2 gap-2" role="group">
              <button
                type="button"
                aria-pressed={includeItbis}
                aria-label="Con comprobante"
                onClick={() => setIncludeItbis(true)}
                className={`min-h-11 rounded-xl border px-3 py-3 text-sm font-semibold ${
                  includeItbis
                    ? "border-ink bg-ink text-white"
                    : "border-border bg-white text-ink"
                }`}
              >
                c/c
              </button>
              <button
                type="button"
                aria-pressed={!includeItbis}
                aria-label="Sin comprobante"
                onClick={() => setIncludeItbis(false)}
                className={`min-h-11 rounded-xl border px-3 py-3 text-sm font-semibold ${
                  !includeItbis
                    ? "border-ink bg-ink text-white"
                    : "border-border bg-white text-ink"
                }`}
              >
                s/c
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              c/c = con comprobante · s/c = sin comprobante. El total es el mismo.
            </p>
          </Card>

          <Card className="space-y-2">
            <p className="font-semibold text-ink">{customer.name}</p>
            {selectedLines.map((l) => (
              <div key={l.product.id} className="flex justify-between gap-2 text-sm">
                <span>
                  <span className="tabular-nums">{l.qty}</span>× {l.product.sku}
                  {l.isOffer ? (
                    <span className="ml-1 text-xs font-semibold text-gold-dark">
                      ({formatRD(l.unitPrice)})
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums">{formatRD(l.lineTotal)}</span>
              </div>
            ))}
            <div className="space-y-1 border-t border-border pt-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="tabular-nums">{formatRD(totals.subtotal)}</span>
              </div>
              {includeItbis ? (
                <div className="flex justify-between text-ink/35">
                  <span>ITBIS (18%)</span>
                  <span className="tabular-nums">{formatRD(totals.itbisAmount)}</span>
                </div>
              ) : null}
            </div>
            <div className="flex items-end justify-between border-t border-border pt-2">
              <span className="pb-1 text-xs font-medium tracking-wide text-muted">
                Total
              </span>
              <Money amount={totals.total} size="hero" />
            </div>
            <p className="text-xs text-muted">
              Al confirmar se reserva el inventario por 48 horas.
            </p>
          </Card>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setStep(2)}
            >
              Atrás
            </Button>
            <Button
              type="button"
              variant="gold"
              className="flex-1"
              loading={loading}
              onClick={submit}
            >
              {loading ? "Reservando…" : "Reservar y enviar"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
