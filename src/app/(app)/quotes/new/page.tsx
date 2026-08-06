import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { getProductsWithAvailability } from "@/lib/inventory";
import { PageHeader } from "@/components/ui";
import { NewQuoteForm } from "@/components/new-quote-form";

export default async function NewQuotePage() {
  const session = await auth();
  const canEditPrice = isOpsManager(session!.user.role);
  const products = await getProductsWithAvailability();
  const options = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    type: p.type,
    netPrice: p.netPrice,
    listPrice: p.listPrice,
    available: p.available ?? 0,
    availableTransit: p.availableTransit ?? 0,
    availableTotal: p.availableTotal ?? p.available ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Nuevo pedido"
        subtitle={
          canEditPrice
            ? "Reserva stock y ajusta precios de oferta si aplica."
            : "Reserva de almacén o aparta lo que viene en tránsito."
        }
      />
      <NewQuoteForm products={options} canEditPrice={canEditPrice} />
    </div>
  );
}
