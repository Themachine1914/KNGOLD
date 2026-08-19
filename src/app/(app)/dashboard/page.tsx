import Link from "next/link";
import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import {
  countReservedQuotes,
  expireReservedQuotes,
  getDailyInventorySummaries,
  getProductsWithAvailability,
  listMovements,
  listQuotes,
  movementDelta,
} from "@/lib/inventory";
import { listUpcomingImports } from "@/lib/imports";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";
import { productDisplayName } from "@/lib/product-label";
import { formatRD } from "@/lib/pricing";
import {
  importStatusLabel,
  conduceLabel,
  paymentTermsLabel,
  importStatusTone,
  movementLabel,
  quoteStatusLabel,
  quoteStatusTone,
} from "@/lib/labels";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DailyInventoryBoard } from "@/components/daily-inventory-board";
import { differenceInCalendarDays, format, formatDistanceToNow, isPast, parseISO } from "date-fns";
import { es } from "date-fns/locale";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export default async function DashboardPage() {
  const session = await auth();
  const isManager = isOpsManager(session!.user.role);
  const sellerId = session!.user.id;
  await safe(() => expireReservedQuotes(), 0);

  // En paralelo y con fallback individual: cada bloque falla solo, sin tumbar
  // la página. Antes iban en serie para no saturar Firebase, pero ahora cada
  // carga agrupa sus lecturas y el panel entero cabe en unas pocas consultas.
  const [
    products,
    reservedQuotes,
    upcomingImports,
    recentMovements,
    recentQuotes,
    dailyInventory,
  ] = await Promise.all([
    safe(() => getProductsWithAvailability(), []),
    safe(() => countReservedQuotes(isManager ? undefined : sellerId), 0),
    isManager ? safe(() => listUpcomingImports(5), []) : [],
    isManager ? safe(() => listMovements(8), []) : [],
    safe(() => listQuotes(isManager ? undefined : sellerId, isManager ? 5 : 8), []),
    isManager ? safe(() => getDailyInventorySummaries(7), []) : [],
  ]);
  const lowStock = products.filter((p) => (p.available ?? 0) <= LOW_STOCK_THRESHOLD);
  const partial =
    products.length === 0 &&
    recentQuotes.length === 0 &&
    upcomingImports.length === 0;

  return (
    <div>
      <PageHeader
        title={isManager ? "Panel de gestión" : "Tu jornada"}
        subtitle={
          isManager
            ? "Stock, reservas, pedidos y movimientos al día."
            : "Inventario al día y solo tus pedidos."
        }
      />

      {partial ? (
        <Card className="mb-4 border-warn/40 bg-warn/5 py-3 text-sm text-muted">
          Algunos datos no cargaron (límite de la base de datos). Entra a Pedidos o
          Stock, o recarga en unos segundos.
        </Card>
      ) : null}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Card className="p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted">
            Electrodomésticos
          </p>
          <p className="mt-1 text-2xl font-semibold">{products.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted">
            Stock bajo
          </p>
          <p className="mt-1 text-2xl font-semibold text-warn">{lowStock.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted">
            {isManager ? "En camino" : "Mis reservas"}
          </p>
          <p className="mt-1 text-2xl font-semibold text-gold-dark">
            {isManager ? upcomingImports.length : reservedQuotes}
          </p>
        </Card>
      </div>

      {isManager ? (
        <DailyInventoryBoard days={dailyInventory} showDetailLink />
      ) : null}

      {!isManager ? (
        <Link
          href="/quotes/new"
          className="mb-4 flex items-center justify-between rounded-2xl bg-ink px-4 py-4 text-white"
        >
          <div>
            <p className="font-semibold">Nuevo pedido</p>
            <p className="text-sm text-white/65">Reserva stock al instante</p>
          </div>
          <span className="text-2xl">+</span>
        </Link>
      ) : (
        <Link
          href="/imports/new"
          className="mb-4 flex items-center justify-between rounded-2xl bg-ink px-4 py-4 text-white"
        >
          <div>
            <p className="font-semibold">Nueva importación</p>
            <p className="text-sm text-white/65">Mercancía + fecha estimada de llegada</p>
          </div>
          <span className="text-2xl">+</span>
        </Link>
      )}

      {isManager ? (
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-muted">
              Importaciones
            </h2>
            <Link href="/imports" className="text-sm font-semibold text-gold-dark">
              Ver todas
            </Link>
          </div>
          {upcomingImports.length === 0 ? (
            <Card className="py-4 text-sm text-muted">
              No hay importaciones en camino.
            </Card>
          ) : (
            <div className="space-y-2">
              {upcomingImports.map((item) => {
                const eta = parseISO(item.eta);
                const days = differenceInCalendarDays(eta, new Date());
                const late = isPast(eta);
                const units = (item.lines || []).reduce((s, l) => s + l.qty, 0);
                return (
                  <Link key={item.id} href={`/imports/${item.id}`}>
                    <Card className="mb-2 flex items-center justify-between py-3">
                      <div>
                        <p className="font-semibold">
                          #{item.number}
                          {item.supplier ? ` · ${item.supplier}` : ""}
                        </p>
                        <p className="text-sm text-muted">
                          {units} UND · ETA {format(eta, "dd MMM", { locale: es })}
                          <span className={late ? " text-danger" : ""}>
                            {" "}
                            ·{" "}
                            {late
                              ? `atrasado ${Math.abs(days)}d`
                              : days === 0
                                ? "hoy"
                                : `en ${days}d`}
                          </span>
                        </p>
                      </div>
                      <Badge tone={importStatusTone(item.status)}>
                        {importStatusLabel(item.status)}
                      </Badge>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {lowStock.length > 0 ? (
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="mb-0 text-sm font-semibold tracking-wide text-muted">
              Inventario — stock bajo
            </h2>
            <Link href="/inventory" className="text-sm font-semibold text-gold-dark">
              Ver stock
            </Link>
          </div>
          <div className="space-y-2">
            {lowStock.slice(0, 5).map((p) => (
              <Link
                key={p.id}
                href={`/inventory/${encodeURIComponent(p.sku)}`}
                prefetch={false}
                className="block"
              >
                <Card className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-semibold">{p.sku}</p>
                    <p className="text-sm text-muted">{productDisplayName(p.name)}</p>
                  </div>
                  <Badge tone={(p.available ?? 0) <= 0 ? "danger" : "warn"}>
                    Disp. {p.availableTotal ?? p.available}
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-muted">
              Inventario
            </h2>
            <Link href="/inventory" className="text-sm font-semibold text-gold-dark">
              Ver stock
            </Link>
          </div>
          <Card className="py-4 text-sm text-muted">
            Stock al día · {products.length} electrodomésticos disponibles para consultar.
          </Card>
        </section>
      )}

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-muted">
            {isManager ? "Pedidos recientes" : "Mis pedidos"}
          </h2>
          <Link href="/quotes" className="text-sm font-semibold text-gold-dark">
            Ver todos
          </Link>
        </div>
        {recentQuotes.length === 0 ? (
          <EmptyState
            title={isManager ? "Sin pedidos aún" : "Aún no tienes pedidos"}
            body={
              isManager
                ? "Cuando el equipo reserve, aparecerán aquí."
                : "Crea un pedido al visitar un cliente."
            }
          />
        ) : (
          <div className="space-y-2">
            {recentQuotes.map((q) => (
              <Link key={q.id} href={`/quotes/${q.id}`}>
                <Card className="mb-2 flex items-center justify-between py-3">
                  <div>
                    <p className="font-semibold">
                      #{q.number} · {q.customer?.name}
                    </p>
                    <p className="text-sm text-muted">
                      {formatRD(q.total)} ·{" "}
                      {paymentTermsLabel(q.paymentTerms)} ·{" "}
                      {conduceLabel(q.includeItbis)}
                    </p>
                  </div>
                  <Badge tone={quoteStatusTone(q.status)}>
                    {quoteStatusLabel(q.status)}
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {isManager ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-muted">
              Últimos movimientos
            </h2>
            <Link href="/movements" className="text-sm font-semibold text-gold-dark">
              Ver todos
            </Link>
          </div>
          <div className="space-y-2">
            {recentMovements.map((m) => {
              const delta = movementDelta(m.type, m.qty);
              const remaining = delta.availableFocus
                ? m.availableAfter
                : m.stockAfter;
              return (
                <Card key={m.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {m.product?.sku} · {movementLabel(m.type)}
                      </p>
                      <p className="text-sm text-muted">
                        {delta.label} · quedan {remaining}
                      </p>
                      <p className="text-xs text-muted">
                        {formatDistanceToNow(parseISO(m.createdAt), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </p>
                    </div>
                    <p className="text-xl font-bold text-ink">{remaining}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
