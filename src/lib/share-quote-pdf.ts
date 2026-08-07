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
  const text = [
    `Pedido KN GOLD #${opts.number}`,
    opts.customerName ? `Cliente: ${opts.customerName}` : null,
    opts.totalText ? `Total: ${opts.totalText}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(`/api/quotes/${opts.quoteId}/pdf`);
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
          return "cancelled";
        }
        throw e;
      }
    }

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Pedido #${opts.number}`, text });
      } catch {
        /* ignore and continue to WhatsApp / open */
      }
    }

    const waPhone = toWhatsAppPhone(opts.customerPhone);
    if (waPhone) {
      const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      // Also open PDF so they can attach/share from the viewer if needed
      window.open(`/api/quotes/${opts.quoteId}/pdf`, "_blank", "noopener,noreferrer");
      return "whatsapp";
    }

    window.open(`/api/quotes/${opts.quoteId}/pdf`, "_blank", "noopener,noreferrer");
    return "opened";
  } catch {
    return "error";
  }
}
