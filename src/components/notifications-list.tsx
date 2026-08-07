"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Button, Card, EmptyState } from "./ui";
import type { AppNotification } from "@/lib/types";

export function NotificationsList() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: AppNotification[] };
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function markAll() {
    await fetch("/api/notifications", { method: "PATCH" });
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  async function openItem(n: AppNotification) {
    if (!n.read) {
      void fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Cargando…</p>;
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-3">
      {unread > 0 ? (
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={() => void markAll()}>
            Marcar todas como leídas
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Sin notificaciones"
          body="Cuando haya pedidos nuevos o facturados, aparecerán aquí."
        />
      ) : (
        items.map((n) => (
          <Link
            key={n.id}
            href={`/quotes/${n.quoteId}`}
            onClick={() => void openItem(n)}
          >
            <Card
              className={`mb-2 space-y-1 py-3 ${
                n.read ? "" : "border-gold/50 bg-gold/5"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-ink">{n.title}</p>
                {!n.read ? (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold" />
                ) : null}
              </div>
              <p className="text-sm text-muted">{n.body}</p>
              <p className="text-xs text-muted">
                {format(parseISO(n.createdAt), "dd MMM HH:mm", { locale: es })}
              </p>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
