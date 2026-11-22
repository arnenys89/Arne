ALTER TABLE catalog_items ADD COLUMN image_url TEXT;
ALTER TABLE suppliers ADD COLUMN image_url TEXT;

CREATE TABLE IF NOT EXISTS image_assets (
  entity_type TEXT NOT NULL CHECK(entity_type IN ('article','supplier')),
  entity_id TEXT NOT NULL,
  repository_path TEXT NOT NULL,
  image_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(entity_type, entity_id)
);