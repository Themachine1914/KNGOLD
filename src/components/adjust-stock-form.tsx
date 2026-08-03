"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label } from "./ui";

export function AdjustStockForm({
  productId,
  sku,
}: {
  productId: string;
  sku: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/inventory/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        qtyDelta: Number(form.get("qtyDelta")),
        note: String(form.get("note") || ""),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "No se pudo ajustar");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="px-3 py-1.5 text-xs"
        onClick={() => setOpen(true)}
      >
        Ajustar
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl bg-background p-3">
      <p className="text-xs font-semibold text-muted">Ajuste {sku}</p>
      <div>
        <Label htmlFor={`qty-${productId}`}>Cantidad (+/-)</Label>
        <Input
          id={`qty-${productId}`}
          name="qtyDelta"
          type="number"
          required
          placeholder="Ej: 5 o -2"
        />
      </div>
      <div>
        <Label htmlFor={`note-${productId}`}>Nota</Label>
        <Input id={`note-${productId}`} name="note" placeholder="Compra, daño, conteo..." />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={loading}>
          Guardar
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
