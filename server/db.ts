import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'akhuwat_campus_brain.db');

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initializeSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      head_name TEXT,
      description TEXT,
      established_year INTEGER,
      building_location TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      degree_level TEXT NOT NULL,
      duration_years INTEGER NOT NULL DEFAULT 4,
      total_semesters INTEGER NOT NULL DEFAULT 8,
      credit_hours INTEGER NOT NULL DEFAULT 130,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS semesters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS faculty (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      photo_url TEXT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      designation TEXT NOT NULL,
      qualification TEXT NOT NULL,
      specialization TEXT,
      subjects_taught TEXT,
      experience_years INTEGER NOT NULL DEFAULT 0,
      joining_date TEXT NOT NULL,
      responsibilities TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
      semester_number INTEGER NOT NULL DEFAULT 1,
      credit_hours INTEGER NOT NULL DEFAULT 3,
      instructor_id INTEGER REFERENCES faculty(id) ON DELETE SET NULL,
      schedule_slot TEXT,
      room_number TEXT
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_uid TEXT NOT NULL UNIQUE,
      registration_number TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      photo_url TEXT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
      current_semester INTEGER NOT NULL DEFAULT 1,
      admission_year INTEGER NOT NULL,
      batch_label TEXT NOT NULL,
      cgpa REAL,
      academic_status TEXT NOT NULL DEFAULT 'Active',
      guardian_name TEXT NOT NULL,
      guardian_phone TEXT,
      guardian_relation TEXT DEFAULT 'Father',
      address TEXT,
      cnic TEXT,
      date_of_birth TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT')),
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      linked_student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      linked_faculty_id INTEGER REFERENCES faculty(id) ON DELETE SET NULL,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      semester_id INTEGER REFERENCES semesters(id) ON DELETE SET NULL,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Leave', 'Late')),
      marked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      remarks TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, course_id, attendance_date)
    );

    CREATE TABLE IF NOT EXISTS examinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      exam_type TEXT NOT NULL,
      semester_id INTEGER REFERENCES semesters(id) ON DELETE SET NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      exam_date TEXT NOT NULL,
      total_marks REAL NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'Completed'
    );

    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
      examination_id INTEGER REFERENCES examinations(id) ON DELETE SET NULL,
      marks_obtained REAL NOT NULL,
      total_marks REAL NOT NULL DEFAULT 100,
      grade TEXT NOT NULL,
      gpa_points REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Passed',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, course_id, semester_id)
    );

    CREATE TABLE IF NOT EXISTS scholarships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      category TEXT NOT NULL,
      coverage_type TEXT NOT NULL,
      annual_budget_pkr REAL NOT NULL DEFAULT 0,
      eligibility_criteria TEXT NOT NULL,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'Open',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS financial_assistance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      scholarship_id INTEGER REFERENCES scholarships(id) ON DELETE SET NULL,
      academic_year TEXT NOT NULL,
      assistance_type TEXT NOT NULL,
      amount_pkr REAL NOT NULL DEFAULT 0,
      fee_concession_pct REAL NOT NULL DEFAULT 0,
      application_status TEXT NOT NULL CHECK(application_status IN ('Pending', 'Under Review', 'Approved', 'Disbursed', 'Rejected')),
      approved_by TEXT,
      disbursement_date TEXT,
      remarks TEXT,
      is_confidential INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      event_date TEXT NOT NULL,
      venue TEXT NOT NULL,
      organizer TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      guest_speakers TEXT,
      description TEXT,
      outcomes TEXT,
      cover_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'Completed',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      faculty_id INTEGER REFERENCES faculty(id) ON DELETE SET NULL,
      participant_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Participant',
      certificate_issued INTEGER NOT NULL DEFAULT 0,
      UNIQUE(event_id, participant_name)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'College',
      achievement_date TEXT NOT NULL,
      issuing_organization TEXT NOT NULL,
      description TEXT,
      certificate_url TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      certificate_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      category TEXT NOT NULL,
      file_url TEXT,
      verified INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS archive_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      folder TEXT NOT NULL DEFAULT 'General Archive',
      category TEXT NOT NULL,
      year_label TEXT NOT NULL,
      description TEXT,
      file_url TEXT,
      file_name TEXT,
      file_type TEXT,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      available_quantity INTEGER NOT NULL DEFAULT 1,
      condition_status TEXT NOT NULL DEFAULT 'Operational',
      last_maintenance_date TEXT,
      next_maintenance_date TEXT,
      maintenance_notes TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_sku TEXT NOT NULL UNIQUE,
      item_name TEXT NOT NULL,
      resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      unit_count INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      assigned_to TEXT,
      status TEXT NOT NULL DEFAULT 'In Stock',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      target_role TEXT NOT NULL DEFAULT 'ALL',
      priority TEXT NOT NULL DEFAULT 'Normal',
      event_date TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS academic_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      semester_id INTEGER REFERENCES semesters(id) ON DELETE SET NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS import_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_rows INTEGER NOT NULL DEFAULT 0,
      skipped_rows INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      details_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_students_dept ON students(department_id);
    CREATE INDEX IF NOT EXISTS idx_students_reg ON students(registration_number);
    CREATE INDEX IF NOT EXISTS idx_students_batch ON students(admission_year);
    CREATE INDEX IF NOT EXISTS idx_faculty_dept ON faculty(department_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
    CREATE INDEX IF NOT EXISTS idx_attendance_dept ON attendance(department_id);
    CREATE INDEX IF NOT EXISTS idx_results_student ON results(student_id);
    CREATE INDEX IF NOT EXISTS idx_financial_student ON financial_assistance(student_id);
    CREATE INDEX IF NOT EXISTS idx_achievements_student ON achievements(student_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  const tablesWithDemoFlag = [
    'faculty',
    'students',
    'financial_assistance',
    'events',
    'achievements',
    'archive_documents',
    'resources',
    'announcements',
  ];
  for (const tbl of tablesWithDemoFlag) {
    const cols = db.prepare(`PRAGMA table_info(${tbl})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'is_demo')) {
      db.exec(`ALTER TABLE ${tbl} ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;`);
    }
  }
}

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}
