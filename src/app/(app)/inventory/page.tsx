import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { getProductsWithAvailability } from "@/lib/inventory";
import { formatRD } from "@/lib/pricing";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AdjustStockForm } from "@/components/adjust-stock-form";
import { EditProductPriceForm } from "@/components/edit-product-price-form";
import { NewProductForm } from "@/components/new-product-form";
import { ProductThumb } from "@/components/product-thumb";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const session = await auth();
  const isManager = isOpsManager(session!.user.role);
  const params = await searchParams;
  const q = (params.q || "").toLowerCase().trim();
  const type = params.type || "";

  let products = await getProductsWithAvailability();
  const allTypes = Array.from(new Set(products.map((p) => p.type).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b, "es")
  );
  if (type) products = products.filter((p) => p.type === type);
  if (q) {
    products = products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
    );
  }

  const types = Array.from(new Set(products.map((p) => p.type)));

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle={
          isManager
            ? "Stock, precios de oferta y disponible para pedidos."
            : "Disponible en almacén y en tránsito para apartar."
        }
        action={isManager ? <NewProductForm typeSuggestions={allTypes} /> : undefined}
      />

      <form className="mb-3 flex gap-2">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Buscar SKU o nombre..."
          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none ring-gold/30 focus:ring-2"
        />
        <button type="submit" className="rounded-xl bg-ink px-4 text-sm font-semibold text-white">
          Buscar
        </button>
      </form>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <a
          href="/inventory"
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
            !type ? "bg-ink text-white" : "bg-white text-muted border border-border"
          }`}
        >
          Todos
        </a>
        {types.map((t) => (
          <a
            key={t}
            href={`/inventory?type=${encodeURIComponent(t)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
              type === t ? "bg-ink text-white" : "bg-white text-muted border border-border"
            }`}
          >
            {t}
          </a>
        ))}
      </div>

      {products.length === 0 ? (
        <EmptyState title="Sin electrodomésticos" body="Prueba otra búsqueda." />
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <ProductThumb sku={p.sku} alt={p.name} imageUrl={p.imageUrl} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-gold-dark">
                      {p.type} · {p.sku}
                    </p>
                    <p className="mt-0.5 font-semibold text-ink">{p.name}</p>
                    <p className="text-sm text-muted">
                      {[p.description, p.color].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{formatRD(p.netPrice)}</p>
                      {p.listPrice > p.netPrice ? (
                        <>
                          <span className="text-xs text-muted line-through">
                            {formatRD(p.listPrice)}
                          </span>
                          <Badge tone="gold">Oferta</Badge>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
                <Badge
                  tone={
                    (p.availableTotal ?? p.available ?? 0) <= 0
                      ? "danger"
                      : (p.available ?? 0) <= 0 && (p.availableTransit ?? 0) > 0
                        ? "warn"
                        : (p.available ?? 0) <= LOW_STOCK_THRESHOLD
                          ? "warn"
                          : "success"
                  }
                >
                  Disp. {p.availableTotal ?? p.available}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center text-xs sm:grid-cols-4">
                {isManager ? (
                  <>
                    <div>
                      <p className="text-muted">Físico</p>
                      <p className="font-semibold">{p.stockOnHand}</p>
                    </div>
                    <div>
                      <p className="text-muted">Reservado</p>
                      <p className="font-semibold text-gold-dark">{p.reserved}</p>
                    </div>
                  </>
                ) : null}
                <div>
                  <p className="text-muted">Almacén</p>
                  <p className="font-semibold text-success">{p.available}</p>
                </div>
                <div>
                  <p className="text-muted">Tránsito libre</p>
                  <p className="font-semibold text-gold-dark">{p.availableTransit ?? 0}</p>
                </div>
              </div>
              {(p.transitApartado ?? 0) > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  {p.transitApartado} UND ya apartadas de lo que viene en camino.
                </p>
              ) : null}

              {isManager ? (
                <>
                  <EditProductPriceForm
                    productId={p.id}
                    sku={p.sku}
                    listPrice={p.listPrice}
                    netPrice={p.netPrice}
                  />
                  <AdjustStockForm
                    productId={p.id}
                    sku={p.sku}
                    stockOnHand={p.stockOnHand}
                  />
                </>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
