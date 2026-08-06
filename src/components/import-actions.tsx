"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";
import { ConfirmPanel } from "./confirm-panel";

export function ImportActions({
  importId,
  status,
  units,
  productCount,
}: {
  importId: string;
  status: string;
  units: number;
  productCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"arrive" | "cancel" | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (status === "ARRIVED" || status === "CANCELLED") return null;

  async function act(action: "transit" | "arrive" | "cancel") {
    setLoading(action);
    setError("");
    try {
      const res = await fetch(`/api/imports/${importId}/${action}`, {
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
      setLoading(null);
    }
  }

  if (pending === "arrive") {
    return (
      <ConfirmPanel
        title="¿El pedido ya llegó?"
        detail={
          <>
            Entrarán <strong className="tabular-nums text-ink">{units}</strong>{" "}
            unidades de {productCount}{" "}
            {productCount === 1 ? "electrodoméstico" : "electrodomésticos"} al stock
            físico.
            {status === "ORDERED"
              ? " El pedido nunca se marcó en tránsito; se dará por llegado igual."
              : ""}{" "}
            Esto no se puede deshacer.
          </>
        }
        confirmLabel="Sí, entró a stock"
        loadingLabel="Entrando a stock…"
        loading={loading === "arrive"}
        error={error}
        onConfirm={() => act("arrive")}
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
        title="¿Cancelar el pedido?"
        detail={
          <>
            Las <strong className="tabular-nums text-ink">{units}</strong>{" "}
            unidades no entrarán al inventario y el pedido quedará cerrado.
          </>
        }
        confirmLabel="Sí, cancelar pedido"
        loadingLabel="Cancelando…"
        tone="danger"
        loading={loading === "cancel"}
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
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {status === "ORDERED" ? (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          loading={loading === "transit"}
          onClick={() => act("transit")}
        >
          {loading === "transit" ? "Marcando…" : "Marcar en tránsito"}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="gold"
        className="w-full"
        disabled={!!loading}
        onClick={() => setPending("arrive")}
      >
        Confirmar llegada
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full text-danger"
        disabled={!!loading}
        onClick={() => setPending("cancel")}
      >
        Cancelar pedido
      </Button>
    </div>
  );
}
