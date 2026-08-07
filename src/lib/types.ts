export type Role = "OWNER" | "ADMIN" | "SELLER";

export type QuoteStatus =
  | "DRAFT"
  | "RESERVED"
  | "CONFIRMED"
  | "CANCELLED"
  | "EXPIRED";

export type MovementType =
  | "ENTRADA"
  | "SALIDA"
  | "AJUSTE"
  | "RESERVA"
  | "LIBERACION_RESERVA"
  | "CONFIRMACION_VENTA"
  | "ANULACION_VENTA"
  | "CAMBIO_PRECIO";

export type ImportStatus = "ORDERED" | "IN_TRANSIT" | "ARRIVED" | "CANCELLED";

/** Condición de venta del pedido. */
export type PaymentTerms = "CONTADO" | "CREDITO_30";

export type NotificationType = "QUOTE_CREATED" | "QUOTE_CONFIRMED";

/** Aviso interno en la app (no push del sistema). */
export type AppNotification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  quoteId: string;
  quoteNumber: number;
  read: boolean;
  createdAt: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  /** Acceso temporal del proveedor; no cuenta en el cupo del plan. */
  isSupport?: boolean;
  /** ISO: si está vencido, el login falla y se desactiva. */
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Cupo comercial: usuarios activos del plan (vendedores), además del dueño. */
export type LicenseSettings = {
  maxUsers: number;
  updatedAt: string;
  note?: string | null;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  type: string;
  description?: string | null;
  color?: string | null;
  /** Ruta o URL de foto (subida o estática). */
  imageUrl?: string | null;
  listPrice: number;
  discountPct: number;
  netPrice: number;
  stockOnHand: number;
  active: boolean;
  reserved?: number;
  available?: number;
  /** Unidades en pedidos ORDERED / IN_TRANSIT */
  inTransit?: number;
  /** Unidades ya apartadas de ese tránsito */
  transitApartado?: number;
  /** Tránsito libre para apartar */
  availableTransit?: number;
  /** Físico disponible + tránsito apartable */
  availableTotal?: number;
};

export type Customer = {
  id: string;
  name: string;
  rnc?: string | null;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
};

export type QuoteLine = {
  id: string;
  productId: string;
  qty: number;
  /** Porción de qty apartada de importaciones en camino (no está en almacén aún) */
  transitQty?: number;
  unitPrice: number;
  lineTotal: number;
  product?: Product;
};

export type Quote = {
  id: string;
  number: number;
  sellerId: string;
  customerId: string;
  includeItbis: boolean;
  /** Al contado o crédito a 30 días. Pedidos viejos pueden no traerlo. */
  paymentTerms?: PaymentTerms | null;
  status: QuoteStatus;
  subtotal: number;
  itbisAmount: number;
  total: number;
  reservedUntil?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: Customer;
  seller?: User;
  lines?: QuoteLine[];
};

export type InventoryMovement = {
  id: string;
  productId: string;
  type: MovementType;
  qty: number;
  /**
   * En RESERVA/LIBERACION: unidades del movimiento que son de tránsito.
   * En ENTRADA: apartados de tránsito convertidos a reserva de almacén.
   */
  transitQty?: number;
  stockAfter: number;
  availableAfter: number;
  quoteId?: string | null;
  userId?: string | null;
  note?: string | null;
  createdAt: string;
  product?: Product;
  user?: { name: string } | null;
  quote?: { number: number } | null;
};

export type DailyReservationClient = {
  quoteId: string;
  number: number;
  customerName: string;
  units: number;
  transitUnits: number;
  /** Dinero de lo reservado/apartado ese día en este pedido */
  amount: number;
  lastAt: string;
  /** Estado actual del pedido (Reservada, Facturada, …) */
  status: QuoteStatus;
};

export type DailyInventorySummary = {
  date: string;
  label: string;
  physicalIn: number;
  physicalOut: number;
  reserveIn: number;
  reserveOut: number;
  transitIn: number;
  transitOut: number;
  events: number;
  /** Dinero neto reservado de almacén ese día */
  reservedAmount: number;
  /** Dinero facturado (ventas confirmadas − anulaciones) ese día */
  soldAmount: number;
  /** Dinero neto apartado en tránsito ese día */
  transitAmount: number;
  /** Clientes que reservaron / apartaron ese día */
  reservations: DailyReservationClient[];
};

export type ImportOrderLine = {
  id: string;
  productId: string;
  qty: number;
  product?: Product;
  /** Apartados activos del producto (todas las cotizaciones) */
  productApartado?: number;
  /** Tránsito libre del producto para apartar */
  productLibre?: number;
};

export type ImportOrder = {
  id: string;
  number: number;
  supplier?: string | null;
  status: ImportStatus;
  eta: string;
  arrivedAt?: string | null;
  notes?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  lines?: ImportOrderLine[];
  createdBy?: User;
};
