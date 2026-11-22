-- Teams, teamrechten, leverancierkoppelingen en afbeeldingen.
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  campus TEXT NOT NULL CHECK (campus IN ('Ninove','Zottegem','Beide campussen')),
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE orders ADD COLUMN team_id TEXT REFERENCES teams(id);
ALTER TABLE buyer_assignments ADD COLUMN team_id TEXT REFERENCES teams(id);
CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK(member_role IN ('member','coordinator')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(team_id,user_id)
);
CREATE TABLE IF NOT EXISTS supplier_proposals (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 3),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_item_id,rank),
  UNIQUE(order_item_id,supplier_id)
);
ALTER TABLE catalog_items ADD COLUMN technical_specs TEXT;
ALTER TABLE suppliers ADD COLUMN contact_person TEXT;
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
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_supplier_proposals_item ON supplier_proposals(order_item_id,rank);

CREATE TABLE IF NOT EXISTS catalog_item_suppliers (
  catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  preferred INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(catalog_item_id,supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_item_suppliers_supplier ON catalog_item_suppliers(supplier_id);
