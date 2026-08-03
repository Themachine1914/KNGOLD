import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  countReservedQuotes,
  expireReservedQuotes,
  getProductsWithAvailability,
  listMovements,
  listQuotes,
  movementDelta,
} from "@/lib/inventory";
import { listUpcomingImports } from "@/lib/imports";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { formatRD } from "@/lib/pricing";
import {
  importStatusLabel,
  importStatusTone,
  movementLabel,
  quoteStatusLabel,
  quoteStatusTone,
} from "@/lib/labels";
import { Badge, Card, PageHeader } from "@/components/ui";
import { differenceInCalendarDays, format, formatDistanceToNow, isPast, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default async function DashboardPage() {
  const session = await auth();
  const isOwner = session!.user.role === "OWNER";
  await expireReservedQuotes();

  const products = await getProductsWithAvailability();
  const lowStock = products.filter((p) => (p.available ?? 0) <= LOW_STOCK_THRESHOLD);
  const reservedQuotes = await countReservedQuotes(
    isOwner ? undefined : session!.user.id
  );
  const upcomingImports = await listUpcomingImports(5);
  const recentMovements = isOwner ? await listMovements(8) : [];
  const recentQuotes = (await listQuotes(isOwner ? undefined : session!.user.id)).slice(0, 5);

  return (
    <div>
      <PageHeader
        title={isOwner ? "Panel del dueño" : "Tu jornada"}
        subtitle="Stock, reservas, pedidos y movimientos al día."
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Link href="/inventory" className="block">
          <Card className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Productos
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
              {products.length}
            </p>
          </Card>
        </Link>
        <Link href="/inventory" className="block">
          <Card className={`p-3 ${lowStock.length > 0 ? "border-warn/40" : ""}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Stock bajo
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-warn">
              {lowStock.length}
            </p>
          </Card>
        </Link>
        <Link href="/imports" className="block">
          <Card className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              En camino
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-gold-dark">
              {upcomingImports.length}
            </p>
          </Card>
        </Link>
      </div>

      {!isOwner ? (
        <Link
          href="/quotes/new"
          className="mb-4 flex min-h-[68px] items-center justify-between rounded-2xl bg-gold px-4 py-4 text-ink"
        >
          <div>
            <p className="text-base font-semibold">Nueva cotización</p>
            <p className="text-sm text-ink/70">Reserva stock al instante</p>
          </div>
          <span className="text-3xl leading-none">+</span>
        </Link>
      ) : (
        <Link
          href="/imports/new"
          className="mb-4 flex min-h-[68px] items-center justify-between rounded-2xl bg-gold px-4 py-4 text-ink"
        >
          <div>
            <p className="text-base font-semibold">Nueva importación</p>
            <p className="text-sm text-ink/70">Pedido + fecha estimada de llegada</p>
          </div>
          <span className="text-3xl leading-none">+</span>
        </Link>
      )}

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Pedidos / importaciones</h2>
          <Link href="/imports" className="text-base font-semibold text-gold-dark">Ver todos</Link>
        </div>
        {upcomingImports.length === 0 ? (
          <Card className="py-4 text-sm text-muted">No hay pedidos en camino.</Card>
        ) : (
          <div className="space-y-2">
            {upcomingImports.map((item) => {
              const eta = parseISO(item.eta);
              const days = differenceInCalendarDays(eta, new Date());
              const late = isPast(eta);
              const units = (item.lines || []).reduce((s, l) => s + l.qty, 0);
              return (
                <Link key={item.id} href={`/imports/${item.id}`} className="block">
                  <Card className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-semibold">#{item.number}{item.supplier ? ` · ${item.supplier}` : ""}</p>
                      <p className="text-sm text-muted">
                        {units} uds · ETA {format(eta, "dd MMM", { locale: es })}
                        <span className={late ? " text-danger" : ""}>
                          {" "}· {late ? `atrasado ${Math.abs(days)}d` : days === 0 ? "hoy" : `en ${days}d`}
                        </span>
                      </p>
                    </div>
                    <Badge tone={importStatusTone(item.status)}>{importStatusLabel(item.status)}</Badge>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {lowStock.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Atención — stock bajo</h2>
          <div className="space-y-2">
            {lowStock.slice(0, 5).map((p) => (
              <Card key={p.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-semibold">{p.sku}</p>
                  <p className="text-sm text-muted">{p.name}</p>
                </div>
                <Badge tone={(p.available ?? 0) <= 0 ? "danger" : "warn"}>Disp. {p.available}</Badge>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Cotizaciones recientes</h2>
          <Link href="/quotes" className="text-base font-semibold text-gold-dark">Ver todas</Link>
        </div>
        <div className="space-y-2">
          {recentQuotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="block">
              <Card className="flex items-center justify-between py-3">
                <div>
                  <p className="font-semibold text-ink">
                    #{q.number} · {q.customer?.name}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
                    {formatRD(q.total)}
                  </p>
                  <p className="text-sm text-muted">
                    {q.includeItbis ? "Con ITBIS" : "Sin ITBIS"}
                  </p>
                </div>
                <Badge tone={quoteStatusTone(q.status)}>{quoteStatusLabel(q.status)}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {isOwner ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Últimos movimientos</h2>
            <Link href="/movements" className="text-base font-semibold text-gold-dark">Ver todos</Link>
          </div>
          <div className="space-y-2">
            {recentMovements.map((m) => {
              const delta = movementDelta(m.type, m.qty);
              const remaining = delta.availableFocus ? m.availableAfter : m.stockAfter;
              return (
                <Card key={m.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{m.product?.sku} · {movementLabel(m.type)}</p>
                      <p className="text-sm text-muted">
                        {delta.label} ·{" "}
                        {formatDistanceToNow(parseISO(m.createdAt), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {delta.availableFocus ? "Disponible" : "Físico"}
                      </p>
                      <p className="text-2xl font-semibold tabular-nums text-ink">
                        {remaining}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : (
        <Link href="/quotes?status=RESERVED" className="block">
          <Card className="flex items-center justify-between py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Reservas activas
              </p>
              <p className="mt-0.5 text-sm text-muted">
                Cotizaciones que aún apartan stock
              </p>
            </div>
            <p className="text-3xl font-semibold tabular-nums text-gold-dark">
              {reservedQuotes}
            </p>
          </Card>
        </Link>
      )}
    </div>
  );
}
