"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "./ui";
import {
  enablePushNotifications,
  pushSupported,
  registerPushServiceWorker,
} from "@/lib/push-client";

const DISMISS_KEY = "kngold-push-dismissed";

export function PushEnableBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    void registerPushServiceWorker();

    if (!pushSupported()) {
      // iOS Safari en pestaña: PushManager no existe hasta instalar en inicio
      const isIos =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (isIos && !window.matchMedia("(display-mode: standalone)").matches) {
        if (localStorage.getItem(DISMISS_KEY) === "1") return;
        setHint(
          "En iPhone: Comparte → Agregar a pantalla de inicio, abre KN GOLD desde el ícono y luego activa avisos."
        );
        setVisible(true);
      }
      return;
    }

    if (Notification.permission === "granted") {
      // Renovar suscripción en segundo plano
      void enablePushNotifications();
      return;
    }
    if (Notification.permission === "denied") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setVisible(true);
  }, []);

  async function activate() {
    setBusy(true);
    setHint("");
    try {
      if (!pushSupported()) {
        setHint(
          "Instala la app en la pantalla de inicio y ábrela desde ahí para activar avisos."
        );
        return;
      }
      const result = await enablePushNotifications();
      if (result === "granted") {
        setVisible(false);
        localStorage.removeItem(DISMISS_KEY);
        return;
      }
      if (result === "denied") {
        setHint("Permiso denegado. Actívalo en Ajustes del celular → Notificaciones.");
      } else if (result === "unsupported") {
        setHint(
          "Este dispositivo no admite avisos push. En iPhone instala la app en inicio."
        );
      } else {
        setHint("No se pudo activar. Intenta de nuevo.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <Card className="mb-4 border-gold/40 bg-gold/5 py-3">
      <p className="text-sm font-semibold text-ink">Avisos en el celular</p>
      <p className="mt-1 text-xs text-muted">
        Activa las notificaciones para enterarte de pedidos y facturas aunque la
        app esté cerrada.
      </p>
      {hint ? <p className="mt-2 text-xs text-danger">{hint}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="gold"
          className="flex-1"
          loading={busy}
          onClick={() => void activate()}
        >
          Activar avisos
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, "1");
            setVisible(false);
          }}
        >
          Ahora no
        </Button>
      </div>
    </Card>
  );
}
