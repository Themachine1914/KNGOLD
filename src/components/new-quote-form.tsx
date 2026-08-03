"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Money, StickyBar } from "./ui";
import { QtyStepper } from "./qty-stepper";
import { ProductThumb } from "./product-thumb";
import { calcQuoteTotals, formatRD } from "@/lib/pricing";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { errorMessage, postJson } from "@/lib/client-fetch";

type ProductOpt = {
  id: string;
  sku: string;
  name: string;
  type: string;
  netPrice: number;
  available: number;
};

export function NewQuoteForm({ products }: { products: ProductOpt[] }) {
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
  const [includeItbis, setIncludeItbis] = useState(true);
  const [filter, setFilter] = useState("");

  const selectedLines = useMemo(
    () =>
      products
        .filter((p) => (qtyByProduct[p.id] || 0) > 0)
        .map((p) => ({
          product: p,
          qty: qtyByProduct[p.id],
          lineTotal: p.netPrice * qtyByProduct[p.id],
        })),
    [products, qtyByProduct]
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
      const data = await postJson<{ quote: { id: string } }>("/api/quotes", {
        customer,
        includeItbis,
        lines: selectedLines.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
        })),
      });
      router.push(`/quotes/${data.quote.id}`);
      router.refresh();
      // `loading` se queda en true a propósito: la navegación tarda, y si
      // liberamos el botón aquí un segundo toque crea otra cotización con
      // su propia reserva de stock.
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  const steps = ["Cliente", "Productos", "Resumen"];

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
        <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
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
            Continuar a productos
          </Button>
        </Card>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3 pb-28">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar producto..."
            aria-label="Buscar producto"
          />
          <div className="space-y-2">
            {filtered.map((p) => {
              const qty = qtyByProduct[p.id] || 0;
              const atMax = qty >= p.available;
              return (
                <Card key={p.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <ProductThumb sku={p.sku} alt={p.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                        {p.type} · {p.sku}
                      </p>
                      <p className="font-semibold text-ink">{p.name}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold tabular-nums text-ink">
                        {formatRD(p.netPrice)}
                      </p>
                      <Badge
                        className="mt-1"
                        tone={
                          p.available <= 0
                            ? "danger"
                            : p.available <= LOW_STOCK_THRESHOLD
                              ? "warn"
                              : "success"
                        }
                      >
                        Disp. {p.available}
                      </Badge>
                    </div>
                    <QtyStepper
                      value={qty}
                      max={p.available}
                      label={`${p.sku} ${p.name}`}
                      onChange={(next) =>
                        setQtyByProduct({ ...qtyByProduct, [p.id]: next })
                      }
                    />
                  </div>
                  {atMax && p.available > 0 ? (
                    <p className="mt-2 text-xs font-semibold text-warn">
                      Es todo lo disponible: {p.available}
                    </p>
                  ) : null}
                  {p.available <= 0 ? (
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {selectedLines.length === 0
                    ? "Sin productos"
                    : `${totalUnits} uds · ${selectedLines.length} ${
                        selectedLines.length === 1 ? "producto" : "productos"
                      }`}
                </p>
                <Money amount={totals.total} size="strong" />
              </div>
              <p className="pb-1 text-xs text-muted">
                {includeItbis ? "Con ITBIS" : "Sin ITBIS"}
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
            <p className="mb-3 font-semibold">¿Factura con ITBIS?</p>
            <div className="grid grid-cols-2 gap-2" role="group">
              <button
                type="button"
                aria-pressed={includeItbis}
                onClick={() => setIncludeItbis(true)}
                className={`min-h-11 rounded-xl border px-3 py-3 text-sm font-semibold ${
                  includeItbis
                    ? "border-ink bg-ink text-white"
                    : "border-border bg-white text-ink"
                }`}
              >
                Con ITBIS 18%
              </button>
              <button
                type="button"
                aria-pressed={!includeItbis}
                onClick={() => setIncludeItbis(false)}
                className={`min-h-11 rounded-xl border px-3 py-3 text-sm font-semibold ${
                  !includeItbis
                    ? "border-ink bg-ink text-white"
                    : "border-border bg-white text-ink"
                }`}
              >
                Sin ITBIS
              </button>
            </div>
          </Card>

          <Card className="space-y-2">
            <p className="font-semibold text-ink">{customer.name}</p>
            {selectedLines.map((l) => (
              <div key={l.product.id} className="flex justify-between text-sm">
                <span>
                  <span className="tabular-nums">{l.qty}</span>× {l.product.sku}
                </span>
                <span className="tabular-nums">{formatRD(l.lineTotal)}</span>
              </div>
            ))}
            <div className="space-y-1 border-t border-border pt-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="tabular-nums">{formatRD(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">ITBIS (18%)</span>
                <span className="tabular-nums">{formatRD(totals.itbisAmount)}</span>
              </div>
            </div>
            <div className="flex items-end justify-between border-t border-border pt-2">
              <span className="pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
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
              {loading ? "Reservando…" : "Reservar stock"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
