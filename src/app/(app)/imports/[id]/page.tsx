import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importStatusLabel, importStatusTone } from "@/lib/labels";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ProductThumb } from "@/components/product-thumb";
import { ImportActions } from "@/components/import-actions";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const order = await prisma.importOrder.findUnique({
    where: { id },
    include: {
      lines: { include: { product: true } },
      createdBy: true,
    },
  });

  if (!order) notFound();

  const isOwner = session!.user.role === Role.OWNER;
  if (!isOwner && order.status === "CANCELLED") redirect("/imports");

  const units = order.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div>
      <PageHeader
        title={`Pedido #${order.number}`}
        subtitle={order.supplier || "Importación"}
        action={
          <Badge tone={importStatusTone(order.status)}>
            {importStatusLabel(order.status)}
          </Badge>
        }
      />

      <div className="space-y-3">
        <Card className="space-y-1 text-sm">
          <p>
            <span className="text-muted">ETA:</span>{" "}
            <span className="font-semibold">
              {format(order.eta, "EEEE d MMMM yyyy", { locale: es })}
            </span>
          </p>
          {order.arrivedAt ? (
            <p>
              <span className="text-muted">Llegó:</span>{" "}
              {format(order.arrivedAt, "dd MMM yyyy HH:mm", { locale: es })}
            </p>
          ) : null}
          <p>
            <span className="text-muted">Registró:</span> {order.createdBy.name}
          </p>
          <p>
            <span className="text-muted">Total:</span> {units} unidades ·{" "}
            {order.lines.length} productos
          </p>
          {order.notes ? (
            <p>
              <span className="text-muted">Notas:</span> {order.notes}
            </p>
          ) : null}
        </Card>

        <Card className="space-y-2">
          {order.lines.map((line) => (
            <div
              key={line.id}
              className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ProductThumb sku={line.product.sku} alt={line.product.name} size="sm" />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {line.product.sku} · {line.product.name}
                  </p>
                  <p className="text-sm text-muted">
                    {order.status === "ARRIVED" ? (
                      <>
                        Físico{" "}
                        <span className="tabular-nums">{line.product.stockOnHand}</span>
                      </>
                    ) : (
                      <>
                        Físico{" "}
                        <span className="tabular-nums">{line.product.stockOnHand}</span>{" "}
                        → al llegar{" "}
                        <span className="font-semibold tabular-nums text-ink">
                          {line.product.stockOnHand + line.qty}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <p className="shrink-0 text-lg font-semibold tabular-nums">+{line.qty}</p>
            </div>
          ))}
        </Card>

        {isOwner ? (
          <ImportActions
            importId={order.id}
            status={order.status}
            units={units}
            productCount={order.lines.length}
          />
        ) : null}

        <Link href="/imports" className="block text-center text-sm font-semibold text-muted">
          Volver a importaciones
        </Link>
      </div>
    </div>
  );
}
