// tsx no lee .env por su cuenta: sin esto habría que exportar
// DATABASE_URL y SEED_OWNER_PASSWORD a mano en cada ejecución.
import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const products = [
  {
    sku: "KN-SF1",
    type: "ABANICO",
    name: "Abanico de pedestal",
    description: 'Tamaño 18"',
    color: "NEGRO",
    listPrice: 2525,
    discountPct: 10,
    netPrice: 2272.5,
    stockOnHand: 188,
  },
  {
    sku: "KN-0151",
    type: "ESTUFA",
    name: "Estufa de 20'' Satinada",
    description: "Tamaño 20''",
    color: "SATINADA",
    listPrice: 10965,
    discountPct: 0,
    netPrice: 10965,
    stockOnHand: 12,
  },
  {
    sku: "KN-76N",
    type: "ESTUFA",
    name: "Estufa de 30'' Satinada",
    description: "Tamaño 30''",
    color: "SATINADA",
    listPrice: 24995,
    discountPct: 0,
    netPrice: 24995,
    stockOnHand: 185,
  },
  {
    sku: "KN-76G",
    type: "ESTUFA",
    name: 'Estufa de 30" tope en cristal',
    description: 'Tamaño 30"',
    color: "SATINADA",
    listPrice: 23750,
    discountPct: 0,
    netPrice: 23750,
    stockOnHand: 273,
  },
  {
    sku: "KN-6201",
    type: "ESTUFA",
    name: 'Estufa de 24" libras',
    description: 'Tamaño 24"',
    color: "SATINADA",
    listPrice: 14750,
    discountPct: 0,
    netPrice: 14750,
    stockOnHand: 148,
  },
  {
    sku: "KN-7600",
    type: "ESTUFA",
    name: 'Estufa de 30"',
    description: 'Tamaño 30"',
    color: "SATINADA",
    listPrice: 19455,
    discountPct: 0,
    netPrice: 19455,
    stockOnHand: 322,
  },
  {
    sku: "KN-60X",
    type: "ESTUFA",
    name: 'Estufa 24" Alta Gama',
    description: 'Tamaño 24"',
    color: "SATINADA",
    listPrice: 25775,
    discountPct: 0,
    netPrice: 25775,
    stockOnHand: 94,
  },
  {
    sku: "KN-80X",
    type: "ESTUFA",
    name: 'Estufa 30" Alta Gama',
    description: 'Tamaño 30"',
    color: "SATINADA",
    listPrice: 31395,
    discountPct: 0,
    netPrice: 31395,
    stockOnHand: 0,
  },
  {
    sku: "KN-18",
    type: "LAVADORA",
    name: "Lavadora 18 libras",
    description: "Tamaño 18 libras",
    color: null,
    listPrice: 9485,
    discountPct: 0,
    netPrice: 9485,
    stockOnHand: 29,
  },
  {
    sku: "KN-22",
    type: "LAVADORA",
    name: "Lavadora 22 libras",
    description: "Tamaño 22 libras",
    color: null,
    listPrice: 11240,
    discountPct: 0,
    netPrice: 11240,
    stockOnHand: 56,
  },
  {
    sku: "KN-30",
    type: "LAVADORA",
    name: "Lavadora 30 libras",
    description: "Tamaño 30 libras",
    color: null,
    listPrice: 12860,
    discountPct: 0,
    netPrice: 12860,
    stockOnHand: 15,
  },
  {
    sku: "KN-560",
    type: "NEVERA",
    name: "Nevera 2 puertas",
    description: "Tamaño 20 pies",
    color: "SATINADA",
    listPrice: 55940,
    discountPct: 3,
    netPrice: 54261.8,
    stockOnHand: 43,
  },
];

async function main() {
  // La clave venía escrita aquí, y además publicada en el README. Quitarla
  // del formulario de login no servía de nada mientras el seed la siguiera
  // creando sola en cada despliegue.
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "Define SEED_OWNER_PASSWORD (mínimo 8 caracteres) antes de sembrar. Ejemplo:\n" +
        '  SEED_OWNER_PASSWORD="tu-clave-segura" npm run db:seed'
    );
  }
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email: "dueno@kngold.com.do" },
    update: {},
    create: {
      name: "Dueño KN GOLD",
      email: "dueno@kngold.com.do",
      passwordHash,
      role: Role.OWNER,
    },
  });

  await prisma.user.upsert({
    where: { email: "vendedor@kngold.com.do" },
    update: {},
    create: {
      name: "Vendedor Demo",
      email: "vendedor@kngold.com.do",
      passwordHash,
      role: Role.SELLER,
    },
  });

  await prisma.user.upsert({
    where: { email: "vendedor2@kngold.com.do" },
    update: {},
    create: {
      name: "Vendedor Norte",
      email: "vendedor2@kngold.com.do",
      passwordHash,
      role: Role.SELLER,
    },
  });

  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        type: p.type,
        description: p.description,
        color: p.color,
        listPrice: p.listPrice,
        discountPct: p.discountPct,
        netPrice: p.netPrice,
        stockOnHand: p.stockOnHand,
      },
      create: p,
    });
  }

  await prisma.appSetting.upsert({
    where: { key: "reservation_hours" },
    update: { value: "48" },
    create: { key: "reservation_hours", value: "48" },
  });

  console.log(
    "Seed OK — dueno@kngold.com.do (dueño), vendedor@kngold.com.do y " +
      "vendedor2@kngold.com.do (vendedores). Clave: la de SEED_OWNER_PASSWORD."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
