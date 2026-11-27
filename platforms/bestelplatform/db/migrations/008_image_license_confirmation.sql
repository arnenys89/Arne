-- Record explicit user confirmation that image usage rights were checked.
ALTER TABLE image_assets ADD COLUMN license_confirmed INTEGER NOT NULL DEFAULT 0;
