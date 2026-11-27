PRAGMA foreign_keys = ON;

-- A person may hold the same application role in more than one school.
-- Organization scope is explicit; descendant access is opt-in and defaults off.
CREATE TABLE IF NOT EXISTS user_scoped_role_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  include_descendants INTEGER NOT NULL DEFAULT 0 CHECK (include_descendants IN (0,1)),
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  assigned_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,application_id,role_id,organization_id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_scoped_roles_user
  ON user_scoped_role_assignments(user_id,status,organization_id);
CREATE INDEX IF NOT EXISTS idx_scoped_roles_context
  ON user_scoped_role_assignments(organization_id,application_id,role_id,status);
