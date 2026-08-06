"use client";

import Link from "next/link";
import { useState } from "react";
import type { DailyInventorySummary } from "@/lib/types";
import { formatRD } from "@/lib/pricing";
import { Card } from "./ui";

function MoneyStat({
  label,
  amount,
  hint,
}: {
  label: string;
  amount: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-2.5 py-2">
      <p className="min-h-[2.5em] text-[10px] font-medium leading-tight tracking-wide text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold tabular-nums leading-tight ${
          amount > 0 ? "text-ink" : amount < 0 ? "text-danger" : "text-muted"
        }`}
      >
        {formatRD(amount)}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
    </div>
  );
}

function timeDO(iso: string) {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function DailyInventoryBoard({
  days,
  showDetailLink = true,
}: {
  days: DailyInventorySummary[];
  showDetailLink?: boolean;
}) {
  const [openDate, setOpenDate] = useState<string | null>(
    days.find((d) => d.label === "Hoy")?.date ?? days[0]?.date ?? null
  );

  const visible = days.filter((day) => {
    const hasActivity =
      day.events > 0 ||
      day.physicalIn ||
      day.physicalOut ||
      day.reserveIn ||
      day.reserveOut ||
      day.transitIn ||
      day.transitOut ||
      day.reservedAmount ||
      day.soldAmount ||
      day.transitAmount;
    return hasActivity || day.label === "Hoy" || day.label === "Ayer";
  });

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-muted">
          Inventario por día
        </h2>
        {showDetailLink ? (
          <Link href="/movements" className="text-sm font-semibold text-gold-dark">
            Detalle
          </Link>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-muted">
        Totales en dinero: pedido, facturado y reservado de tránsito. Toca el día para ver clientes.
      </p>

      {visible.every((d) => d.events === 0) ? (
        <Card className="py-4 text-sm text-muted">
          Aún no hay movimientos registrados.
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((day) => {
            const open = openDate === day.date;
            const clients = day.reservations || [];
            const physNet = day.physicalIn - day.physicalOut;
            return (
              <Card key={day.date} className="space-y-2 py-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setOpenDate(open ? null : day.date)}
                  aria-expanded={open}
                >
                  <div>
                    <p className="font-semibold text-ink">{day.label}</p>
                    <p className="text-xs text-muted">
                      {day.date}
                      {day.events > 0
                        ? ` · ${day.events} movimientos`
                        : " · sin movimientos"}
                      {` · físico ${physNet >= 0 ? "+" : ""}${physNet} uds`}
                      {clients.length > 0
                        ? ` · ${clients.length} ${
                            clients.length === 1 ? "cliente" : "clientes"
                          }`
                        : ""}
                    </p>
                  </div>
                  <span className="text-lg text-muted" aria-hidden>
                    {open ? "−" : "+"}
                  </span>
                </button>

                <div className="grid grid-cols-3 gap-2">
                  <MoneyStat
                    label="Pedido"
                    amount={day.reservedAmount || 0}
                    hint={`${day.reserveIn} uds + · ${day.reserveOut} uds −`}
                  />
                  <MoneyStat
                    label="Facturado"
                    amount={day.soldAmount || 0}
                    hint="Ventas confirmadas"
                  />
                  <MoneyStat
                    label="Reservado de tránsito"
                    amount={day.transitAmount || 0}
                    hint={`${day.transitIn} uds + · ${day.transitOut} uds −`}
                  />
                </div>

                {open ? (
                  <div className="border-t border-border pt-2">
                    <p className="mb-2 text-[11px] font-medium tracking-wide text-muted">
                      Quién reservó
                    </p>
                    {clients.length === 0 ? (
                      <p className="text-sm text-muted">
                        Nadie reservó este día (solo hubo otros movimientos).
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {clients.map((c) => (
                          <li key={c.quoteId}>
                            <Link
                              href={`/quotes/${c.quoteId}`}
                              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-ink">
                                  {c.customerName}
                                </p>
                                <p className="text-xs text-muted">
                                  Cot. #{c.number} · {timeDO(c.lastAt)} · {c.units} uds
                                  {c.transitUnits > 0
                                    ? ` · ${c.transitUnits} tránsito`
                                    : ""}
                                </p>
                              </div>
                              <p className="shrink-0 text-sm font-semibold tabular-nums text-gold-dark">
                                {formatRD(c.amount || 0)}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
