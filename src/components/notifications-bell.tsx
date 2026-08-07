"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  playNotificationSound,
  unlockNotificationSound,
} from "@/lib/notification-sound";

const POLL_MS = 120_000; // 2 min — no quemar cuota de Firestore

export function NotificationsBell() {
  const [unread, setUnread] = useState(0);
  const prevUnread = useRef<number | null>(null);
  const primed = useRef(false);

  const refresh = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread?: number };
      const next = Number(data.unread) || 0;

      if (prevUnread.current !== null && next > prevUnread.current) {
        playNotificationSound();
      }
      prevUnread.current = next;
      setUnread(next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const prime = () => {
      if (primed.current) return;
      primed.current = true;
      void unlockNotificationSound();
    };
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });

    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    const onVis = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, [refresh]);

  return (
    <Link
      href="/notifications"
      aria-label={
        unread > 0
          ? `Notificaciones, ${unread} sin leer`
          : "Notificaciones"
      }
      className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/25 px-2.5 text-white"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-ink">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
