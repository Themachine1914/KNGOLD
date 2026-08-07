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

function openWindow(url: string): Window | null {
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    return w && !w.closed ? w : null;
  } catch {
    return null;
  }
}

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

  const waPhone = toWhatsAppPhone(opts.customerPhone);
  const waUrl = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`
    : null;

  const isMobile =
    typeof navigator !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  // Pre-open on user gesture before async work (popup blockers).
  // On mobile with WhatsApp, prefer the native share sheet over extra tabs.
  let pdfWindow: Window | null = null;
  let waWindow: Window | null = null;

  if (!isMobile || !waUrl) {
    pdfWindow = openWindow(pdfPath);
  }

  if (waUrl && !isMobile) {
    waWindow = openWindow(waUrl);
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
        waWindow?.close();
        return "shared";
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          if (waWindow) return "whatsapp";
          if (pdfWindow) return "opened";
          return "cancelled";
        }
      }
    }

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Pedido #${opts.number}`, text });
        if (!pdfWindow) {
          pdfWindow = openWindow(pdfPath);
        }
        return "shared";
      } catch {
        /* continue to WhatsApp / open */
      }
    }

    if (waUrl) {
      if (!waWindow) {
        waWindow = openWindow(waUrl);
      }
      if (!pdfWindow) {
        pdfWindow = openWindow(pdfPath);
      }
      return "whatsapp";
    }

    if (pdfWindow) return "opened";

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
    if (waWindow) return "whatsapp";
    if (pdfWindow) return "opened";
    return "error";
  }
}
