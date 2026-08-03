"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label } from "./ui";
import { errorMessage, postJson } from "@/lib/client-fetch";

export function AdjustStockForm({
  productId,
  sku,
  stockOnHand,
  reserved,
}: {
  productId: string;
  sku: string;
  stockOnHand: number;
  reserved: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState("");

  const delta = direction === "in" ? qty : -qty;
  const result = stockOnHand + delta;

  function close() {
    setOpen(false);
    setQty(0);
    setNote("");
    setError("");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (qty <= 0) {
      setError("Escribe una cantidad mayor que cero.");
      return;
    }
    if (result < 0) {
      setError(`No puedes sacar ${qty}: solo hay ${stockOnHand} en físico.`);
      return;
    }
    // El servidor también rechaza bajar del total reservado; avisarlo aquí
    // evita que el dueño lo descubra después de enviar.
    if (result < reserved) {
      setError(
        `No puedes bajar de ${reserved}: hay ${reserved} unidades apartadas en cotizaciones.`
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      await postJson("/api/inventory/adjust", {
        productId,
        qtyDelta: delta,
        note,
      });
      close();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="mt-3 w-full"
        onClick={() => setOpen(true)}
      >
        Ajustar stock
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-background p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        Ajuste de {sku}
      </p>

      <div>
        <Label>¿Qué pasó?</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={direction === "in"}
            onClick={() => setDirection("in")}
            className={`min-h-11 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              direction === "in"
                ? "border-ink bg-ink text-white"
                : "border-border bg-white text-ink"
            }`}
          >
            Entró
          </button>
          <button
            type="button"
            aria-pressed={direction === "out"}
            onClick={() => setDirection("out")}
            className={`min-h-11 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              direction === "out"
                ? "border-ink bg-ink text-white"
                : "border-border bg-white text-ink"
            }`}
          >
            Salió
          </button>
        </div>
      </div>

      <div>
        <Label htmlFor={`qty-${productId}`}>Cantidad</Label>
        <Input
          id={`qty-${productId}`}
          inputMode="numeric"
          pattern="[0-9]*"
          value={qty || ""}
          placeholder="0"
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            setQty(digits ? Number(digits) : 0);
          }}
          className="text-lg font-semibold tabular-nums"
        />
      </div>

      <div className="rounded-xl border border-border bg-white px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Quedará en físico
        </p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
          {stockOnHand} → <span className={result < 0 ? "text-danger" : ""}>{result}</span>
        </p>
      </div>

      <div>
        <Label htmlFor={`note-${productId}`}>Nota</Label>
        <Input
          id={`note-${productId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Compra, daño, conteo..."
        />
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" loading={loading}>
          {loading ? "Guardando…" : "Guardar ajuste"}
        </Button>
        <Button type="button" variant="ghost" disabled={loading} onClick={close}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
