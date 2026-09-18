-- Add the after-sales workflow fields without replacing existing orders or tickets.
ALTER TABLE after_sales ADD COLUMN internal_note TEXT NOT NULL DEFAULT '';
ALTER TABLE after_sales ADD COLUMN refund_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE after_sales ADD COLUMN refund_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE after_sales ADD COLUMN refund_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE after_sales ADD COLUMN refunded_at TEXT;
ALTER TABLE after_sales ADD COLUMN updated_at TEXT;

UPDATE after_sales
SET status = CASE status
  WHEN 'open' THEN 'submitted'
  WHEN 'processing' THEN 'reviewing'
  WHEN 'resolved' THEN 'closed'
  ELSE status
END,
updated_at = created_at
WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS after_sales_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  qty        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_after_sales_items_ticket ON after_sales_items(ticket_id);
