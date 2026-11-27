PRAGMA foreign_keys = ON;

-- Organisaties zijn juridische/administratieve instellingen; campussen zijn fysieke vestigingsplaatsen.
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  official_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  institution_number TEXT UNIQUE,
  enterprise_number TEXT,
  education_type TEXT NOT NULL DEFAULT '',
  education_network TEXT NOT NULL DEFAULT 'Provinciaal Onderwijs Oost-Vlaanderen',
  parent_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  general_email TEXT NOT NULL DEFAULT '',
  general_phone TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  logo_object_key TEXT NOT NULL DEFAULT '',
  logo_source_url TEXT NOT NULL DEFAULT '',
  logo_alt TEXT NOT NULL DEFAULT '',
  logo_license_note TEXT NOT NULL DEFAULT '',
  official_source_url TEXT NOT NULL DEFAULT '',
  source_verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','inactive','archived')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  official_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  street TEXT NOT NULL DEFAULT '',
  house_number TEXT NOT NULL DEFAULT '',
  bus TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  municipality TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT 'BE',
  general_email TEXT NOT NULL DEFAULT '',
  general_phone TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  logo_object_key TEXT NOT NULL DEFAULT '',
  logo_source_url TEXT NOT NULL DEFAULT '',
  official_source_url TEXT NOT NULL DEFAULT '',
  source_verified_at TEXT,
  is_main_campus INTEGER NOT NULL DEFAULT 0 CHECK(is_main_campus IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','inactive','archived')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id,slug)
);

CREATE TABLE IF NOT EXISTS organization_sources (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_record_id TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NOT NULL DEFAULT '',
  CHECK ((organization_id IS NOT NULL AND campus_id IS NULL) OR
         (organization_id IS NULL AND campus_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS user_organization_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL DEFAULT 'organization_member',
  assigned_by TEXT NOT NULL DEFAULT 'system',
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,organization_id,role_name)
);

CREATE INDEX IF NOT EXISTS idx_organizations_parent ON organizations(parent_organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status,sort_order);
CREATE INDEX IF NOT EXISTS idx_campuses_org ON campuses(organization_id,status,sort_order);
CREATE INDEX IF NOT EXISTS idx_campuses_postcode ON campuses(postal_code);
CREATE INDEX IF NOT EXISTS idx_org_sources_org ON organization_sources(organization_id,checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_sources_campus ON organization_sources(campus_id,checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_org_roles_org ON user_organization_roles(organization_id,user_id);
