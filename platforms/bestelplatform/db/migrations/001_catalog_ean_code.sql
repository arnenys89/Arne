-- EAN-13 per catalogusartikel.
ALTER TABLE catalog_items ADD COLUMN ean_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_ean_code
ON catalog_items(ean_code)
WHERE ean_code IS NOT NULL AND ean_code <> '';
