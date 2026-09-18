-- VODAR micro-shop D1 schema
-- All monetary amounts stored as integer cents.

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_amt   INTEGER NOT NULL,
  image       TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  order_id       TEXT PRIMARY KEY,
  customer_name  TEXT NOT NULL,
  email          TEXT NOT NULL,
  address        TEXT NOT NULL,
  city           TEXT NOT NULL,
  country        TEXT NOT NULL,
  zip            TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending',
  total_amt      INTEGER NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  idem_key       TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qty        INTEGER NOT NULL,
  unit_price INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS tracking (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL,
  carrier     TEXT NOT NULL,
  tracking_no TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tracking_order ON tracking(order_id);

CREATE TABLE IF NOT EXISTS after_sales (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL,
  type        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  detail      TEXT NOT NULL,
  contact     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'submitted',
  resolution  TEXT NOT NULL DEFAULT '',
  internal_note    TEXT NOT NULL DEFAULT '',
  refund_status    TEXT NOT NULL DEFAULT 'not_required',
  refund_amount    INTEGER NOT NULL DEFAULT 0,
  refund_reference TEXT NOT NULL DEFAULT '',
  refunded_at      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_after_sales_order ON after_sales(order_id);

CREATE TABLE IF NOT EXISTS after_sales_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  qty        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_after_sales_items_ticket ON after_sales_items(ticket_id);

-- Admin login rate limiting (5 fails -> 15 min lock per IP)
CREATE TABLE IF NOT EXISTS login_attempts (
  ip           TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
