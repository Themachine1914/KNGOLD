import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import bcrypt from "bcryptjs";
import { getDb, newId } from "../src/lib/firebase";

// Load .env.local / .env manually for local seed
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

const products = [
  { sku: "KN-SF1", type: "ABANICO", name: "Abanico de pedestal", description: 'Tamaño 18"', color: "NEGRO", listPrice: 2525, discountPct: 10, netPrice: 2272.5, stockOnHand: 188 },
  { sku: "KN-0151", type: "ESTUFA", name: "Estufa de 20'' Satinada", description: "Tamaño 20''", color: "SATINADA", listPrice: 10965, discountPct: 0, netPrice: 10965, stockOnHand: 12 },
  { sku: "KN-76N", type: "ESTUFA", name: "Estufa de 30'' Satinada", description: "Tamaño 30''", color: "SATINADA", listPrice: 24995, discountPct: 0, netPrice: 24995, stockOnHand: 185 },
  { sku: "KN-76G", type: "ESTUFA", name: 'Estufa de 30" tope en cristal', description: 'Tamaño 30"', color: "SATINADA", listPrice: 23750, discountPct: 0, netPrice: 23750, stockOnHand: 273 },
  { sku: "KN-6201", type: "ESTUFA", name: 'Estufa de 24" libras', description: 'Tamaño 24"', color: "SATINADA", listPrice: 14750, discountPct: 0, netPrice: 14750, stockOnHand: 148 },
  { sku: "KN-7600", type: "ESTUFA", name: 'Estufa de 30"', description: 'Tamaño 30"', color: "SATINADA", listPrice: 19455, discountPct: 0, netPrice: 19455, stockOnHand: 322 },
  { sku: "KN-60X", type: "ESTUFA", name: 'Estufa 24" Alta Gama', description: 'Tamaño 24"', color: "SATINADA", listPrice: 25775, discountPct: 0, netPrice: 25775, stockOnHand: 94 },
  { sku: "KN-80X", type: "ESTUFA", name: 'Estufa 30" Alta Gama', description: 'Tamaño 30"', color: "SATINADA", listPrice: 31395, discountPct: 0, netPrice: 31395, stockOnHand: 0 },
  { sku: "KN-18", type: "LAVADORA", name: "Lavadora 18 libras", description: "Tamaño 18 libras", color: null, listPrice: 9485, discountPct: 0, netPrice: 9485, stockOnHand: 29 },
  { sku: "KN-22", type: "LAVADORA", name: "Lavadora 22 libras", description: "Tamaño 22 libras", color: null, listPrice: 11240, discountPct: 0, netPrice: 11240, stockOnHand: 56 },
  { sku: "KN-30", type: "LAVADORA", name: "Lavadora 30 libras", description: "Tamaño 30 libras", color: null, listPrice: 12860, discountPct: 0, netPrice: 12860, stockOnHand: 15 },
  { sku: "KN-560", type: "NEVERA", name: "Nevera 2 puertas", description: "Tamaño 20 pies", color: "SATINADA", listPrice: 55940, discountPct: 3, netPrice: 54261.8, stockOnHand: 43 },
];

async function upsertUser(email: string, name: string, role: "OWNER" | "SELLER", passwordHash: string) {
  const db = getDb();
  const existing = await db.collection("users").where("email", "==", email).limit(1).get();
  const now = new Date().toISOString();
  if (!existing.empty) {
    await existing.docs[0].ref.set({ name, role, active: true, updatedAt: now }, { merge: true });
    return;
  }
  const id = newId();
  await db.collection("users").doc(id).set({
    id, name, email, passwordHash, role, active: true, createdAt: now, updatedAt: now,
  });
}

async function main() {
  // La clave venía escrita aquí y publicada en DEPLOY_VERCEL.md: cualquiera
  // que desplegara obtenía un dueño con credenciales conocidas.
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "Define SEED_OWNER_PASSWORD (mínimo 8 caracteres) antes de sembrar. Ejemplo:\n" +
        '  SEED_OWNER_PASSWORD="tu-clave-segura" npm run db:seed'
    );
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await upsertUser("dueno@kngold.com.do", "Administración KN GOLD", "OWNER", passwordHash);
  await upsertUser("vendedor@kngold.com.do", "Vendedor Demo", "SELLER", passwordHash);
  await upsertUser("vendedor2@kngold.com.do", "Vendedor Norte", "SELLER", passwordHash);

  const db = getDb();
  for (const p of products) {
    const existing = await db.collection("products").where("sku", "==", p.sku).limit(1).get();
    const now = new Date().toISOString();
    if (!existing.empty) {
      await existing.docs[0].ref.set(
        {
          name: p.name,
          type: p.type,
          description: p.description,
          color: p.color,
          listPrice: p.listPrice,
          discountPct: p.discountPct,
          netPrice: p.netPrice,
          active: true,
          updatedAt: now,
        },
        { merge: true }
      );
    } else {
      const id = newId();
      await db.collection("products").doc(id).set({
        id,
        ...p,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  await db.collection("settings").doc("reservation_hours").set({ key: "reservation_hours", value: "48" });
  console.log(
    "Firestore seed OK — dueno@kngold.com.do y vendedor@kngold.com.do. " +
      "Clave: la de SEED_OWNER_PASSWORD."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
