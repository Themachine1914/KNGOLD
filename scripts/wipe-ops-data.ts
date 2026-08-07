/**
 * Borra datos operativos de prueba para arrancar limpio:
 * - quotes (pedidos)
 * - customers
 * - movements (bitácora / tablero diario)
 *
 * NO toca: users, products, settings, imports, product_images, license.
 *
 * Uso:
 *   CONFIRM_WIPE=YES npx tsx scripts/wipe-ops-data.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getDb } from "../src/lib/firebase";

for (const file of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

async function deleteCollection(name: string): Promise<number> {
  const db = getDb();
  let total = 0;
  // Firestore batch max 500
  while (true) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    total += snap.size;
    if (snap.size < 400) break;
  }
  return total;
}

async function main() {
  if (process.env.CONFIRM_WIPE !== "YES") {
    throw new Error(
      'Para confirmar, ejecuta:\n  CONFIRM_WIPE=YES npx tsx scripts/wipe-ops-data.ts\n\n' +
        "Esto borra quotes, customers y movements. No toca users ni products."
    );
  }

  console.log("Limpiando datos operativos…");
  const quotes = await deleteCollection("quotes");
  console.log(`  quotes: ${quotes}`);
  const customers = await deleteCollection("customers");
  console.log(`  customers: ${customers}`);
  const movements = await deleteCollection("movements");
  console.log(`  movements: ${movements}`);

  // Reinicia contador de pedidos para que el próximo sea #1
  await getDb().collection("counters").doc("quotes").set({ seq: 0 }, { merge: true });
  console.log("  counters/quotes → 0");

  console.log("Listo. Pedidos y bitácora limpios. Ajusta el stock a mano si hace falta.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
