export function toWhatsAppPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits;
}

export type ShareQuotePdfResult =
  | "shared"
  | "whatsapp"
  | "opened"
  | "cancelled"
  | "error";

export async function shareQuotePdf(opts: {
  quoteId: string;
  number: number;
  customerName: string;
  customerPhone?: string | null;
  totalText?: string;
}): Promise<ShareQuotePdfResult> {
  const filename = `pedido-KN-${opts.number}.pdf`;
  const pdfPath = `/api/quotes/${opts.quoteId}/pdf`;
  const text = [
    `Pedido KN GOLD #${opts.number}`,
    opts.customerName ? `Cliente: ${opts.customerName}` : null,
    opts.totalText ? `Total: ${opts.totalText}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Abrir en el mismo gesto del usuario (si se espera al fetch, el popup se bloquea).
  let opened = false;
  try {
    const w = window.open(pdfPath, "_blank", "noopener,noreferrer");
    opened = Boolean(w && !w.closed);
  } catch {
    opened = false;
  }

  try {
    const res = await fetch(pdfPath, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo generar el PDF");
    const blob = await res.blob();
    const file = new File([blob], filename, { type: "application/pdf" });

    const canShareFiles =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (canShareFiles) {
      try {
        await navigator.share({
          files: [file],
          title: `Pedido #${opts.number}`,
          text,
        });
        return "shared";
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return opened ? "opened" : "cancelled";
        }
      }
    }

    const waPhone = toWhatsAppPhone(opts.customerPhone);
    if (waPhone) {
      const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.open(pdfPath, "_blank", "noopener,noreferrer");
      }
      return "whatsapp";
    }

    if (opened) return "opened";

    // Último recurso: forzar descarga / apertura por enlace
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return "opened";
  } catch {
    return opened ? "opened" : "error";
  }
}
