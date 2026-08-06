"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  buildActivityCsv,
  type AppUserSummary,
  type UserActivityRow,
} from "@/lib/activity-export";
import { movementTone } from "@/lib/labels";
import { roleLabel } from "@/lib/roles";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export function UserActivityPanel({
  users,
  rows,
  filters,
}: {
  users: AppUserSummary[];
  rows: UserActivityRow[];
  filters: { userId: string; from: string; to: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState(filters.userId);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);

  const csv = useMemo(() => buildActivityCsv(rows), [rows]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    startTransition(() => {
      const base = "/settings?tab=activity";
      router.push(qs ? `${base}&${qs}` : base);
    });
  }

  function downloadCsv() {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const who =
      users.find((u) => u.id === filters.userId)?.name.replace(/\s+/g, "-") ||
      "todos";
    a.href = url;
    a.download = `actividad-${who}-${filters.from || "inicio"}-${filters.to || "hoy"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={applyFilters} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium tracking-wide text-muted">
              Usuario
            </label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
            >
              <option value="">Todos los usuarios</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({roleLabel(u.role)}
                  {!u.active ? " · inactivo" : ""})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-muted">
                Desde
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium tracking-wide text-muted">
                Hasta
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={pending} className="flex-1">
              Filtrar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={downloadCsv}
              disabled={rows.length === 0}
              className="flex-1"
            >
              Descargar CSV
            </Button>
          </div>
        </form>
      </Card>

      <p className="text-sm text-muted">
        {rows.length} registro{rows.length === 1 ? "" : "s"}
        {filters.userId
          ? ` · ${users.find((u) => u.id === filters.userId)?.name || "usuario"}`
          : ""}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin actividad en este rango"
          body="Prueba otro usuario o amplía las fechas."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="py-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone={movementTone(r.type)}>{r.actionLabel}</Badge>
                {r.quoteId && r.quoteNumber != null ? (
                  <Link
                    href={`/quotes/${r.quoteId}`}
                    className="text-xs font-semibold text-gold-dark underline-offset-2 hover:underline"
                  >
                    Cot. #{r.quoteNumber}
                  </Link>
                ) : r.quoteNumber != null ? (
                  <span className="text-xs text-muted">Cot. #{r.quoteNumber}</span>
                ) : null}
              </div>
              <p className="font-semibold">
                {r.productSku} — {r.productName}
              </p>
              <p className="text-sm text-muted">
                {r.userName} ·{" "}
                {format(parseISO(r.createdAt), "dd MMM yyyy · HH:mm", { locale: es })} · qty{" "}
                {r.qty}
              </p>
              {r.note ? <p className="mt-1 text-xs text-muted">{r.note}</p> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
