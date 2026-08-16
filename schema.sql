-- Cloudflare D1 schema for Poyafzoli mardona

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  photo TEXT,
  purchase_price REAL NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  sizes_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_products_owner_name
ON products(owner_id, name);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  date TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  total_profit REAL NOT NULL DEFAULT 0,
  cancelled INTEGER NOT NULL DEFAULT 0,
  comment TEXT,
  is_debt INTEGER NOT NULL DEFAULT 0,
  client_name TEXT,
  client_phone TEXT,
  items_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_sales_owner_date
ON sales(owner_id, date);

CREATE INDEX IF NOT EXISTS idx_sales_owner_cancelled
ON sales(owner_id, cancelled);
