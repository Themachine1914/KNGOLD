"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "./ui";
import { ProductThumb } from "./product-thumb";
import { calcQuoteTotals, formatRD } from "@/lib/pricing";

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
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer,
        includeItbis,
        lines: selectedLines.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
        })),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "No se pudo crear la cotización");
      return;
    }
    router.push(`/quotes/${data.quote.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-ink" : "bg-border"}`}
          />
        ))}
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
              value={customer.rnc}
              onChange={(e) => setCustomer({ ...customer, rnc: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
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
            className="w-full"
            disabled={!customer.name.trim()}
            onClick={() => setStep(2)}
          >
            Continuar a productos
          </Button>
        </Card>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar producto..."
          />
          <div className="space-y-2">
            {filtered.map((p) => {
              const qty = qtyByProduct[p.id] || 0;
              return (
                <Card key={p.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <ProductThumb sku={p.sku} alt={p.name} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gold-dark">
                          {p.type} · {p.sku}
                        </p>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-sm text-muted">
                          {formatRD(p.netPrice)} · Disp. {p.available}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="h-9 w-9 rounded-lg border border-border bg-white text-lg font-semibold"
                        onClick={() =>
                          setQtyByProduct({
                            ...qtyByProduct,
                            [p.id]: Math.max(0, qty - 1),
                          })
                        }
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-semibold">{qty}</span>
                      <button
                        type="button"
                        className="h-9 w-9 rounded-lg border border-border bg-white text-lg font-semibold disabled:opacity-40"
                        disabled={qty >= p.available}
                        onClick={() =>
                          setQtyByProduct({
                            ...qtyByProduct,
                            [p.id]: Math.min(p.available, qty + 1),
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(1)}>
              Atrás
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={selectedLines.length === 0}
              onClick={() => setStep(3)}
            >
              ITBIS y resumen
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3">
          <Card>
            <p className="mb-3 font-semibold">¿Factura con ITBIS?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIncludeItbis(true)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                  includeItbis ? "border-ink bg-ink text-white" : "border-border bg-white"
                }`}
              >
                Con ITBIS 18%
              </button>
              <button
                type="button"
                onClick={() => setIncludeItbis(false)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                  !includeItbis ? "border-ink bg-ink text-white" : "border-border bg-white"
                }`}
              >
                Sin ITBIS
              </button>
            </div>
          </Card>

          <Card className="space-y-2">
            <p className="font-semibold">{customer.name}</p>
            {selectedLines.map((l) => (
              <div key={l.product.id} className="flex justify-between text-sm">
                <span>
                  {l.qty}× {l.product.sku}
                </span>
                <span>{formatRD(l.lineTotal)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatRD(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>ITBIS (18%)</span>
                <span>{formatRD(totals.itbisAmount)}</span>
              </div>
              <div className="mt-1 flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatRD(totals.total)}</span>
              </div>
            </div>
            <p className="text-xs text-muted">
              Al confirmar se reserva el inventario por 48 horas.
            </p>
          </Card>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(2)}>
              Atrás
            </Button>
            <Button type="button" className="flex-1" disabled={loading} onClick={submit}>
              {loading ? "Reservando..." : "Reservar stock"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
