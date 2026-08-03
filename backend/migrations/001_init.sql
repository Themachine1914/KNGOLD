PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SELLER' CHECK (role IN ('OWNER', 'SELLER')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  color TEXT,
  list_price REAL NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0,
  net_price REAL NOT NULL,
  stock_on_hand INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rnc TEXT,
  phone TEXT,
  address TEXT,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  seller_id TEXT NOT NULL REFERENCES users(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  include_itbis INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'RESERVED', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  subtotal REAL NOT NULL DEFAULT 0,
  itbis_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  reserved_until TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_lines (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL CHECK (type IN (
    'ENTRADA', 'SALIDA', 'AJUSTE', 'RESERVA', 'LIBERACION_RESERVA', 'CONFIRMACION_VENTA'
  )),
  qty INTEGER NOT NULL,
  stock_after INTEGER NOT NULL DEFAULT 0,
  available_after INTEGER NOT NULL DEFAULT 0,
  quote_id TEXT REFERENCES quotes(id),
  user_id TEXT REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_orders (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  supplier TEXT,
  status TEXT NOT NULL DEFAULT 'ORDERED'
    CHECK (status IN ('ORDERED', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED')),
  eta TEXT NOT NULL,
  arrived_at TEXT,
  notes TEXT,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_order_lines (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES import_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movements_created ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_imports_status_eta ON import_orders(status, eta);
