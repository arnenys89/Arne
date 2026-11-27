-- Allow administrator-defined campus labels while retaining the legacy teams.campus CHECK values.
ALTER TABLE teams ADD COLUMN custom_campus TEXT;
CREATE INDEX IF NOT EXISTS idx_teams_custom_campus ON teams(custom_campus);
