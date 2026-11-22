ALTER TABLE roles ADD COLUMN application_id TEXT REFERENCES applications(id) ON DELETE CASCADE;
ALTER TABLE roles ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE applications ADD COLUMN access_audience TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_application_name ON roles(application_id, name);

-- Platformrollen zijn per toepassing afzonderlijk beheerd.
INSERT OR IGNORE INTO roles(id, application_id, name, description, permissions_json)
SELECT 'bestelplatform-' || lower(replace(name,' ','-')), 'bestelplatform', name, description,
  CASE name
    WHEN 'Personeelslid' THEN '["orders.create","orders.view_own"]'
    WHEN 'Aankoper' THEN '["orders.view_all","orders.approve","orders.reject","orders.request_info"]'
    WHEN 'Administrator' THEN '["*"]'
    ELSE '[]' END
FROM (
  SELECT 'Personeelslid' name, 'Aanvragen indienen en eigen aanvragen opvolgen' description
  UNION ALL SELECT 'Aankoper','Bestellingen beoordelen en opvolgen'
  UNION ALL SELECT 'Administrator','Volledig beheer van deze toepassing'
);

INSERT OR IGNORE INTO roles(id, application_id, name, description, permissions_json)
SELECT 'professionalisering-' || lower(replace(replace(name,'/','-'),' ','-')), 'professionalisering', name, description,
  CASE name
    WHEN 'Administrator' THEN '["*"]'
    WHEN 'Directie' THEN '["personnel.read_all"]'
    WHEN 'TAC/TA' THEN '["activities.manage"]'
    WHEN 'Econoom' THEN '["budget.manage"]'
    WHEN 'Personeelsverantwoordelijke' THEN '["personnel.manage"]'
    WHEN 'Personeelslid' THEN '["activities.read_own"]'
    ELSE '[]' END
FROM (
  SELECT 'Administrator' name, 'Volledig beheer van deze toepassing' description
  UNION ALL SELECT 'Directie','Inzage in personeelsgegevens'
  UNION ALL SELECT 'TAC/TA','Beheer van toegewezen activiteiten'
  UNION ALL SELECT 'Econoom','Financieel en economisch beheer'
  UNION ALL SELECT 'Personeelsverantwoordelijke','Beheer van personeelsgegevens'
  UNION ALL SELECT 'Personeelslid','Standaardtoegang voor personeelsleden'
);

INSERT OR IGNORE INTO roles(id, application_id, name, description, permissions_json)
SELECT 'werkplekreservatie-' || lower(replace(name,' ','-')), 'werkplekreservatie', name, description,
  CASE name WHEN 'Administrator' THEN '["*"]' WHEN 'Teamleider' THEN '["reservations.manage_team"]' ELSE '["reservations.create","reservations.manage_own"]' END
FROM (
  SELECT 'Medewerker' name, 'Werkplekken reserveren en eigen reservaties beheren' description
  UNION ALL SELECT 'Teamleider','Reservaties en werkplekken binnen het team beheren'
  UNION ALL SELECT 'Administrator','Volledig beheer van deze toepassing'
);
