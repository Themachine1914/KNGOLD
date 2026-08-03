import Link from "next/link";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importStatusLabel, importStatusTone } from "@/lib/labels";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { format, differenceInCalendarDays, isPast } from "date-fns";
import { es } from "date-fns/locale";

export default async function ImportsPage() {
  const session = await auth();
  const isOwner = session!.user.role === Role.OWNER;

  const imports = await prisma.importOrder.findMany({
    orderBy: [{ status: "asc" }, { eta: "asc" }],
    include: {
      lines: true,
      createdBy: true,
    },
  });

  return (
    <div>
      <PageHeader
        title="Importaciones"
        subtitle="Pedidos en camino y fecha estimada de llegada."
        action={
          isOwner ? (
            <Link href="/imports/new">
              <Button className="px-3 py-2 text-xs">Nueva</Button>
            </Link>
          ) : null
        }
      />

      {imports.length === 0 ? (
        <EmptyState
          title="Sin pedidos de importación"
          body={isOwner ? "Registra el próximo contenedor o pedido." : undefined}
        />
      ) : (
        <div className="space-y-2">
          {imports.map((item) => {
            const units = item.lines.reduce((s, l) => s + l.qty, 0);
            const days = differenceInCalendarDays(item.eta, new Date());
            const late =
              item.status !== "ARRIVED" &&
              item.status !== "CANCELLED" &&
              isPast(item.eta);

            return (
              <Link key={item.id} href={`/imports/${item.id}`}>
                <Card className="mb-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        Pedido #{item.number}
                        {item.supplier ? ` · ${item.supplier}` : ""}
                      </p>
                      <p className="text-sm text-muted">
                        {item.lines.length} productos · {units} unidades
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink">
                        ETA{" "}
                        {format(item.eta, "dd MMM yyyy", { locale: es })}
                        {item.status !== "ARRIVED" &&
                        item.status !== "CANCELLED" ? (
                          <span className={late ? " text-danger" : " text-muted"}>
                            {" "}
                            ·{" "}
                            {late
                              ? `atrasado ${Math.abs(days)}d`
                              : days === 0
                                ? "llega hoy"
                                : `en ${days}d`}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Badge tone={importStatusTone(item.status)}>
                      {importStatusLabel(item.status)}
                    </Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
