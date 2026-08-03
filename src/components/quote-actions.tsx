"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";
import { ConfirmPanel } from "./confirm-panel";
import { formatRD } from "@/lib/pricing";

export function QuoteActions({
  quoteId,
  status,
  units,
  productCount,
  total,
}: {
  quoteId: string;
  status: string;
  units: number;
  productCount: number;
  total: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"confirm" | "cancel" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (status !== "RESERVED") return null;

  async function act(action: "confirm" | "cancel") {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo completar la acción");
        return;
      }
      setPending(null);
      router.refresh();
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (pending === "confirm") {
    return (
      <ConfirmPanel
        title="¿Confirmar la venta?"
        detail={
          <>
            Saldrán <strong className="tabular-nums text-ink">{units}</strong>{" "}
            unidades de {productCount}{" "}
            {productCount === 1 ? "producto" : "productos"} del stock físico, por{" "}
            <strong className="tabular-nums text-ink">{formatRD(total)}</strong>.
            Esto no se puede deshacer.
          </>
        }
        confirmLabel="Sí, confirmar venta"
        loadingLabel="Confirmando…"
        loading={loading}
        error={error}
        onConfirm={() => act("confirm")}
        onDismiss={() => {
          setPending(null);
          setError("");
        }}
      />
    );
  }

  if (pending === "cancel") {
    return (
      <ConfirmPanel
        title="¿Cancelar la cotización?"
        detail={
          <>
            Se liberarán las{" "}
            <strong className="tabular-nums text-ink">{units}</strong> unidades
            reservadas y volverán a estar disponibles para otros clientes.
          </>
        }
        confirmLabel="Sí, cancelar cotización"
        loadingLabel="Cancelando…"
        tone="danger"
        loading={loading}
        error={error}
        onConfirm={() => act("cancel")}
        onDismiss={() => {
          setPending(null);
          setError("");
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="gold"
        className="w-full"
        onClick={() => setPending("confirm")}
      >
        Confirmar venta
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full text-danger"
        onClick={() => setPending("cancel")}
      >
        Cancelar cotización
      </Button>
    </div>
  );
}
