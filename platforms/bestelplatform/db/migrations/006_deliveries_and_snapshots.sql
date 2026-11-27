-- Functional completion: delivery records, immutable line snapshots and event metadata.
ALTER TABLE order_items ADD COLUMN ean_code_snapshot TEXT;
ALTER TABLE order_items ADD COLUMN image_url_snapshot TEXT;

CREATE TABLE IF NOT EXISTS purchase_deliveries (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  quantity REAL NOT NULL CHECK(quantity > 0),
  delivered_on TEXT NOT NULL,
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_purchase_deliveries_purchase ON purchase_deliveries(purchase_id, delivered_on);

-- Preserve historical EAN/image values for existing rows where the current article is still linked.
UPDATE order_items
SET ean_code_snapshot = (SELECT ean_code FROM catalog_items WHERE catalog_items.id = order_items.catalog_item_id),
    image_url_snapshot = (SELECT image_url FROM catalog_items WHERE catalog_items.id = order_items.catalog_item_id)
WHERE catalog_item_id IS NOT NULL;
