PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS school_years (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  school_year_id TEXT NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  campus_id TEXT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  class_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source_file TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (school_year_id, campus_id, class_code)
);

CREATE INDEX IF NOT EXISTS idx_classes_year_campus
  ON classes(school_year_id, campus_id, class_code);

CREATE TABLE IF NOT EXISTS personnel_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  staff_number TEXT NOT NULL DEFAULT '',
  campus_id TEXT REFERENCES campuses(id) ON DELETE SET NULL,
  employment_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (employment_status IN ('active','inactive','leave','unknown')),
  start_date TEXT,
  end_date TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_personnel_profiles_campus
  ON personnel_profiles(campus_id, employment_status);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  student_number TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_enrolments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_year_id TEXT NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','ended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, school_year_id),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_student_enrolments_class
  ON student_enrolments(class_id, status);

INSERT OR IGNORE INTO school_years(id,label,start_date,end_date,status)
VALUES ('sy-2026-2027','2026–2027','2026-09-01','2027-08-31','active');

INSERT OR IGNORE INTO campuses(
  id,organization_id,slug,official_name,display_name,street,house_number,postal_code,municipality,country_code,is_main_campus,status,sort_order
)
SELECT '50000000-0000-4000-8000-000000000001',organization_id,'ninove',official_name,display_name,street,house_number,postal_code,municipality,country_code,0,'draft',0
FROM organization_locations WHERE id='20000000-0000-4000-8000-000000000001';

INSERT OR IGNORE INTO campuses(
  id,organization_id,slug,official_name,display_name,street,house_number,postal_code,municipality,country_code,is_main_campus,status,sort_order
)
SELECT '50000000-0000-4000-8000-000000000002',organization_id,'zottegem',official_name,display_name,street,house_number,postal_code,municipality,country_code,0,'draft',10
FROM organization_locations WHERE id='20000000-0000-4000-8000-000000000002';
