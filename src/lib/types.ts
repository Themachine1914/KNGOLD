export type Role = "OWNER" | "SELLER";

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
  | "CONFIRMACION_VENTA";

export type ImportStatus = "ORDERED" | "IN_TRANSIT" | "ARRIVED" | "CANCELLED";

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  type: string;
  description?: string | null;
  color?: string | null;
  listPrice: number;
  discountPct: number;
  netPrice: number;
  stockOnHand: number;
  active: boolean;
  reserved?: number;
  available?: number;
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

export type ImportOrderLine = {
  id: string;
  productId: string;
  qty: number;
  product?: Product;
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
