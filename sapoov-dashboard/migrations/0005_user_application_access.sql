PRAGMA foreign_keys = ON;

-- Application access is independent from role assignments. Disabling access must
-- never delete the user's existing application roles.
CREATE TABLE IF NOT EXISTS user_application_access (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, application_id)
);

-- Preserve every currently effective user/application relationship during rollout.
INSERT OR IGNORE INTO user_application_access(user_id,application_id,enabled,updated_by)
SELECT DISTINCT user_id,application_id,1,'migration'
FROM user_app_roles;

CREATE INDEX IF NOT EXISTS idx_user_application_access_app
ON user_application_access(application_id,enabled);
