"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ListFilterValues, ListSort } from "@/lib/list-filters";
import { Button, Card, Input, Label } from "@/components/ui";

export type FilterUserOption = { id: string; name: string };

export function ListFiltersBar({
  basePath,
  filters,
  users,
  userLabel = "Vendedor",
  searchPlaceholder = "Buscar…",
}: {
  basePath: string;
  filters: ListFilterValues;
  users?: FilterUserOption[];
  userLabel?: string;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [userId, setUserId] = useState(filters.userId);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [sort, setSort] = useState<ListSort>(filters.sort);

  function push(next: ListFilterValues) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.userId) params.set("userId", next.userId);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${basePath}?${qs}` : basePath);
    });
  }

  function apply(e: React.FormEvent) {
    e.preventDefault();
    push({ q: q.trim(), userId, from, to, sort });
  }

  function clear() {
    setQ("");
    setUserId("");
    setFrom("");
    setTo("");
    setSort("newest");
    push({ q: "", userId: "", from: "", to: "", sort: "newest" });
  }

  const showUsers = (users?.length || 0) > 0;

  return (
    <Card className="mb-4 py-3">
      <form onSubmit={apply} className="space-y-3">
        <div>
          <Label htmlFor="list-q">Buscar</Label>
          <Input
            id="list-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
          />
        </div>

        <div className={`grid gap-3 ${showUsers ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          {showUsers ? (
            <div>
              <Label htmlFor="list-user">{userLabel}</Label>
              <select
                id="list-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none ring-gold/30 focus:ring-2"
              >
                <option value="">Todos</option>
                {users!.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <Label htmlFor="list-sort">Organizar por fecha</Label>
            <select
              id="list-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as ListSort)}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none ring-gold/30 focus:ring-2"
            >
              <option value="newest">Más recientes primero</option>
              <option value="oldest">Más antiguos primero</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="list-from">Desde</Label>
            <Input
              id="list-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="list-to">Hasta</Label>
            <Input
              id="list-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" loading={pending} className="flex-1 px-3 py-2 text-xs">
            Filtrar
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={clear}
            className="px-3 py-2 text-xs"
          >
            Limpiar
          </Button>
        </div>
      </form>
    </Card>
  );
}
