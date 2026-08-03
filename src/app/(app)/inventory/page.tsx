import Form from "next/form";
import Link from "next/link";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProductsWithAvailability } from "@/lib/inventory";
import { formatRD } from "@/lib/pricing";
import { Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { AdjustStockForm } from "@/components/adjust-stock-form";
import { ProductThumb } from "@/components/product-thumb";
import { LOW_STOCK_THRESHOLD } from "@/lib/constants";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const session = await auth();
  const isOwner = session!.user.role === Role.OWNER;
  const params = await searchParams;
  const q = (params.q || "").toLowerCase().trim();
  const type = params.type || "";

  let products = await getProductsWithAvailability(prisma);
  if (type) products = products.filter((p) => p.type === type);
  if (q) {
    products = products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
    );
  }

  const types = Array.from(
    new Set((await prisma.product.findMany({ select: { type: true } })).map((p) => p.type))
  );

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle={
          isOwner
            ? "Físico, reservado y disponible."
            : "Disponible real para cotizar al cliente."
        }
      />

      <Form action="/inventory" className="mb-3 flex gap-2">
        {/* Sin esto, buscar borraba el filtro de tipo activo. */}
        {type ? <input type="hidden" name="type" value={type} /> : null}
        <Input
          name="q"
          defaultValue={params.q}
          placeholder="Buscar SKU o nombre..."
          aria-label="Buscar producto por SKU o nombre"
        />
        <Button type="submit" className="shrink-0">
          Buscar
        </Button>
      </Form>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link
          href="/inventory"
          className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ${
            !type ? "bg-ink text-white" : "border border-border bg-white text-muted"
          }`}
        >
          Todos
        </Link>
        {types.map((t) => (
          <Link
            key={t}
            href={`/inventory?type=${encodeURIComponent(t)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ${
              type === t ? "bg-ink text-white" : "border border-border bg-white text-muted"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="Sin productos"
          body="Ninguno coincide con esa búsqueda."
          action={
            q || type ? (
              <Link href="/inventory">
                <Button variant="secondary">Ver todo el inventario</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <ProductThumb sku={p.sku} alt={p.name} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                      {p.type} · {p.sku}
                    </p>
                    <p className="mt-0.5 text-base font-semibold text-ink">{p.name}</p>
                    <p className="text-sm text-muted">
                      {[p.description, p.color].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-ink">
                      {formatRD(p.netPrice)}
                    </p>
                  </div>
                </div>
                <Badge
                  tone={
                    p.available <= 0
                      ? "danger"
                      : p.available <= LOW_STOCK_THRESHOLD
                        ? "warn"
                        : "success"
                  }
                >
                  Disp. {p.available}
                </Badge>
              </div>

              {isOwner ? (
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Físico
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-ink">
                      {p.stockOnHand}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Reservado
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-gold-dark">
                      {p.reserved}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Disponible
                    </p>
                    <p className="text-2xl font-semibold tabular-nums text-success">
                      {p.available}
                    </p>
                  </div>
                </div>
              ) : null}

              {isOwner ? (
                <AdjustStockForm
                  productId={p.id}
                  sku={p.sku}
                  stockOnHand={p.stockOnHand}
                />
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
