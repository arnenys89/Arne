-- Per bestelartikel een verplichte verantwoording.
-- Bestaande bestellingen blijven behouden; oudere regels krijgen tijdelijk een lege waarde.
ALTER TABLE order_items ADD COLUMN justification TEXT NOT NULL DEFAULT '';

-- Indexering is niet nodig: de verantwoording wordt samen met de bestelregel opgehaald.
