import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOpsManager } from "@/lib/roles";
import { listActiveProducts } from "@/lib/imports";
import { PageHeader } from "@/components/ui";
import { NewImportForm } from "@/components/new-import-form";

export default async function NewImportPage() {
  const session = await auth();
  if (!isOpsManager(session!.user.role)) redirect("/imports");

  const products = await listActiveProducts();
  const options = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    type: p.type,
    stockOnHand: p.stockOnHand,
  }));

  return (
    <div>
      <PageHeader
        title="Nueva importación"
        subtitle="Registra lo pedido y la fecha estimada de llegada."
      />
      <NewImportForm products={options} />
    </div>
  );
}
