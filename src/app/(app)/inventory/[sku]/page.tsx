import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { getProductHistory, movementDelta } from "@/lib/inventory";
import { formatRD } from "@/lib/pricing";
import { fmtDate } from "@/lib/dates";
import { importStatusLabel, importStatusTone, movementLabel, movementTone } from "@/lib/labels";
import { productDisplayName } from "@/lib/product-label";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ProductThumb } from "@/components/product-thumb";

function Stat({
  label,
  value,
  hint,
  tone = "ink",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "ink" | "gold" | "success" | "danger";
}) {
  const tones = {
    ink: "text-ink",
    gold: "text-gold-dark",
    success: "text-success",
    danger: "text-danger",
  };
  return (
    <div className="rounded-xl border border-border bg-white px-2.5 py-2 text-center">
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function ProductHistoryPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const session = await auth();
  const { sku } = await params;
  const history = await getProductHistory(sku);
  if (!history) notFound();

  const isManager = isOpsManager(session!.user.role);
  const { product, holds, incoming, movements, stats } = history;
  const name = productDisplayName(product.name);
  const arriving = product.inTransit ?? 0;
  const reservedOnArrival = product.transitApartado ?? 0;
  const freeOnArrival = product.availableTransit ?? 0;
  const warehouseReserved = product.reserved ?? 0;
  const warehouseFree = product.available ?? 0;
  const reservedTotal = warehouseReserved + reservedOnArrival;
  const availableTotal = product.availableTotal ?? warehouseFree + freeOnArrival;
  const physicalAfter = product.stockOnHand + arriving;
  const reservedAfter = warehouseReserved + reservedOnArrival;

  const dispTone =
    availableTotal <= 0
      ? "danger"
      : warehouseFree <= 0 && freeOnArrival > 0
        ? "warn"
        : warehouseFree <= LOW_STOCK_THRESHOLD
          ? "warn"
          : "success";

  return (
    <div>
      <PageHeader
        title={product.sku}
        subtitle={name}
        action={<Badge tone={dispTone}>Disp. {availableTotal}</Badge>}
      />

      <div className="space-y-3">
        <Card>
          <div className="flex items-start gap-3">
            <ProductThumb sku={product.sku} alt={name} imageUrl={product.imageUrl} />
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-gold-dark">
                {product.type} · {product.sku}
              </p>
              <p className="mt-0.5 font-semibold text-ink">{name}</p>
              <p className="text-sm text-muted">
                {[product.description, product.color].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-sm font-semibold">{formatRD(product.netPrice)}</p>
            </div>
          </div>
        </Card>

        <a
          href={`/api/inventory/${encodeURIComponent(product.sku)}/pdf`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-ink"
        >
          Descargar resumen PDF
        </a>

        <Card>
          <p className="font-semibold text-ink">Registro</p>
          <p className="mt-1 text-sm text-muted">
            Stock al dar de alta, lo que viene en camino y lo que ya está apartado.
            {stats.registeredAt
              ? ` Alta: ${fmtDate(stats.registeredAt, "dd MMM yyyy")}.`
              : ""}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat
              label="Al registrar"
              value={stats.registeredStock}
              hint="Físico inicial"
            />
            <Stat
              label="En tránsito"
              value={arriving}
              hint="En camino"
              tone="gold"
            />
            <Stat
              label="Reservadas"
              value={reservedTotal}
              hint="Almacén + tránsito"
              tone="gold"
            />
          </div>
          <p className="mt-3 text-sm text-muted">
            Al dar de alta había{" "}
            <span className="font-semibold tabular-nums text-ink">{stats.registeredStock}</span>{" "}
            UND. Hoy el físico es{" "}
            <span className="font-semibold tabular-nums text-ink">{product.stockOnHand}</span>
            {stats.soldQty > 0 ? ` · vendidas ${stats.soldQty}` : ""}.
            {arriving > 0 ? (
              <>
                {" "}
                En tránsito van{" "}
                <span className="font-semibold tabular-nums text-ink">{arriving}</span>
                {" "}({reservedOnArrival} ya reservadas para despachar + {freeOnArrival} libres).
              </>
            ) : (
              " No hay importación abierta."
            )}{" "}
            Reservado ahora:{" "}
            <span className="font-semibold tabular-nums text-ink">{reservedTotal}</span> UND
            {" "}({warehouseReserved} de almacén + {reservedOnArrival} de lo que viene).
          </p>
        </Card>

        {arriving > 0 ? (
          <Card className="border-gold/40 bg-gold/5">
            <p className="font-semibold text-gold-dark">Cuando llegue, para despachar</p>
            <p className="mt-1 text-sm text-muted">
              Hay <span className="font-semibold tabular-nums text-ink">{arriving}</span> UND
              en camino.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat
                label="Ya apartadas"
                value={reservedOnArrival}
                hint="Se despachan a pedidos"
                tone="gold"
              />
              <Stat
                label="Llegan libres"
                value={freeOnArrival}
                hint="Se pueden vender"
                tone="success"
              />
            </div>
            <p className="mt-3 text-sm text-muted">
              Al recibir el lote, las{" "}
              <span className="font-semibold tabular-nums text-ink">{reservedOnArrival}</span>{" "}
              apartadas pasan a reserva de almacén y se pueden facturar / despachar a esos
              clientes. Las{" "}
              <span className="font-semibold tabular-nums text-ink">{freeOnArrival}</span>{" "}
              restantes quedan disponibles.
            </p>
            {isManager ? (
              <p className="mt-2 text-xs text-muted">
                Después de la llegada: físico{" "}
                <span className="font-semibold tabular-nums text-ink">{physicalAfter}</span>
                {" · "}reservado{" "}
                <span className="font-semibold tabular-nums text-ink">{reservedAfter}</span>
                {" · "}disponible{" "}
                <span className="font-semibold tabular-nums text-ink">
                  {warehouseFree + freeOnArrival}
                </span>
                . El almacén de hoy ({warehouseReserved} reservadas, {warehouseFree} libres)
                no cambia hasta facturar o anular.
              </p>
            ) : null}
          </Card>
        ) : (
          <Card>
            <p className="font-semibold text-ink">Nada en camino</p>
            <p className="mt-1 text-sm text-muted">
              No hay importación abierta de este código. Lo reservado para despachar es solo
              lo que ya está en almacén.
            </p>
          </Card>
        )}

        <div
          className={`grid gap-2 ${isManager ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}
        >
          {isManager ? (
            <>
              <Stat label="Físico" value={product.stockOnHand} />
              <Stat label="Reservado" value={warehouseReserved} tone="gold" />
            </>
          ) : null}
          <Stat label="Almacén" value={warehouseFree} tone="success" />
          <Stat label="Tránsito libre" value={freeOnArrival} tone="gold" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Vendidas (hist.)" value={stats.soldQty} />
          <Stat label="Entradas (hist.)" value={stats.enteredQty} />
        </div>
        {stats.firstMovementAt ? (
          <p className="px-0.5 text-xs text-muted">
            Registro desde {fmtDate(stats.firstMovementAt, "dd MMM yyyy")}
            {stats.lastMovementAt
              ? ` · último movimiento ${fmtDate(stats.lastMovementAt, "dd MMM yyyy HH:mm")}`
              : ""}
          </p>
        ) : (
          <p className="px-0.5 text-xs text-muted">Aún no hay movimientos de este código.</p>
        )}

        {incoming.length > 0 ? (
          <Card className="space-y-2">
            <p className="font-semibold text-ink">Importaciones en camino</p>
            <p className="text-xs text-muted">
              Si llegan en este orden (por fecha ETA), los apartados se asignan a los
              pedidos más antiguos primero.
            </p>
            {incoming.map((lot) => (
              <Link
                key={lot.importId}
                href={`/imports/${lot.importId}`}
                prefetch={false}
                className="block rounded-xl border border-border bg-white px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      Pedido #{lot.number}
                      {lot.supplier ? ` · ${lot.supplier}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      ETA {fmtDate(lot.eta, "EEEE d MMM yyyy")}
                    </p>
                  </div>
                  <Badge tone={importStatusTone(lot.status)}>
                    {importStatusLabel(lot.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm tabular-nums">
                  {lot.qty} UND · {lot.reservedOnArrival} apartadas al llegar ·{" "}
                  {lot.freeOnArrival} libres
                </p>
              </Link>
            ))}
          </Card>
        ) : null}

        <Card className="space-y-2">
          <p className="font-semibold text-ink">Pedidos que retienen unidades</p>
          <p className="text-xs text-muted">
            Orden de llegada: el más antiguo se despacha primero cuando entra la mercancía.
          </p>
          {holds.length === 0 ? (
            <EmptyState
              title="Sin reservas activas"
              body="Nadie tiene este producto apartado ahora."
            />
          ) : (
            <div className="space-y-2">
              {holds.map((h) => {
                const canOpen = isManager || h.sellerId === session!.user.id;
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{h.customerName}</p>
                        <p className="text-xs text-muted">
                          Pedido #{h.number} · {h.sellerName} ·{" "}
                          {fmtDate(h.createdAt, "dd MMM yyyy")}
                        </p>
                      </div>
                      <p className="shrink-0 text-lg font-semibold tabular-nums">{h.qty}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {h.stockQty > 0 ? `${h.stockQty} en almacén` : null}
                      {h.stockQty > 0 && h.transitQty > 0 ? " · " : null}
                      {h.transitQty > 0
                        ? `${h.transitQty} apartadas de lo que viene (despacho al llegar)`
                        : null}
                    </p>
                  </>
                );
                const className =
                  "block rounded-xl border border-border bg-white px-3 py-2";
                return canOpen ? (
                  <Link
                    key={h.quoteId}
                    href={`/quotes/${h.quoteId}`}
                    prefetch={false}
                    className={className}
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={h.quoteId} className={className}>
                    {body}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {isManager ? (
          <div className="space-y-2">
            <p className="px-0.5 text-sm font-semibold text-ink">Historial de movimientos</p>
            {movements.length === 0 ? (
              <EmptyState title="Sin bitácora" body="Este código aún no tiene movimientos." />
            ) : (
              movements.map((m) => {
                const delta = movementDelta(m.type, m.qty);
                const remaining = delta.availableFocus ? m.availableAfter : m.stockAfter;
                return (
                  <Card key={m.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge tone={movementTone(m.type)}>{movementLabel(m.type)}</Badge>
                          {m.quote ? (
                            <Link
                              href={`/quotes/${m.quoteId}`}
                              prefetch={false}
                              className="text-xs font-semibold text-ink"
                            >
                              Pedido #{m.quote.number}
                            </Link>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted">
                          {m.user?.name || "Sistema"} · {fmtDate(m.createdAt, "dd MMM · HH:mm")}
                        </p>
                        {m.note ? <p className="mt-1 text-xs text-muted">{m.note}</p> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        {m.type === "CAMBIO_PRECIO" ? (
                          <p className="max-w-[9rem] text-right text-xs font-semibold leading-snug text-gold-dark">
                            {m.note || "Precio actualizado"}
                          </p>
                        ) : (
                          <>
                            <p className="text-lg font-bold leading-none text-ink">
                              {delta.label}
                            </p>
                            <p className="mt-1.5 text-[11px] font-medium tracking-wide text-muted">
                              {delta.availableFocus ? "Disp." : "Quedan"}
                            </p>
                            <p className="text-xl font-semibold leading-none tabular-nums">
                              {remaining}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        ) : null}

        <Link href="/inventory" className="block text-center text-sm font-semibold text-muted">
          Volver a inventario
        </Link>
      </div>
    </div>
  );
}
