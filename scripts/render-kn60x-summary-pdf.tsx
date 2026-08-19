import { writeFileSync } from "fs";
import { renderToBuffer } from "@react-pdf/renderer";
import { ProductHistoryDocument } from "../src/lib/pdf/product-history-document";

/** Resumen KN-60X según ficha de inventario + stock inicial del catálogo. */
const data = {
  generatedAt: new Date(),
  sku: "KN-60X",
  name: 'Estufa 24" Alta Gama',
  type: "ESTUFA",
  description: 'Tamaño 24"',
  color: "SATINADA",
  netPrice: 25775,
  registeredStock: 94,
  registeredAt: null,
  stockOnHand: 90,
  reservedWarehouse: 90,
  availableWarehouse: 0,
  inTransit: 334,
  transitApartado: 163,
  availableTransit: 171,
  reservedTotal: 253,
  soldQty: 0,
  incoming: [
    {
      number: 0,
      supplier: "Mercancía en camino",
      eta: "",
      qty: 334,
      reservedOnArrival: 163,
      freeOnArrival: 171,
    },
  ],
};

async function main() {
  const out = process.argv[2] || "/opt/cursor/artifacts/KN-60X-resumen-inventario.pdf";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(<ProductHistoryDocument data={data} /> as any);
  writeFileSync(out, buffer);
  console.log(`PDF escrito: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
