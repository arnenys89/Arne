PRAGMA foreign_keys = ON;

-- Multi-tenant organization metadata. The self-referencing parent field from
-- 0005 represents umbrella -> school board -> educational institution.
ALTER TABLE organizations
  ADD COLUMN organization_type TEXT NOT NULL DEFAULT 'institution'
  CHECK (organization_type IN ('umbrella','school_board','institution'));

ALTER TABLE organizations ADD COLUMN abbreviation TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN postal_street TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN postal_house_number TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN postal_bus TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN postal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN postal_municipality TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN postal_country_code TEXT NOT NULL DEFAULT 'BE';

-- Explicitly named locations avoid confusing an organizational entity with
-- a physical site. The older campuses table remains for compatibility.
CREATE TABLE IF NOT EXISTS organization_locations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL DEFAULT '',
  official_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'school_site'
    CHECK (location_type IN ('school_site','adult_education_campus','lesson_place','administrative_office','other')),
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
  is_main_location INTEGER NOT NULL DEFAULT 0 CHECK (is_main_location IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','inactive','archived')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_locations_org
  ON organization_locations(organization_id,status,sort_order);
CREATE INDEX IF NOT EXISTS idx_org_locations_postcode
  ON organization_locations(postal_code);

CREATE TABLE IF NOT EXISTS organization_location_sources (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES organization_locations(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_record_id TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_location_sources_location
  ON organization_location_sources(location_id,checked_at DESC);

-- Team membership is organization-scoped and separate from module access.
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','inactive','archived')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_teams_institution
  ON teams(institution_id,status,sort_order);

CREATE TABLE IF NOT EXISTS team_memberships (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_type TEXT NOT NULL
    CHECK (membership_type IN ('active_member','passive_member','team_leader')),
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  assigned_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id,user_id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_user
  ON team_memberships(user_id,status);
CREATE INDEX IF NOT EXISTS idx_team_memberships_team
  ON team_memberships(team_id,status,membership_type);

-- A module is an explicit gate per user, module and organization context.
-- Role assignments remain separate and determine the actions allowed inside.
CREATE TABLE IF NOT EXISTS user_module_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  assigned_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,application_id,organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_module_access_context
  ON user_module_access(organization_id,application_id,enabled);
CREATE INDEX IF NOT EXISTS idx_user_module_access_user
  ON user_module_access(user_id,enabled);
