"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "./ui";
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
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "No se pudo crear el pedido");
      return;
    }
    router.push(`/imports/${data.import.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
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
        <div>
          <Label>Estado</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStatus("ORDERED")}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                status === "ORDERED" ? "border-ink bg-ink text-white" : "border-border bg-white"
              }`}
            >
              Pedido
            </button>
            <button
              type="button"
              onClick={() => setStatus("IN_TRANSIT")}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                status === "IN_TRANSIT" ? "border-ink bg-ink text-white" : "border-border bg-white"
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
        <p className="font-semibold">Productos del pedido</p>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar producto..."
        />
        <div className="max-h-[45vh] space-y-2 overflow-y-auto">
          {filtered.map((p) => {
            const qty = qtyByProduct[p.id] || 0;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-2 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ProductThumb sku={p.sku} alt={p.name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.sku}</p>
                    <p className="truncate text-xs text-muted">{p.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-border text-lg font-semibold"
                    onClick={() =>
                      setQtyByProduct({
                        ...qtyByProduct,
                        [p.id]: Math.max(0, qty - 1),
                      })
                    }
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    value={qty || ""}
                    onChange={(e) =>
                      setQtyByProduct({
                        ...qtyByProduct,
                        [p.id]: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-14 rounded-lg border border-border px-1 py-1.5 text-center text-sm"
                    placeholder="0"
                  />
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg border border-border text-lg font-semibold"
                    onClick={() =>
                      setQtyByProduct({
                        ...qtyByProduct,
                        [p.id]: qty + 1,
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {selected.length > 0 ? (
        <Card>
          <p className="mb-2 text-sm font-semibold">
            Resumen · {selected.reduce((s, l) => s + l.qty, 0)} unidades
          </p>
          {selected.map((l) => (
            <div key={l.product.id} className="flex justify-between text-sm">
              <span>
                {l.qty}× {l.product.sku}
              </span>
            </div>
          ))}
        </Card>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Guardando..." : "Registrar importación"}
      </Button>
    </form>
  );
}
