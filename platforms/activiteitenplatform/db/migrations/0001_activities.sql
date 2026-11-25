-- SAPOOV Activiteitenplatform: schema op de centrale gebruikersdatabase
CREATE TABLE IF NOT EXISTS activities (
 id TEXT PRIMARY KEY,title TEXT NOT NULL,applicant_user_id TEXT NOT NULL REFERENCES users(id),
 event_date TEXT NOT NULL,event_time TEXT,campus TEXT NOT NULL,classes TEXT NOT NULL,
 description TEXT NOT NULL,remarks TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 decision_notes TEXT,decided_by TEXT REFERENCES users(id),decided_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activities_applicant ON activities(applicant_user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_activities_status_date ON activities(status,event_date);
CREATE TABLE IF NOT EXISTS activity_goals (
 id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,goal_code TEXT,goal_title TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_goals_activity ON activity_goals(activity_id);
CREATE TABLE IF NOT EXISTS activity_approvals (
 id TEXT PRIMARY KEY,activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
 actor_user_id TEXT REFERENCES users(id),decision TEXT NOT NULL,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activity_audit_log (
 id TEXT PRIMARY KEY,actor_user_id TEXT REFERENCES users(id),activity_id TEXT,action TEXT NOT NULL,
 before_json TEXT,after_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activity_audit_created ON activity_audit_log(created_at);
