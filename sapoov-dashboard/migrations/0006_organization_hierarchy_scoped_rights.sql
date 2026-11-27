PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organization_units (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES organization_units(id) ON DELETE RESTRICT,
  unit_type TEXT NOT NULL CHECK(unit_type IN ('koepel','schoolbestuur','school','locatie')),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_organization_units_parent ON organization_units(parent_id,sort_order,name);

CREATE TABLE IF NOT EXISTS user_application_access_scopes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  organization_unit_id TEXT NOT NULL REFERENCES organization_units(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,application_id,organization_unit_id)
);
CREATE INDEX IF NOT EXISTS idx_user_access_scopes_lookup ON user_application_access_scopes(user_id,application_id,organization_unit_id);

CREATE TABLE IF NOT EXISTS user_application_role_scopes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  organization_unit_id TEXT NOT NULL REFERENCES organization_units(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,application_id,role_id,organization_unit_id)
);
CREATE INDEX IF NOT EXISTS idx_user_role_scopes_lookup ON user_application_role_scopes(user_id,application_id,organization_unit_id);

INSERT OR IGNORE INTO organization_units(id,parent_id,unit_type,name,sort_order) VALUES
('koepel-provinciaal-onderwijs-vlaanderen',NULL,'koepel','Provinciaal Onderwijs Vlaanderen',10),
('schoolbestuur-provinciebestuur-oost-vlaanderen','koepel-provinciaal-onderwijs-vlaanderen','schoolbestuur','Provinciebestuur Oost-Vlaanderen',10),
('school-richtpunt-ninove-zottegem','schoolbestuur-provinciebestuur-oost-vlaanderen','school','Richtpunt Campus Ninove Zottegem',10),
('locatie-richtpunt-ninove','school-richtpunt-ninove-zottegem','locatie','Ninove',10),
('locatie-richtpunt-zottegem','school-richtpunt-ninove-zottegem','locatie','Zottegem',20),
('school-richtpunt-eeklo','schoolbestuur-provinciebestuur-oost-vlaanderen','school','Richtpunt Campus Eeklo',20),
('locatie-richtpunt-eeklo','school-richtpunt-eeklo','locatie','Eeklo',10),
('school-richtpunt-hamme','schoolbestuur-provinciebestuur-oost-vlaanderen','school','Richtpunt Campus Hamme',30),
('locatie-richtpunt-hamme','school-richtpunt-hamme','locatie','Hamme',10),
('school-richtpunt-gent','schoolbestuur-provinciebestuur-oost-vlaanderen','school','Richtpunt Campus Gent',40),
('locatie-richtpunt-gent-henlikai','school-richtpunt-gent','locatie','Gent – Henlikai',10),
('locatie-richtpunt-gent-hotwijselaan','school-richtpunt-gent','locatie','Gent – Hotwijselaan',20),
('school-kimpunt-assenede','schoolbestuur-provinciebestuur-oost-vlaanderen','school','Kimpunt Campus Asse-nede',50),
('locatie-kimpunt-assenede','school-kimpunt-assenede','locatie','Assenede',10),
('school-kimpunt-eeklo','schoolbestuur-provinciebestuur-oost-vlaanderen','school','Kimpunt Campus Eeklo',60),
('locatie-kimpunt-eeklo','school-kimpunt-eeklo','locatie','Eeklo',10),
('school-groeipunt','schoolbestuur-provinciebestuur-oost-vlaanderen','school','Groeipunt',70);

ALTER TABLE campuses ADD COLUMN organization_unit_id TEXT REFERENCES organization_units(id);
UPDATE campuses SET organization_unit_id='locatie-richtpunt-ninove' WHERE id='ninove';
UPDATE campuses SET organization_unit_id='locatie-richtpunt-zottegem' WHERE id='zottegem';

INSERT OR IGNORE INTO user_application_access_scopes(user_id,application_id,organization_unit_id,enabled,updated_by)
SELECT user_id,application_id,'schoolbestuur-provinciebestuur-oost-vlaanderen',enabled,updated_by
FROM user_application_access WHERE enabled=1;

INSERT OR IGNORE INTO user_application_role_scopes(user_id,application_id,role_id,organization_unit_id,enabled,updated_by)
SELECT user_id,application_id,role_id,'schoolbestuur-provinciebestuur-oost-vlaanderen',1,assigned_by
FROM user_app_roles;
