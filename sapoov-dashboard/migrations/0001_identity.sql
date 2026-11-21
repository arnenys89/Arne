PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','invited')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'grid',
  category TEXT NOT NULL DEFAULT 'Onderwijs',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','hidden')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_app_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id),
  assigned_by TEXT NOT NULL DEFAULT 'system',
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, application_id, role_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_app_roles_app ON user_app_roles(application_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);

INSERT OR IGNORE INTO roles(id,name,description) VALUES
 ('superadmin','Superadministrator','Volledig platformbeheer'),
 ('app_admin','Applicatiebeheerder','Gebruikers en instellingen binnen toegewezen applicaties'),
 ('manager','Beheerder','Inhoudelijk beheer binnen toegewezen applicaties'),
 ('reviewer','Beoordelaar','Aanvragen en inhoud beoordelen'),
 ('staff','Medewerker','Standaardtoegang tot toegewezen applicaties'),
 ('reader','Lezer','Alleen-lezen toegang');

INSERT OR IGNORE INTO applications(id,name,description,url,icon,category,sort_order) VALUES
 ('bestelplatform','Bestelplatform','Bestellingen en catalogus beheren','https://bestelplatform.richtpunt.be','shopping-cart','Administratie',10),
 ('calendar-bridge','Calendar Bridge','Agenda’s verbinden en synchroniseren','https://calendarbridge.richtpunt.be','calendar','Productiviteit',20),
 ('professionalisering','Professionalisering','Professionalisering en activiteiten','https://professionalisering.richtpunt.be','graduation-cap','Personeel',30),
 ('activiteitenplatform','Activiteitenplatform','Activiteiten aanvragen en opvolgen','https://activiteiten.richtpunt.be','calendar-check','Personeel',40),
 ('schoolreglementen','Schoolreglementen','Schoolreglementen beheren en raadplegen','https://schoolreglementen.richtpunt.be','book-open','Onderwijs',50),
 ('edudash','Edudash','Onderwijsdashboard','https://edudash.richtpunt.be','layout-dashboard','Onderwijs',60),
 ('doelennetwerk','SAPO Doelennetwerk','Doelen en leerlijnen beheren','https://doelennetwerk.richtpunt.be','network','Onderwijs',70);
