"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";
import { ConfirmPanel } from "./confirm-panel";
import { formatRD } from "@/lib/pricing";
import { shareQuotePdf } from "@/lib/share-quote-pdf";

export function QuoteActions({
  quoteId,
  status,
  units,
  productCount,
  total,
  number,
  customerName,
  customerPhone,
}: {
  quoteId: string;
  status: string;
  units: number;
  productCount: number;
  total: number;
  number: number;
  customerName: string;
  customerPhone?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"confirm" | "cancel" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareHint, setShareHint] = useState("");

  const canConfirm = status === "RESERVED";
  const canAnnul = status === "RESERVED" || status === "CONFIRMED";

  if (!canConfirm && !canAnnul) return null;

  async function act(action: "confirm" | "cancel") {
    setLoading(true);
    setError("");
    setShareHint("");
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

      if (action === "confirm") {
        setShareHint("Venta confirmada. Abriendo PDF para imprimir o enviar…");
        await shareQuotePdf({
          quoteId,
          number,
          customerName,
          customerPhone,
          totalText: formatRD(total),
        });
      }

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
            {productCount === 1 ? "electrodoméstico" : "electrodomésticos"} del stock
            físico, por{" "}
            <strong className="tabular-nums text-ink">{formatRD(total)}</strong>.
            Después podrás imprimir o enviar el PDF.
          </>
        }
        confirmLabel="Sí, confirmar e imprimir PDF"
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
        title={status === "CONFIRMED" ? "¿Anular la venta?" : "¿Anular el pedido?"}
        detail={
          status === "CONFIRMED" ? (
            <>
              Se devolverán{" "}
              <strong className="tabular-nums text-ink">{units}</strong> unidades
              al stock físico y el pedido quedará anulado.
            </>
          ) : (
            <>
              Se liberarán las{" "}
              <strong className="tabular-nums text-ink">{units}</strong> unidades
              reservadas y volverán a estar disponibles.
            </>
          )
        }
        confirmLabel="Sí, anular"
        loadingLabel="Anulando…"
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
      {canConfirm ? (
        <Button
          type="button"
          variant="gold"
          className="w-full"
          onClick={() => setPending("confirm")}
        >
          Confirmar venta
        </Button>
      ) : null}
      {canAnnul ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-danger"
          onClick={() => setPending("cancel")}
        >
          {status === "CONFIRMED" ? "Anular factura" : "Anular pedido"}
        </Button>
      ) : null}
      {shareHint ? (
        <p className="text-center text-xs text-muted">{shareHint}</p>
      ) : null}
    </div>
  );
}
