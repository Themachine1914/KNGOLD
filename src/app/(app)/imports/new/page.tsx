import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { NewImportForm } from "@/components/new-import-form";

export default async function NewImportPage() {
  const session = await auth();
  if (session!.user.role !== Role.OWNER) redirect("/imports");

  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: {
      id: true,
      sku: true,
      name: true,
      type: true,
      stockOnHand: true,
    },
  });

  return (
    <div>
      <PageHeader
        title="Nueva importación"
        subtitle="Registra lo pedido y la fecha estimada de llegada."
      />
      <NewImportForm products={products} />
    </div>
  );
}
