-- Bewaar de oorspronkelijke bron-URL voor controle van afbeeldingen.
ALTER TABLE image_assets ADD COLUMN source_url TEXT;
