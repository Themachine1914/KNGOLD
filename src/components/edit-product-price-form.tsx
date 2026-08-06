"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Input, Label } from "./ui";
import { formatRD } from "@/lib/pricing";

export function EditProductPriceForm({
  productId,
  sku,
  listPrice,
  netPrice,
}: {
  productId: string;
  sku: string;
  listPrice: number;
  netPrice: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [list, setList] = useState(String(listPrice));
  const [net, setNet] = useState(String(netPrice));

  const listNum = Number(list);
  const netNum = Number(net);
  const discount =
    Number.isFinite(listNum) && listNum > 0 && Number.isFinite(netNum)
      ? Math.max(0, Math.round(((listNum - netNum) / listNum) * 1000) / 10)
      : 0;
  const isOffer =
    Number.isFinite(listNum) &&
    Number.isFinite(netNum) &&
    Math.round(netNum * 100) < Math.round(listNum * 100);

  function close() {
    setOpen(false);
    setList(String(listPrice));
    setNet(String(netPrice));
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(netNum) || netNum < 0) {
      setError("Precio de venta inválido");
      return;
    }
    if (!Number.isFinite(listNum) || listNum < 0) {
      setError("Precio de lista inválido");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/inventory/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          netPrice: netNum,
          listPrice: listNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar");
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="mt-2 w-full"
        onClick={() => setOpen(true)}
      >
        Cambiar precio / oferta
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-3 rounded-xl bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted">
          Precio · {sku}
        </p>
        {isOffer ? <Badge tone="gold">Oferta {discount}%</Badge> : null}
      </div>

      <p className="text-xs text-muted">
        El vendedor cotizará con el precio de venta. Las cotizaciones ya hechas no
        cambian.
      </p>

      <div>
        <Label htmlFor={`list-${productId}`}>Precio de lista</Label>
        <Input
          id={`list-${productId}`}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={list}
          onChange={(e) => setList(e.target.value)}
          className="tabular-nums"
        />
      </div>

      <div>
        <Label htmlFor={`net-${productId}`}>Precio de venta (oferta)</Label>
        <Input
          id={`net-${productId}`}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={net}
          onChange={(e) => setNet(e.target.value)}
          className="tabular-nums"
        />
      </div>

      <div className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm">
        <p className="text-muted">
          Ahora: lista {formatRD(listPrice)} · venta {formatRD(netPrice)}
        </p>
        <p className="mt-1 font-semibold tabular-nums">
          Nuevo: lista {formatRD(listNum || 0)} · venta {formatRD(netNum || 0)}
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" variant="gold" className="flex-1" loading={loading}>
          {loading ? "Guardando…" : "Guardar precio"}
        </Button>
        <Button type="button" variant="ghost" disabled={loading} onClick={close}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
