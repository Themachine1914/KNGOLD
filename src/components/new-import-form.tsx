"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, StickyBar } from "./ui";
import { QtyStepper } from "./qty-stepper";
import { ProductThumb } from "./product-thumb";

type ProductOpt = {
  id: string;
  sku: string;
  name: string;
  type: string;
  stockOnHand: number;
};

export function NewImportForm({ products }: { products: ProductOpt[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [supplier, setSupplier] = useState("");
  const [eta, setEta] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"ORDERED" | "IN_TRANSIT">("ORDERED");
  const [filter, setFilter] = useState("");
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});

  const selected = useMemo(
    () =>
      products
        .filter((p) => (qtyByProduct[p.id] || 0) > 0)
        .map((p) => ({ product: p, qty: qtyByProduct[p.id] })),
    [products, qtyByProduct]
  );

  const totalUnits = selected.reduce((s, l) => s + l.qty, 0);

  const filtered = products.filter((p) => {
    const q = filter.toLowerCase();
    return (
      !q ||
      p.sku.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q)
    );
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!eta) {
      setError("Indica la fecha estimada de llegada.");
      return;
    }
    if (!selected.length) {
      setError("Agrega al menos un producto.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier,
          eta,
          notes,
          status,
          lines: selected.map((l) => ({
            productId: l.product.id,
            qty: l.qty,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo crear el pedido");
        return;
      }
      router.push(`/imports/${data.import.id}`);
      router.refresh();
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 pb-28">
      <Card className="space-y-3">
        <div>
          <Label htmlFor="supplier">Proveedor / origen</Label>
          <Input
            id="supplier"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Ej: Contenedor China, fábrica..."
          />
        </div>
        <div>
          <Label htmlFor="eta">Fecha estimada de llegada</Label>
          <Input
            id="eta"
            type="date"
            required
            value={eta}
            onChange={(e) => setEta(e.target.value)}
          />
        </div>
        <div role="group" aria-label="Estado del pedido">
          <p className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
            Estado
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={status === "ORDERED"}
              onClick={() => setStatus("ORDERED")}
              className={`min-h-11 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                status === "ORDERED"
                  ? "border-ink bg-ink text-white"
                  : "border-border bg-white text-ink"
              }`}
            >
              Encargado
            </button>
            <button
              type="button"
              aria-pressed={status === "IN_TRANSIT"}
              onClick={() => setStatus("IN_TRANSIT")}
              className={`min-h-11 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                status === "IN_TRANSIT"
                  ? "border-ink bg-ink text-white"
                  : "border-border bg-white text-ink"
              }`}
            >
              En tránsito
            </button>
          </div>
        </div>
        <div>
          <Label htmlFor="notes">Notas</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="BL, contenedor, observaciones..."
          />
        </div>
      </Card>

      <Card className="space-y-2">
        <p className="font-semibold text-ink">Productos del pedido</p>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar producto..."
          aria-label="Buscar producto"
        />
        <div className="space-y-2">
          {filtered.map((p) => {
            const qty = qtyByProduct[p.id] || 0;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-2 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ProductThumb sku={p.sku} alt={p.name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{p.sku}</p>
                    <p className="truncate text-sm text-muted">{p.name}</p>
                    <p className="text-xs text-muted">
                      Físico <span className="tabular-nums">{p.stockOnHand}</span>
                    </p>
                  </div>
                </div>
                <QtyStepper
                  value={qty}
                  label={`${p.sku} ${p.name}`}
                  onChange={(next) =>
                    setQtyByProduct({ ...qtyByProduct, [p.id]: next })
                  }
                />
              </div>
            );
          })}
        </div>
      </Card>

      {selected.length > 0 ? (
        <Card>
          <p className="mb-2 text-sm font-semibold text-ink">Resumen del pedido</p>
          {selected.map((l) => (
            <div key={l.product.id} className="flex justify-between text-sm">
              <span>{l.product.sku}</span>
              <span className="tabular-nums">+{l.qty}</span>
            </div>
          ))}
        </Card>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <StickyBar>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {selected.length === 0
                ? "Sin productos"
                : `${selected.length} ${selected.length === 1 ? "producto" : "productos"}`}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-ink">
              {totalUnits} uds
            </p>
          </div>
        </div>
        <Button
          type="submit"
          variant="gold"
          className="w-full"
          loading={loading}
        >
          {loading ? "Guardando…" : "Registrar importación"}
        </Button>
      </StickyBar>
    </form>
  );
}
