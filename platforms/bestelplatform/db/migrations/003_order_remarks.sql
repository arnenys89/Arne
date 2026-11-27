-- Optionele algemene opmerkingen bij een volledige bestelling.
-- Dit staat los van de verplichte verantwoording per bestelartikel.
ALTER TABLE orders ADD COLUMN remarks TEXT;
