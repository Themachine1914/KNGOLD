"use client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function enablePushNotifications(): Promise<
  "granted" | "denied" | "unsupported" | "error"
> {
  if (!pushSupported()) return "unsupported";

  try {
    const reg = await registerPushServiceWorker();
    if (!reg) return "error";

    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return permission === "denied" ? "denied" : "error";
    }

    const vapidRes = await fetch("/api/push/vapid", { cache: "no-store" });
    if (!vapidRes.ok) return "error";
    const { publicKey } = (await vapidRes.json()) as { publicKey?: string };
    if (!publicKey) return "error";

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      try {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            publicKey
          ) as BufferSource,
        });
      } catch {
        // En localhost / algunos navegadores el push del sistema no está disponible
        return "unsupported";
      }
    }

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return res.ok ? "granted" : "error";
  } catch {
    return "error";
  }
}
