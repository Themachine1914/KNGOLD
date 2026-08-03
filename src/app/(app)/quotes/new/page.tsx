import { getProductsWithAvailability } from "@/lib/inventory";
import { PageHeader } from "@/components/ui";
import { NewQuoteForm } from "@/components/new-quote-form";

export default async function NewQuotePage() {
  const products = await getProductsWithAvailability();
  const options = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    type: p.type,
    netPrice: p.netPrice,
    available: p.available ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Nueva cotización"
        subtitle="Elige productos, ITBIS y reserva stock al instante."
      />
      <NewQuoteForm products={options} />
    </div>
  );
}
