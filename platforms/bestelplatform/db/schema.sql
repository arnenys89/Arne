PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, entra_oid TEXT UNIQUE NOT NULL, email TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('staff','buyer','admin')), campus TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS catalog_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, description TEXT, unit TEXT DEFAULT 'stuk', image_url TEXT, active INTEGER NOT NULL DEFAULT 1, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, requester_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, campus TEXT NOT NULL, motivation TEXT, status TEXT NOT NULL DEFAULT 'submitted', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, catalog_item_id TEXT REFERENCES catalog_items(id), item_name TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit TEXT, status TEXT NOT NULL DEFAULT 'pending', buyer_id TEXT REFERENCES users(id), buyer_note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, enterprise_number TEXT, vat_number TEXT, name TEXT NOT NULL, street TEXT, house_number TEXT, box TEXT, zipcode TEXT, municipality TEXT, country TEXT DEFAULT 'België', phone TEXT, email TEXT, website TEXT, image_url TEXT, source TEXT DEFAULT 'manual', kbo_snapshot_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_item_suppliers (order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE, supplier_id TEXT NOT NULL REFERENCES suppliers(id), rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 3), PRIMARY KEY(order_item_id, rank));
CREATE TABLE IF NOT EXISTS order_events (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, order_item_id TEXT REFERENCES order_items(id) ON DELETE CASCADE, actor_id TEXT REFERENCES users(id), event_type TEXT NOT NULL, message TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS information_requests (id TEXT PRIMARY KEY, order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE, requested_by TEXT NOT NULL REFERENCES users(id), request_text TEXT NOT NULL, response_text TEXT, requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, responded_at TEXT);
CREATE TABLE IF NOT EXISTS buyer_assignments (user_id TEXT NOT NULL REFERENCES users(id), campus TEXT, category TEXT, PRIMARY KEY(user_id,campus,category));
CREATE INDEX IF NOT EXISTS idx_orders_requester ON orders(requester_id,created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status,created_at);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_enterprise ON suppliers(enterprise_number);
CREATE TABLE IF NOT EXISTS image_assets (
  entity_type TEXT NOT NULL CHECK(entity_type IN ('article','supplier')),
  entity_id TEXT NOT NULL,
  repository_path TEXT NOT NULL,
  image_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(entity_type,entity_id)
);
