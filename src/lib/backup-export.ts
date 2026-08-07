import { getDb } from "./firebase";
import { buildCsv } from "./csv";
import {
  importStatusLabel,
  movementLabel,
  quoteStatusLabel,
} from "./labels";
import { roleLabel } from "./roles";
import type {
  Customer,
  ImportOrder,
  ImportOrderLine,
  InventoryMovement,
  Product,
  Quote,
  QuoteLine,
  User,
} from "./types";
import { zipStore } from "./zip-store";

function ymdStamp(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}${m}${day}-${h}${min}`;
}

async function loadCollection<T>(name: string): Promise<T[]> {
  const snap = await getDb().collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

/**
 * Genera un ZIP con un CSV por colección / tabla del sistema.
 * No incluye passwordHash ni secretos.
 */
export async function buildFullBackupZip(): Promise<{
  filename: string;
  bytes: Uint8Array;
  counts: Record<string, number>;
}> {
  const [products, customers, quotes, movements, imports, users] =
    await Promise.all([
      loadCollection<Product>("products"),
      loadCollection<Customer>("customers"),
      loadCollection<Quote>("quotes"),
      loadCollection<InventoryMovement>("movements"),
      loadCollection<ImportOrder>("imports"),
      loadCollection<User>("users"),
    ]);

  const userName = new Map(users.map((u) => [u.id, u.name]));
  const productSku = new Map(products.map((p) => [p.id, p.sku]));
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const quoteNumber = new Map(quotes.map((q) => [q.id, q.number]));

  products.sort((a, b) => a.sku.localeCompare(b.sku, "es"));
  customers.sort((a, b) => a.name.localeCompare(b.name, "es"));
  quotes.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  movements.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  imports.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  users.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const quoteLines: Array<QuoteLine & { quoteId: string; quoteNumber: number }> =
    [];
  for (const q of quotes) {
    for (const line of q.lines || []) {
      quoteLines.push({
        ...line,
        quoteId: q.id,
        quoteNumber: q.number,
      });
    }
  }

  const importLines: Array<
    ImportOrderLine & { importId: string; importNumber: number }
  > = [];
  for (const item of imports) {
    for (const line of item.lines || []) {
      importLines.push({
        ...line,
        importId: item.id,
        importNumber: item.number,
      });
    }
  }

  const files = [
    {
      name: "productos.csv",
      content: buildCsv(
        [
          "id",
          "sku",
          "nombre",
          "tipo",
          "descripcion",
          "color",
          "foto",
          "precio_lista",
          "descuento_pct",
          "precio_venta",
          "stock",
          "activo",
        ],
        products.map((p) => [
          p.id,
          p.sku,
          p.name,
          p.type,
          p.description,
          p.color,
          p.imageUrl,
          p.listPrice,
          p.discountPct,
          p.netPrice,
          p.stockOnHand,
          p.active !== false,
        ])
      ),
    },
    {
      name: "clientes.csv",
      content: buildCsv(
        ["id", "nombre", "rnc", "telefono", "direccion", "email"],
        customers.map((c) => [
          c.id,
          c.name,
          c.rnc,
          c.phone,
          c.address,
          c.email,
        ])
      ),
    },
    {
      name: "pedidos.csv",
      content: buildCsv(
        [
          "id",
          "numero",
          "estado",
          "vendedor_id",
          "vendedor",
          "cliente_id",
          "cliente",
          "incluye_itbis",
          "conduce",
          "condicion_venta",
          "subtotal",
          "itbis",
          "total",
          "reservado_hasta",
          "notas",
          "creado",
          "actualizado",
        ],
        quotes.map((q) => [
          q.id,
          q.number,
          quoteStatusLabel(q.status),
          q.sellerId,
          userName.get(q.sellerId) || "",
          q.customerId,
          customerName.get(q.customerId) || "",
          q.includeItbis,
          q.includeItbis ? "C/C" : "S/C",
          q.paymentTerms === "CREDITO_30"
            ? "Crédito a 30 días"
            : q.paymentTerms === "CONTADO"
              ? "Al contado"
              : "",
          q.subtotal,
          q.itbisAmount,
          q.total,
          q.reservedUntil,
          q.notes,
          q.createdAt,
          q.updatedAt,
        ])
      ),
    },
    {
      name: "pedido_lineas.csv",
      content: buildCsv(
        [
          "pedido_id",
          "pedido_numero",
          "linea_id",
          "producto_id",
          "sku",
          "producto",
          "cantidad",
          "transito",
          "precio_unitario",
          "total_linea",
        ],
        quoteLines.map((l) => [
          l.quoteId,
          l.quoteNumber,
          l.id,
          l.productId,
          productSku.get(l.productId) || "",
          productName.get(l.productId) || "",
          l.qty,
          l.transitQty ?? 0,
          l.unitPrice,
          l.lineTotal,
        ])
      ),
    },
    {
      name: "movimientos.csv",
      content: buildCsv(
        [
          "id",
          "fecha",
          "tipo",
          "producto_id",
          "sku",
          "producto",
          "cantidad",
          "transito",
          "stock_despues",
          "disponible_despues",
          "pedido_id",
          "pedido_numero",
          "usuario_id",
          "usuario",
          "nota",
        ],
        movements.map((m) => [
          m.id,
          m.createdAt,
          movementLabel(m.type),
          m.productId,
          productSku.get(m.productId) || "",
          productName.get(m.productId) || "",
          m.qty,
          m.transitQty ?? "",
          m.stockAfter,
          m.availableAfter,
          m.quoteId,
          m.quoteId ? quoteNumber.get(m.quoteId) ?? "" : "",
          m.userId,
          m.userId ? userName.get(m.userId) || "" : "",
          m.note,
        ])
      ),
    },
    {
      name: "importaciones.csv",
      content: buildCsv(
        [
          "id",
          "numero",
          "estado",
          "proveedor",
          "eta",
          "llegada",
          "notas",
          "creado_por_id",
          "creado_por",
          "creado",
          "actualizado",
        ],
        imports.map((i) => [
          i.id,
          i.number,
          importStatusLabel(i.status),
          i.supplier,
          i.eta,
          i.arrivedAt,
          i.notes,
          i.createdById,
          userName.get(i.createdById) || "",
          i.createdAt,
          i.updatedAt,
        ])
      ),
    },
    {
      name: "importacion_lineas.csv",
      content: buildCsv(
        [
          "importacion_id",
          "importacion_numero",
          "linea_id",
          "producto_id",
          "sku",
          "producto",
          "cantidad",
        ],
        importLines.map((l) => [
          l.importId,
          l.importNumber,
          l.id,
          l.productId,
          productSku.get(l.productId) || "",
          productName.get(l.productId) || "",
          l.qty,
        ])
      ),
    },
    {
      name: "usuarios.csv",
      content: buildCsv(
        [
          "id",
          "nombre",
          "email",
          "rol",
          "activo",
          "soporte",
          "vence",
          "creado",
          "actualizado",
        ],
        users.map((u) => [
          u.id,
          u.name,
          u.email,
          roleLabel(u.role),
          u.active !== false,
          !!u.isSupport,
          u.expiresAt,
          u.createdAt,
          u.updatedAt,
        ])
      ),
    },
    {
      name: "indice.txt",
      content: [
        "Respaldo KN GOLD",
        `Generado: ${new Date().toISOString()}`,
        "",
        "Archivos:",
        `- productos.csv (${products.length})`,
        `- clientes.csv (${customers.length})`,
        `- pedidos.csv (${quotes.length})`,
        `- pedido_lineas.csv (${quoteLines.length})`,
        `- movimientos.csv (${movements.length})`,
        `- importaciones.csv (${imports.length})`,
        `- importacion_lineas.csv (${importLines.length})`,
        `- usuarios.csv (${users.length})`,
        "",
        "Nota: no se exportan contraseñas ni claves del sistema.",
      ].join("\n"),
    },
  ];

  return {
    filename: `kngold-respaldo-${ymdStamp()}.zip`,
    bytes: zipStore(files),
    counts: {
      productos: products.length,
      clientes: customers.length,
      pedidos: quotes.length,
      pedido_lineas: quoteLines.length,
      movimientos: movements.length,
      importaciones: imports.length,
      importacion_lineas: importLines.length,
      usuarios: users.length,
    },
  };
}
