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
  | "retry"
  | "error";

type PreparedPdf = {
  blob: Blob;
  filename: string;
  expiresAt: number;
};

const preparedPdfs = new Map<string, PreparedPdf>();

function prefersNativeShare(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  const mobile = /Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  return mobile || standalone;
}

function openWindow(url: string): Window | null {
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    return w && !w.closed ? w : null;
  } catch {
    return null;
  }
}

function cachePdf(quoteId: string, blob: Blob, filename: string) {
  preparedPdfs.set(quoteId, {
    blob,
    filename,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
}

function getCachedFile(quoteId: string): File | null {
  const hit = preparedPdfs.get(quoteId);
  if (!hit || hit.expiresAt < Date.now()) {
    preparedPdfs.delete(quoteId);
    return null;
  }

  return new File([hit.blob], hit.filename, {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}

async function sharePdfFile(file: File): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  const canShareFiles =
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  if (!canShareFiles && !prefersNativeShare()) {
    return false;
  }

  try {
    // iOS/PWA: mezclar text/title con files suele fallar o manda solo texto a WhatsApp.
    await navigator.share({ files: [file] });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw e;
    }
    return false;
  }
}

async function sharePdfText(text: string, number: number): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  try {
    await navigator.share({
      title: `Pedido #${number}`,
      text,
    });
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw e;
    }
    return false;
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
  const nativeShare = prefersNativeShare();

  let pdfWindow: Window | null = null;
  let waWindow: Window | null = null;

  if (!nativeShare) {
    pdfWindow = openWindow(pdfPath);
    if (waUrl) {
      waWindow = openWindow(waUrl);
    }
  }

  const cachedFile = nativeShare ? getCachedFile(opts.quoteId) : null;
  if (cachedFile) {
    try {
      if (await sharePdfFile(cachedFile)) {
        return "shared";
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  try {
    const res = await fetch(pdfPath, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) throw new Error("No se pudo generar el PDF");
    const blob = await res.blob();
    const file = new File([blob], filename, {
      type: "application/pdf",
      lastModified: Date.now(),
    });

    if (nativeShare) {
      cachePdf(opts.quoteId, blob, filename);
    }

    try {
      if (await sharePdfFile(file)) {
        preparedPdfs.delete(opts.quoteId);
        return "shared";
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return "cancelled";
      }
    }

    if (nativeShare) {
      try {
        if (await sharePdfText(text, opts.number)) {
          return "shared";
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return "cancelled";
        }
      }

      // PDF ya está listo; un segundo toque abre la hoja de compartir al instante.
      return "retry";
    }

    try {
      if (await sharePdfText(text, opts.number)) {
        if (!pdfWindow) {
          pdfWindow = openWindow(pdfPath);
        }
        return "shared";
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return "cancelled";
      }
    }

    if (waUrl) {
      if (!waWindow) {
        waWindow = openWindow(waUrl);
      }
      if (!pdfWindow) {
        pdfWindow = openWindow(pdfPath);
      }
      return waWindow || pdfWindow ? "whatsapp" : "error";
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
    if (nativeShare && preparedPdfs.has(opts.quoteId)) return "retry";
    return "error";
  }
}
