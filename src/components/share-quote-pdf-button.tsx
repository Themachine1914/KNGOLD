"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { formatRD } from "@/lib/pricing";
import { shareQuotePdf } from "@/lib/share-quote-pdf";

export function ShareQuotePdfButton({
  quoteId,
  number,
  customerName,
  customerPhone,
  total,
  autoShare = false,
  variant = "gold",
  label = "Enviar por WhatsApp",
}: {
  quoteId: string;
  number: number;
  customerName: string;
  customerPhone?: string | null;
  total: number;
  autoShare?: boolean;
  variant?: "gold" | "secondary";
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");
  const triedAuto = useRef(false);

  async function onShare() {
    setLoading(true);
    setHint("");
    try {
      const result = await shareQuotePdf({
        quoteId,
        number,
        customerName,
        customerPhone,
        totalText: formatRD(total),
      });

      if (result === "shared") {
        setHint("Listo. Elige WhatsApp o Imprimir.");
      } else if (result === "whatsapp") {
        setHint("Se abrió WhatsApp. Si hace falta, adjunta el PDF desde el visor.");
      } else if (result === "opened") {
        setHint("PDF abierto. Usa imprimir o compartir desde el visor.");
      } else if (result === "cancelled") {
        setHint("");
      } else {
        setHint("No se pudo abrir el PDF. Permite ventanas emergentes e intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoShare || triedAuto.current) return;
    triedAuto.current = true;
    // Auto-share after create; may be blocked without gesture — button remains.
    void onShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoShare]);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant={variant}
        className="w-full"
        loading={loading}
        onClick={onShare}
      >
        {loading ? "Preparando PDF…" : label}
      </Button>
      {hint ? <p className="text-center text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
