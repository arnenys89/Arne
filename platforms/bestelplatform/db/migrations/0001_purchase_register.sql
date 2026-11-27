PRAGMA foreign_keys = ON;

-- Aankoopregister: leverancier, bestelbonnummer, besteldatum en leverstatus.
-- Er worden bewust geen bedragen of facturen bijgehouden.
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  purchase_order_number TEXT,
  purchase_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'besteld'
    CHECK (status IN ('besteld','gedeeltelijk_geleverd','geleverd','geannuleerd')),
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status,purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_order_item ON purchases(order_item_id);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
