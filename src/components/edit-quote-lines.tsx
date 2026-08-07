"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input } from "./ui";
import { QtyStepper } from "./qty-stepper";
import { ProductThumb } from "./product-thumb";
import { productDisplayName } from "@/lib/product-label";
import { formatRD } from "@/lib/pricing";

type Line = {
  id: string;
  productId: string;
  qty: number;
  transitQty?: number;
  unitPrice: number;
  lineTotal: number;
  product?: {
    sku?: string;
    name?: string;
    type?: string;
    imageUrl?: string | null;
  } | null;
};

type ProductOpt = {
  id: string;
  sku: string;
  name: string;
  type: string;
  netPrice: number;
  available: number;
  availableTransit: number;
  availableTotal: number;
  imageUrl?: string | null;
};

export function EditQuoteLines({
  quoteId,
  lines,
  products,
  mode = "RESERVED",
  canEditPrice = false,
}: {
  quoteId: string;
  lines: Line[];
  products: ProductOpt[];
  mode?: "RESERVED" | "CONFIRMED";
  canEditPrice?: boolean;
}) {
  const router = useRouter();
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>(
    () => Object.fromEntries(lines.map((l) => [l.productId, l.qty]))
  );
  const [priceByProduct, setPriceByProduct] = useState<Record<string, number>>(
    () => Object.fromEntries(lines.map((l) => [l.productId, l.unitPrice]))
  );
  const [filter, setFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p] as const)),
    [products]
  );
  const lineByProduct = useMemo(
    () => new Map(lines.map((l) => [l.productId, l] as const)),
    [lines]
  );

  /** Máx. que este pedido/factura puede tomar de un producto. */
  function maxFor(productId: string) {
    const p = productById.get(productId);
    const current = lineByProduct.get(productId)?.qty || 0;
    if (mode === "CONFIRMED") {
      // Solo stock físico libre + lo ya facturado en esta venta
      return (p?.available ?? 0) + current;
    }
    return (p?.availableTotal ?? 0) + current;
  }

  const activeProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, qty] of Object.entries(qtyByProduct)) {
      if (qty > 0) ids.add(id);
    }
    for (const l of lines) ids.add(l.productId);
    return [...ids];
  }, [qtyByProduct, lines]);

  function unitFor(productId: string) {
    const catalog = productById.get(productId)?.netPrice;
    const previous = lineByProduct.get(productId)?.unitPrice;
    if (canEditPrice && priceByProduct[productId] != null) {
      return priceByProduct[productId];
    }
    return previous ?? catalog ?? 0;
  }

  const dirty = useMemo(() => {
    const allIds = new Set([
      ...lines.map((l) => l.productId),
      ...Object.keys(qtyByProduct),
    ]);
    for (const id of allIds) {
      const nextQty = qtyByProduct[id] ?? 0;
      const prevQty = lineByProduct.get(id)?.qty ?? 0;
      if (nextQty !== prevQty) return true;
      if (!canEditPrice || nextQty <= 0) continue;
      const prevPrice = lineByProduct.get(id)?.unitPrice;
      if (prevPrice == null) continue;
      if (Math.round(prevPrice * 100) !== Math.round(unitFor(id) * 100)) {
        return true;
      }
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtyByProduct, priceByProduct, lines, lineByProduct, canEditPrice]);

  const previewTotal = useMemo(() => {
    let sum = 0;
    for (const id of activeProductIds) {
      const qty = qtyByProduct[id] ?? 0;
      if (qty <= 0) continue;
      sum += unitFor(id) * qty;
    }
    return sum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProductIds, qtyByProduct, priceByProduct, lineByProduct, productById, canEditPrice]);

  const addable = useMemo(() => {
    const q = filter.toLowerCase().trim();
    const active = new Set(activeProductIds);
    return products.filter((p) => {
      if (active.has(p.id)) return false;
      const free =
        mode === "CONFIRMED" ? (p.available ?? 0) : (p.availableTotal ?? 0);
      if (free <= 0) return false;
      if (!q) return true;
      return (
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q)
      );
    });
  }, [products, activeProductIds, filter, mode]);

  async function save() {
    setLoading(true);
    setError("");
    setOkMsg("");
    try {
      const payloadLines = Object.entries(qtyByProduct).map(([productId, qty]) => ({
        productId,
        qty,
        ...(canEditPrice && qty > 0 ? { unitPrice: unitFor(productId) } : {}),
      }));
      // Ensure removed originals are sent as 0
      for (const l of lines) {
        if (!(l.productId in qtyByProduct)) {
          payloadLines.push({ productId: l.productId, qty: 0 });
        }
      }

      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: payloadLines }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar");
        return;
      }
      setOkMsg(
        mode === "CONFIRMED"
          ? "Factura actualizada. El stock físico ya refleja el cambio."
          : "Pedido actualizado. El stock ya refleja el cambio."
      );
      setShowAdd(false);
      router.refresh();
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function setQty(productId: string, next: number) {
    setQtyByProduct((prev) => ({ ...prev, [productId]: next }));
  }

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-semibold">
          {mode === "CONFIRMED" ? "Editar factura" : "Editar pedido"}
        </p>
        <p className="text-xs text-muted">
          {mode === "CONFIRMED"
            ? "Puedes sumar, bajar, quitar o agregar. El stock físico se ajusta al guardar."
            : "Puedes sumar, bajar, quitar o agregar electrodomésticos. Respeta almacén y tránsito."}
          {canEditPrice
            ? " También puedes cambiar el precio por unidad para ofertas."
            : ""}
        </p>
      </div>

      <div className="space-y-3">
        {activeProductIds.map((productId) => {
          const line = lineByProduct.get(productId);
          const product = productById.get(productId);
          const qty = qtyByProduct[productId] ?? line?.qty ?? 0;
          const max = maxFor(productId);
          const sku = line?.product?.sku || product?.sku || "?";
          const name = productDisplayName(
            line?.product?.name || product?.name || ""
          );
          const unit = unitFor(productId);
          const catalog = product?.netPrice ?? 0;
          const isOffer =
            canEditPrice &&
            catalog > 0 &&
            Math.round(unit * 100) !== Math.round(catalog * 100);
          const stockFree =
            (product?.available ?? 0) +
            (line ? Math.max(0, line.qty - (line.transitQty || 0)) : 0);
          const transitHint = Math.max(0, qty - stockFree);

          return (
            <div
              key={productId}
              className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="flex min-w-0 items-start gap-3">
                <ProductThumb
                  sku={sku}
                  alt={name}
                  imageUrl={line?.product?.imageUrl ?? product?.imageUrl}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {sku} · {name}
                  </p>
                  {canEditPrice && qty > 0 ? (
                    <div className="mt-1">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={unit}
                        aria-label={`Precio ${sku}`}
                        onChange={(e) =>
                          setPriceByProduct((prev) => ({
                            ...prev,
                            [productId]: Number(e.target.value),
                          }))
                        }
                        className="max-w-[130px]"
                      />
                      <p className="mt-1 text-xs text-muted">
                        {isOffer ? `Catálogo ${formatRD(catalog)} · ` : ""}
                        c/u oferta
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      {formatRD(unit)} c/u
                      {qty === 0 ? (
                        <span className="ml-2 font-semibold text-danger">Se quitará</span>
                      ) : null}
                    </p>
                  )}
                  {qty === 0 ? (
                    <p className="mt-1 text-sm font-semibold text-danger">Se quitará</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone="success">Máx. {max}</Badge>
                    {isOffer ? <Badge tone="gold">Oferta</Badge> : null}
                    {mode === "RESERVED" &&
                    ((product?.availableTransit ?? 0) > 0 || transitHint > 0) ? (
                      <Badge tone="gold">
                        {transitHint > 0
                          ? `${transitHint} en tránsito`
                          : `Tránsito ${product?.availableTransit ?? 0}`}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm tabular-nums font-semibold">
                    {formatRD(unit * qty)}
                  </p>
                </div>
              </div>
              <QtyStepper
                value={qty}
                max={max}
                label={`${sku} ${name}`}
                onChange={(next) => {
                  setQty(productId, next);
                  if (next > 0 && priceByProduct[productId] == null) {
                    setPriceByProduct((prev) => ({
                      ...prev,
                      [productId]:
                        lineByProduct.get(productId)?.unitPrice ??
                        productById.get(productId)?.netPrice ??
                        0,
                    }));
                  }
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
        <span className="text-muted">Total líneas (sin desglose)</span>
        <span className="font-semibold tabular-nums">{formatRD(previewTotal)}</span>
      </div>

      {!showAdd ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => setShowAdd(true)}
        >
          Agregar mercancía
        </Button>
      ) : (
        <div className="space-y-2 rounded-2xl border border-border bg-black/[0.02] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Agregar electrodoméstico</p>
            <button
              type="button"
              className="text-xs font-semibold text-muted"
              onClick={() => {
                setShowAdd(false);
                setFilter("");
              }}
            >
              Cerrar
            </button>
          </div>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar código o nombre..."
            aria-label="Buscar electrodoméstico para agregar"
          />
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {addable.length === 0 ? (
              <p className="text-xs text-muted">No hay más electrodomésticos disponibles.</p>
            ) : (
              addable.slice(0, 40).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2 text-left"
                  onClick={() => {
                    setQty(p.id, 1);
                    setPriceByProduct((prev) => ({ ...prev, [p.id]: p.netPrice }));
                    setShowAdd(false);
                    setFilter("");
                  }}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-muted">
                      {p.type} · {p.sku}
                    </span>
                    <span className="block truncate text-sm font-semibold">
                      {productDisplayName(p.name)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-gold-dark">
                    + · {p.availableTotal}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {okMsg ? <p className="text-sm text-success">{okMsg}</p> : null}

      <Button
        type="button"
        variant="gold"
        className="w-full"
        disabled={!dirty || loading}
        loading={loading}
        onClick={save}
      >
        {loading ? "Guardando…" : "Guardar cambios"}
      </Button>
    </Card>
  );
}
