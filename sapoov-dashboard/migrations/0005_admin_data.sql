-- Lazy-loaded central education and personnel administration data.
CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS school_years (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  class_code TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  campus_id TEXT NOT NULL REFERENCES campuses(id),
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE(class_code,campus_id,school_year_id)
);
CREATE TABLE IF NOT EXISTS personnel_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  staff_number TEXT,
  campus_id TEXT REFERENCES campuses(id),
  employment_status TEXT NOT NULL DEFAULT 'unknown' CHECK (employment_status IN ('unknown','active','leave','inactive')),
  start_date TEXT,
  end_date TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_number TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE IF NOT EXISTS student_enrolments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_year_id TEXT NOT NULL REFERENCES school_years(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  UNIQUE(student_id,school_year_id)
);
CREATE INDEX IF NOT EXISTS idx_classes_year_campus ON classes(school_year_id,campus_id,class_code);
CREATE INDEX IF NOT EXISTS idx_personnel_campus ON personnel_profiles(campus_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_year_class ON student_enrolments(school_year_id,class_id,status);

INSERT OR IGNORE INTO campuses(id,name,short_name) VALUES
 ('ninove','Richtpunt campus Ninove','Ninove'),
 ('zottegem','Richtpunt campus Zottegem','Zottegem');
INSERT OR IGNORE INTO school_years(id,label,start_date,end_date,active) VALUES
 ('2026-2027','2026–2027','2026-09-01','2027-08-31',1),
 ('2027-2028','2027–2028','2027-09-01','2028-08-31',0);
