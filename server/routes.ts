import express, { type Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, getUploadsDir } from './db.ts';
import {
  clearSessionCookie,
  hashPassword,
  logAudit,
  requireAuth,
  requireRole,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
  type AuthedRequest,
  type UserRole,
} from './auth.ts';
import { runCampusIntelligenceQuery } from './ai.ts';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadsDir());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const unique = crypto.randomBytes(4).toString('hex');
    cb(null, `${Date.now()}_${unique}_${safeBase}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

function gradeFromMarks(marks: number, totalMarks: number): { grade: string; gpa: number; status: string } {
  const pct = totalMarks > 0 ? (marks / totalMarks) * 100 : 0;
  if (pct >= 85) return { grade: 'A', gpa: 4.0, status: 'Passed' };
  if (pct >= 80) return { grade: 'A-', gpa: 3.7, status: 'Passed' };
  if (pct >= 75) return { grade: 'B+', gpa: 3.3, status: 'Passed' };
  if (pct >= 70) return { grade: 'B', gpa: 3.0, status: 'Passed' };
  if (pct >= 65) return { grade: 'B-', gpa: 2.7, status: 'Passed' };
  if (pct >= 60) return { grade: 'C+', gpa: 2.3, status: 'Passed' };
  if (pct >= 50) return { grade: 'C', gpa: 2.0, status: 'Passed' };
  return { grade: 'F', gpa: 0.0, status: 'Failed' };
}

export function createApiRouter(): Router {
  const router = express.Router();

  // ======================== AUTHENTICATION ========================
  router.post('/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = db
      .prepare(
        `SELECT id, email, password_hash, full_name, role, department_id, linked_student_id, linked_faculty_id, avatar_url, status
         FROM users WHERE LOWER(email) = LOWER(?)`
      )
      .get(String(email).trim()) as
      | {
          id: number;
          email: string;
          password_hash: string;
          full_name: string;
          role: UserRole;
          department_id: number | null;
          linked_student_id: number | null;
          linked_faculty_id: number | null;
          avatar_url: string | null;
          status: string;
        }
      | undefined;

    if (!row || !verifyPassword(String(password), row.password_hash)) {
      res.status(401).json({ error: 'Invalid institutional email or password.' });
      return;
    }

    if (row.status !== 'Active') {
      res.status(403).json({ error: 'This account is currently suspended. Contact Super Admin.' });
      return;
    }

    const token = signSessionToken({ id: row.id, email: row.email, role: row.role });
    setSessionCookie(res, token);

    const safeUser = {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      department_id: row.department_id,
      linked_student_id: row.linked_student_id,
      linked_faculty_id: row.linked_faculty_id,
      avatar_url: row.avatar_url,
      status: row.status,
    };

    logAudit(safeUser, 'USER_LOGIN', 'users', row.id, 'Authenticated session started');
    res.json({ user: safeUser, token });
  });

  router.post('/auth/register', (req, res) => {
    const { email, password, full_name, role, registration_number } = req.body ?? {};
    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'Full name, email, and password are required.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(String(email).trim());
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    // Self-registration is restricted to STUDENT or TEACHER (privileged roles require Super Admin)
    const allowedSelfRole: UserRole = role === 'TEACHER' ? 'TEACHER' : 'STUDENT';

    let linkedStudentId: number | null = null;
    let linkedFacultyId: number | null = null;
    let departmentId: number | null = null;

    if (allowedSelfRole === 'STUDENT') {
      const stu = registration_number
        ? (db.prepare('SELECT id, department_id FROM students WHERE UPPER(registration_number) = UPPER(?)').get(String(registration_number).trim()) as { id: number; department_id: number } | undefined)
        : (db.prepare('SELECT id, department_id FROM students WHERE LOWER(email) = LOWER(?)').get(String(email).trim()) as { id: number; department_id: number } | undefined);
      if (stu) {
        linkedStudentId = stu.id;
        departmentId = stu.department_id;
      }
    } else {
      const fac = db.prepare('SELECT id, department_id FROM faculty WHERE LOWER(email) = LOWER(?)').get(String(email).trim()) as { id: number; department_id: number } | undefined;
      if (fac) {
        linkedFacultyId = fac.id;
        departmentId = fac.department_id;
      }
    }

    const passwordHash = hashPassword(String(password));
    const info = db
      .prepare(
        `INSERT INTO users (email, password_hash, full_name, role, department_id, linked_student_id, linked_faculty_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`
      )
      .run(String(email).trim(), passwordHash, String(full_name).trim(), allowedSelfRole, departmentId, linkedStudentId, linkedFacultyId);

    const newId = Number(info.lastInsertRowid);
    const token = signSessionToken({ id: newId, email: String(email).trim(), role: allowedSelfRole });
    setSessionCookie(res, token);

    const user = {
      id: newId,
      email: String(email).trim(),
      full_name: String(full_name).trim(),
      role: allowedSelfRole,
      department_id: departmentId,
      linked_student_id: linkedStudentId,
      linked_faculty_id: linkedFacultyId,
      avatar_url: null,
      status: 'Active',
    };

    logAudit(user, 'USER_REGISTERED', 'users', newId, `Self-registered as ${allowedSelfRole}`);
    res.status(201).json({ user, token });
  });

  router.post('/auth/logout', (req: AuthedRequest, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  router.put('/auth/password', requireAuth, (req: AuthedRequest, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }
    if (String(newPassword).length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(String(currentPassword), row.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(newPassword)), req.user!.id);
    logAudit(req.user, 'CHANGE_PASSWORD', 'users', req.user!.id, 'Updated account password');
    res.json({ ok: true });
  });

  // ======================== FILE UPLOAD ========================
  router.post('/upload', requireAuth, upload.single('file'), (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided.' });
      return;
    }
    res.json({
      url: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  });

  // ======================== DASHBOARD OVERVIEW ========================
  router.get('/dashboard/overview', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const totalStudents = (db.prepare("SELECT COUNT(*) as c FROM students WHERE academic_status = 'Active'").get() as { c: number }).c;
    const totalFaculty = (db.prepare("SELECT COUNT(*) as c FROM faculty WHERE status = 'Active'").get() as { c: number }).c;
    const totalDepartments = (db.prepare('SELECT COUNT(*) as c FROM departments').get() as { c: number }).c;
    const activePrograms = (db.prepare("SELECT COUNT(*) as c FROM programs WHERE status = 'Active'").get() as { c: number }).c;
    const totalEvents = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
    const totalAchievements = (db.prepare('SELECT COUNT(*) as c FROM achievements').get() as { c: number }).c;

    const avgCgpaRow = db.prepare('SELECT ROUND(AVG(cgpa), 2) as avg_cgpa FROM students WHERE cgpa IS NOT NULL').get() as { avg_cgpa: number | null };
    const attRow = db
      .prepare(
        `SELECT COUNT(*) as total_marks,
                SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) as present_marks
         FROM attendance`
      )
      .get() as { total_marks: number; present_marks: number | null };

    const overallAttendance =
      attRow.total_marks > 0 && attRow.present_marks != null
        ? Number(((attRow.present_marks / attRow.total_marks) * 100).toFixed(1))
        : null;

    const deptEnrollment = db
      .prepare(
        `SELECT d.code, d.name,
                COUNT(DISTINCT s.id) as students,
                ROUND(AVG(s.cgpa), 2) as avgCgpa,
                (SELECT COUNT(*) FROM faculty f WHERE f.department_id = d.id AND f.status = 'Active') as faculty
         FROM departments d
         LEFT JOIN students s ON s.department_id = d.id
         GROUP BY d.id
         ORDER BY students DESC`
      )
      .all();

    const batchTrend = db
      .prepare(
        `SELECT batch_label as batch, admission_year, COUNT(*) as enrolled, ROUND(AVG(cgpa), 2) as avgCgpa
         FROM students
         GROUP BY admission_year, batch_label
         ORDER BY admission_year ASC`
      )
      .all();

    const attendanceTrend = db
      .prepare(
        `SELECT attendance_date as date,
                COUNT(*) as total,
                ROUND(100.0 * SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as rate
         FROM attendance
         GROUP BY attendance_date
         ORDER BY attendance_date ASC`
      )
      .all();

    const recentEvents = db
      .prepare(
        `SELECT id, title, category, event_date, venue, status, cover_image_url
         FROM events ORDER BY event_date DESC LIMIT 5`
      )
      .all();

    const announcements = db
      .prepare(
        `SELECT id, title, body, category, target_role, priority, event_date, created_at
         FROM announcements
         WHERE target_role = 'ALL' OR target_role = ?
         ORDER BY CASE priority WHEN 'Urgent' THEN 1 WHEN 'Important' THEN 2 ELSE 3 END, created_at DESC
         LIMIT 6`
      )
      .all(user.role);

    const lowAttendanceCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM (
             SELECT student_id, 100.0 * SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) as pct
             FROM attendance GROUP BY student_id HAVING pct < 75.0
           )`
        )
        .get() as { c: number }
    ).c;

    const demoStudents = (db.prepare('SELECT COUNT(*) as c FROM students WHERE is_demo = 1').get() as { c: number }).c;
    const realStudents = (db.prepare('SELECT COUNT(*) as c FROM students WHERE is_demo = 0').get() as { c: number }).c;
    const demoFaculty = (db.prepare('SELECT COUNT(*) as c FROM faculty WHERE is_demo = 1').get() as { c: number }).c;
    const realFaculty = (db.prepare('SELECT COUNT(*) as c FROM faculty WHERE is_demo = 0').get() as { c: number }).c;

    res.json({
      kpis: {
        totalStudents,
        totalFaculty,
        totalDepartments,
        activePrograms,
        totalEvents,
        totalAchievements,
        avgCgpa: avgCgpaRow.avg_cgpa,
        overallAttendance,
        lowAttendanceCount,
      },
      demoSummary: {
        demoStudents,
        realStudents,
        demoFaculty,
        realFaculty,
        hasDemoData: demoStudents > 0 || demoFaculty > 0,
      },
      deptEnrollment,
      batchTrend,
      attendanceTrend,
      recentEvents,
      announcements,
    });
  });

  router.post('/admin/clear-demo-data', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(`
        UPDATE users SET linked_student_id = NULL WHERE linked_student_id IN (SELECT id FROM students WHERE is_demo = 1);
        UPDATE users SET linked_faculty_id = NULL WHERE linked_faculty_id IN (SELECT id FROM faculty WHERE is_demo = 1);
        UPDATE courses SET instructor_id = NULL WHERE instructor_id IN (SELECT id FROM faculty WHERE is_demo = 1);
        DELETE FROM financial_assistance WHERE is_demo = 1;
        DELETE FROM achievements WHERE is_demo = 1;
        DELETE FROM events WHERE is_demo = 1;
        DELETE FROM archive_documents WHERE is_demo = 1;
        DELETE FROM resources WHERE is_demo = 1;
        DELETE FROM announcements WHERE is_demo = 1;
        DELETE FROM students WHERE is_demo = 1;
        DELETE FROM faculty WHERE is_demo = 1;
      `);
      db.exec('COMMIT');
      logAudit(req.user, 'CLEAR_DEMO_DATA', 'database', null, 'Purged all demonstration sample records while keeping real institutional records intact');
      res.json({ ok: true });
    } catch (err: unknown) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to clear demonstration records.' });
    }
  });

  // ======================== NOTIFICATIONS ========================
  router.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const announcements = db
      .prepare(
        `SELECT id, title, body, category, priority, event_date, created_at
         FROM announcements
         WHERE target_role = 'ALL' OR target_role = ?
         ORDER BY created_at DESC LIMIT 15`
      )
      .all(user.role);

    const upcomingEvents = db
      .prepare(
        `SELECT id, title, category, event_date, venue
         FROM events
         WHERE status = 'Upcoming'
         ORDER BY event_date ASC LIMIT 5`
      )
      .all();

    const attendanceWarnings =
      user.role === 'STUDENT' && user.linked_student_id
        ? db
            .prepare(
              `SELECT s.full_name, s.registration_number,
                      ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as pct
               FROM attendance a JOIN students s ON s.id = a.student_id
               WHERE a.student_id = ?
               GROUP BY s.id HAVING pct < 75.0`
            )
            .all(user.linked_student_id)
        : db
            .prepare(
              `SELECT s.id, s.full_name, s.registration_number, d.code as department_code,
                      ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as pct
               FROM attendance a
               JOIN students s ON s.id = a.student_id
               JOIN departments d ON d.id = s.department_id
               GROUP BY s.id HAVING pct < 75.0
               ORDER BY pct ASC LIMIT 10`
            )
            .all();

    res.json({ announcements, upcomingEvents, attendanceWarnings });
  });

  router.post('/announcements', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TEACHER'), (req: AuthedRequest, res) => {
    const { title, body, category, target_role, priority, event_date } = req.body ?? {};
    if (!title || !body) {
      res.status(400).json({ error: 'Title and message body are required.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO announcements (title, body, category, target_role, priority, event_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(title).trim(),
        String(body).trim(),
        category || 'Administrative',
        target_role || 'ALL',
        priority || 'Normal',
        event_date || null,
        req.user!.id
      );
    logAudit(req.user, 'CREATE_ANNOUNCEMENT', 'announcements', Number(info.lastInsertRowid), String(title));
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.delete('/announcements/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM announcements WHERE id = ?').run(Number(req.params.id));
    logAudit(req.user, 'DELETE_ANNOUNCEMENT', 'announcements', req.params.id);
    res.json({ ok: true });
  });

  // ======================== GLOBAL SEARCH ========================
  router.get('/search', requireAuth, (req: AuthedRequest, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.json({ results: [] });
      return;
    }
    const pattern = `%${q}%`;
    const user = req.user!;
    const results: Array<{ type: string; id: number; title: string; subtitle: string; module: string }> = [];

    // Students (scoped if STUDENT)
    const studentRows =
      user.role === 'STUDENT' && user.linked_student_id
        ? (db
            .prepare(
              `SELECT s.id, s.full_name, s.registration_number, d.code as dept
               FROM students s JOIN departments d ON d.id = s.department_id
               WHERE s.id = ? AND (s.full_name LIKE ? OR s.registration_number LIKE ?)`
            )
            .all(user.linked_student_id, pattern, pattern) as Array<{ id: number; full_name: string; registration_number: string; dept: string }>)
        : (db
            .prepare(
              `SELECT s.id, s.full_name, s.registration_number, d.code as dept
               FROM students s JOIN departments d ON d.id = s.department_id
               WHERE s.full_name LIKE ? OR s.registration_number LIKE ? OR s.student_uid LIKE ?
               LIMIT 6`
            )
            .all(pattern, pattern, pattern) as Array<{ id: number; full_name: string; registration_number: string; dept: string }>);

    for (const s of studentRows) {
      results.push({ type: 'Student', id: s.id, title: s.full_name, subtitle: `${s.registration_number} · ${s.dept}`, module: 'students' });
    }

    const facultyRows = db
      .prepare(
        `SELECT f.id, f.full_name, f.designation, d.code as dept
         FROM faculty f JOIN departments d ON d.id = f.department_id
         WHERE f.full_name LIKE ? OR f.employee_id LIKE ? OR f.specialization LIKE ? LIMIT 5`
      )
      .all(pattern, pattern, pattern) as Array<{ id: number; full_name: string; designation: string; dept: string }>;
    for (const f of facultyRows) {
      results.push({ type: 'Faculty', id: f.id, title: f.full_name, subtitle: `${f.designation} · ${f.dept}`, module: 'faculty' });
    }

    const deptRows = db
      .prepare('SELECT id, name, code FROM departments WHERE name LIKE ? OR code LIKE ? LIMIT 4')
      .all(pattern, pattern) as Array<{ id: number; name: string; code: string }>;
    for (const d of deptRows) {
      results.push({ type: 'Department', id: d.id, title: d.name, subtitle: d.code, module: 'departments' });
    }

    const eventRows = db
      .prepare('SELECT id, title, category, event_date FROM events WHERE title LIKE ? OR category LIKE ? OR venue LIKE ? LIMIT 5')
      .all(pattern, pattern, pattern) as Array<{ id: number; title: string; category: string; event_date: string }>;
    for (const e of eventRows) {
      results.push({ type: 'Event', id: e.id, title: e.title, subtitle: `${e.category} · ${e.event_date}`, module: 'events' });
    }

    const achRows = db
      .prepare('SELECT id, title, category, level FROM achievements WHERE title LIKE ? OR category LIKE ? LIMIT 5')
      .all(pattern, pattern) as Array<{ id: number; title: string; category: string; level: string }>;
    for (const a of achRows) {
      results.push({ type: 'Achievement', id: a.id, title: a.title, subtitle: `${a.category} · ${a.level}`, module: 'achievements' });
    }

    const archRows = db
      .prepare('SELECT id, title, category, year_label FROM archive_documents WHERE title LIKE ? OR category LIKE ? OR folder LIKE ? LIMIT 5')
      .all(pattern, pattern, pattern) as Array<{ id: number; title: string; category: string; year_label: string }>;
    for (const d of archRows) {
      results.push({ type: 'Archive', id: d.id, title: d.title, subtitle: `${d.category} · ${d.year_label}`, module: 'archive' });
    }

    const courseRows = db
      .prepare('SELECT id, code, title FROM courses WHERE title LIKE ? OR code LIKE ? LIMIT 5')
      .all(pattern, pattern) as Array<{ id: number; code: string; title: string }>;
    for (const c of courseRows) {
      results.push({ type: 'Course', id: c.id, title: `${c.code} — ${c.title}`, subtitle: 'Academic Course', module: 'academics' });
    }

    res.json({ results });
  });

  // ======================== STUDENTS ========================
  router.get('/students', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { search, departmentId, semester, batch, status, origin } = req.query;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (user.role === 'STUDENT') {
      if (!user.linked_student_id) {
        res.json({ students: [] });
        return;
      }
      conditions.push('s.id = ?');
      params.push(user.linked_student_id);
    }

    if (search) {
      const p = `%${String(search).trim()}%`;
      conditions.push('(s.full_name LIKE ? OR s.registration_number LIKE ? OR s.student_uid LIKE ? OR COALESCE(s.email, \'\') LIKE ?)');
      params.push(p, p, p, p);
    }
    if (departmentId && departmentId !== 'all') {
      conditions.push('s.department_id = ?');
      params.push(Number(departmentId));
    }
    if (semester && semester !== 'all') {
      conditions.push('s.current_semester = ?');
      params.push(Number(semester));
    }
    if (batch && batch !== 'all') {
      conditions.push('s.admission_year = ?');
      params.push(Number(batch));
    }
    if (status && status !== 'all') {
      conditions.push('s.academic_status = ?');
      params.push(String(status));
    }
    if (origin === 'real') {
      conditions.push('s.is_demo = 0');
    } else if (origin === 'demo') {
      conditions.push('s.is_demo = 1');
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const hideSensitive = user.role === 'TEACHER';

    const rows = db
      .prepare(
        `SELECT s.*, d.code as department_code, d.name as department_name,
                p.code as program_code, p.name as program_name,
                (SELECT ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)
                 FROM attendance a WHERE a.student_id = s.id) as attendance_pct
         FROM students s
         LEFT JOIN departments d ON d.id = s.department_id
         LEFT JOIN programs p ON p.id = s.program_id
         ${where}
         ORDER BY s.admission_year DESC, s.registration_number ASC`
      )
      .all(...params) as Array<Record<string, unknown>>;

    const sanitized = hideSensitive
      ? rows.map((r) => ({ ...r, cnic: undefined, guardian_phone: undefined }))
      : rows;

    res.json({ students: sanitized });
  });

  router.get('/students/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const user = req.user!;

    if (user.role === 'STUDENT' && user.linked_student_id !== id) {
      res.status(403).json({ error: 'Students may only access their own academic profile.' });
      return;
    }

    const student = db
      .prepare(
        `SELECT s.*, d.code as department_code, d.name as department_name,
                p.code as program_code, p.name as program_name
         FROM students s
         LEFT JOIN departments d ON d.id = s.department_id
         LEFT JOIN programs p ON p.id = s.program_id
         WHERE s.id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!student) {
      res.status(404).json({ error: 'Student record not found.' });
      return;
    }

    const attendanceHistory = db
      .prepare(
        `SELECT a.id, a.attendance_date, a.status, a.remarks, c.code as course_code, c.title as course_title
         FROM attendance a
         JOIN courses c ON c.id = a.course_id
         WHERE a.student_id = ?
         ORDER BY a.attendance_date DESC LIMIT 50`
      )
      .all(id);

    const results = db
      .prepare(
        `SELECT r.*, c.code as course_code, c.title as course_title, sem.name as semester_name
         FROM results r
         JOIN courses c ON c.id = r.course_id
         JOIN semesters sem ON sem.id = r.semester_id
         WHERE r.student_id = ?
         ORDER BY sem.start_date DESC`
      )
      .all(id);

    const canViewFinancial = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || (user.role === 'STUDENT' && user.linked_student_id === id);
    const scholarships = canViewFinancial
      ? db
          .prepare(
            `SELECT fa.*, sch.title as scholarship_title, sch.provider
             FROM financial_assistance fa
             LEFT JOIN scholarships sch ON sch.id = fa.scholarship_id
             WHERE fa.student_id = ?`
          )
          .all(id)
      : [];

    const achievements = db.prepare('SELECT * FROM achievements WHERE student_id = ? ORDER BY achievement_date DESC').all(id);
    const certificates = db.prepare('SELECT * FROM certificates WHERE student_id = ? ORDER BY issue_date DESC').all(id);
    const participation = db
      .prepare(
        `SELECT ep.*, e.title as event_title, e.category, e.event_date
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id
         WHERE ep.student_id = ?`
      )
      .all(id);

    res.json({
      student: user.role === 'TEACHER' ? { ...student, cnic: undefined } : student,
      attendanceHistory,
      results,
      scholarships,
      achievements,
      certificates,
      participation,
    });
  });

  router.post('/students', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.registration_number || !b.full_name || !b.department_id || !b.guardian_name) {
      res.status(400).json({ error: 'Registration number, full name, department, and guardian name are required.' });
      return;
    }

    const deptExists = db.prepare('SELECT id FROM departments WHERE id = ?').get(Number(b.department_id));
    if (!deptExists) {
      res.status(400).json({ error: 'Selected department does not exist.' });
      return;
    }

    const cgpaVal = b.cgpa !== '' && b.cgpa != null ? Number(b.cgpa) : null;
    if (cgpaVal !== null && (Number.isNaN(cgpaVal) || cgpaVal < 0 || cgpaVal > 4)) {
      res.status(400).json({ error: 'CGPA must be a valid number between 0.00 and 4.00.' });
      return;
    }

    const semVal = Number(b.current_semester) || 1;
    if (semVal < 1 || semVal > 12) {
      res.status(400).json({ error: 'Current semester must be between 1 and 12.' });
      return;
    }

    const dup = db
      .prepare('SELECT id FROM students WHERE UPPER(registration_number) = UPPER(?)')
      .get(String(b.registration_number).trim());
    if (dup) {
      res.status(409).json({ error: `Registration number ${b.registration_number} already exists.` });
      return;
    }

    const nextSeq = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nxt FROM students').get() as { nxt: number }).nxt;
    const studentUid = b.student_uid || `STU-${String(nextSeq).padStart(4, '0')}`;
    const admissionYear = Number(b.admission_year) || new Date().getFullYear();

    const info = db
      .prepare(
        `INSERT INTO students (
          student_uid, registration_number, full_name, email, phone, photo_url,
          department_id, program_id, current_semester, admission_year, batch_label,
          cgpa, academic_status, guardian_name, guardian_phone, guardian_relation,
          address, cnic, date_of_birth, is_demo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .run(
        studentUid,
        String(b.registration_number).trim(),
        String(b.full_name).trim(),
        b.email ? String(b.email).trim() : null,
        b.phone ? String(b.phone).trim() : null,
        b.photo_url || null,
        Number(b.department_id),
        b.program_id ? Number(b.program_id) : null,
        semVal,
        admissionYear,
        b.batch_label || `Batch ${admissionYear}`,
        cgpaVal,
        b.academic_status || 'Active',
        String(b.guardian_name).trim(),
        b.guardian_phone ? String(b.guardian_phone).trim() : null,
        b.guardian_relation || 'Father',
        b.address ? String(b.address).trim() : null,
        b.cnic ? String(b.cnic).trim() : null,
        b.date_of_birth || null
      );

    const id = Number(info.lastInsertRowid);
    logAudit(req.user, 'CREATE_STUDENT', 'students', id, `${b.full_name} (${b.registration_number})`);
    res.status(201).json({ id, student_uid: studentUid });
  });

  router.put('/students/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    const existing = db.prepare('SELECT id FROM students WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    if (!b.registration_number || !b.full_name || !b.department_id || !b.guardian_name) {
      res.status(400).json({ error: 'Registration number, full name, department, and guardian name are required.' });
      return;
    }

    const dup = db
      .prepare('SELECT id FROM students WHERE UPPER(registration_number) = UPPER(?) AND id != ?')
      .get(String(b.registration_number).trim(), id);
    if (dup) {
      res.status(409).json({ error: `Registration number ${b.registration_number} is already assigned to another student.` });
      return;
    }

    const cgpaVal = b.cgpa !== '' && b.cgpa != null ? Number(b.cgpa) : null;
    if (cgpaVal !== null && (Number.isNaN(cgpaVal) || cgpaVal < 0 || cgpaVal > 4)) {
      res.status(400).json({ error: 'CGPA must be between 0.00 and 4.00.' });
      return;
    }

    const semVal = Number(b.current_semester) || 1;
    if (semVal < 1 || semVal > 12) {
      res.status(400).json({ error: 'Current semester must be between 1 and 12.' });
      return;
    }

    db.prepare(
      `UPDATE students SET
        registration_number = ?, full_name = ?, email = ?, phone = ?, photo_url = COALESCE(?, photo_url),
        department_id = ?, program_id = ?, current_semester = ?, admission_year = ?, batch_label = ?,
        cgpa = ?, academic_status = ?, guardian_name = ?, guardian_phone = ?, guardian_relation = ?,
        address = ?, cnic = ?, date_of_birth = ?
       WHERE id = ?`
    ).run(
      String(b.registration_number).trim(),
      String(b.full_name).trim(),
      b.email ? String(b.email).trim() : null,
      b.phone ? String(b.phone).trim() : null,
      b.photo_url || null,
      Number(b.department_id),
      b.program_id ? Number(b.program_id) : null,
      semVal,
      Number(b.admission_year) || 2026,
      b.batch_label || `Batch ${b.admission_year || 2026}`,
      cgpaVal,
      b.academic_status || 'Active',
      String(b.guardian_name).trim(),
      b.guardian_phone ? String(b.guardian_phone).trim() : null,
      b.guardian_relation || 'Father',
      b.address ? String(b.address).trim() : null,
      b.cnic ? String(b.cnic).trim() : null,
      b.date_of_birth || null,
      id
    );

    logAudit(req.user, 'UPDATE_STUDENT', 'students', id, `${b.full_name}`);
    res.json({ ok: true });
  });

  router.delete('/students/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT full_name, registration_number FROM students WHERE id = ?').get(id) as { full_name: string; registration_number: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
    logAudit(req.user, 'DELETE_STUDENT', 'students', id, `${row.full_name} (${row.registration_number})`);
    res.json({ ok: true });
  });

  // ======================== DATA IMPORT CENTER ========================
  router.post('/import/students', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const { fileName, rows } = req.body ?? {};
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'No rows supplied for import.' });
      return;
    }

    const depts = db.prepare('SELECT id, code, name FROM departments').all() as Array<{ id: number; code: string; name: string }>;
    const progs = db.prepare('SELECT id, code, name FROM programs').all() as Array<{ id: number; code: string; name: string }>;

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ row: number; registration_number?: string; reason: string }> = [];

    const insertStmt = db.prepare(`
      INSERT INTO students (
        student_uid, registration_number, full_name, email, phone,
        department_id, program_id, current_semester, admission_year, batch_label,
        cgpa, academic_status, guardian_name, guardian_phone, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    let nextSeq = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 as nxt FROM students').get() as { nxt: number }).nxt;

    rows.forEach((raw: Record<string, unknown>, idx: number) => {
      const regNo = String(raw.registration_number || '').trim();
      const fullName = String(raw.full_name || '').trim();
      const deptVal = String(raw.department || '').trim();
      const guardianName = String(raw.guardian_name || 'Guardian').trim();

      if (!regNo || !fullName) {
        skipped++;
        errors.push({ row: idx + 1, registration_number: regNo || '(missing)', reason: 'Missing required registration_number or full_name.' });
        return;
      }

      const dup = db.prepare('SELECT id FROM students WHERE UPPER(registration_number) = UPPER(?)').get(regNo);
      if (dup) {
        skipped++;
        errors.push({ row: idx + 1, registration_number: regNo, reason: 'Duplicate registration number already exists in database.' });
        return;
      }

      const matchedDept = depts.find(
        (d) =>
          d.code.toLowerCase() === deptVal.toLowerCase() ||
          d.name.toLowerCase() === deptVal.toLowerCase() ||
          d.name.toLowerCase().includes(deptVal.toLowerCase())
      );

      if (!matchedDept) {
        skipped++;
        errors.push({ row: idx + 1, registration_number: regNo, reason: `Unknown department "${deptVal}".` });
        return;
      }

      const progVal = String(raw.program || '').trim();
      const matchedProg = progs.find(
        (p) => p.code.toLowerCase() === progVal.toLowerCase() || p.name.toLowerCase() === progVal.toLowerCase()
      );

      const admYear = Number(raw.admission_year) || 2026;
      const sem = Number(raw.current_semester) || 1;
      const cgpa = raw.cgpa !== '' && raw.cgpa != null && !Number.isNaN(Number(raw.cgpa)) ? Number(raw.cgpa) : null;
      if (cgpa !== null && (cgpa < 0 || cgpa > 4)) {
        skipped++;
        errors.push({ row: idx + 1, registration_number: regNo, reason: `Invalid CGPA "${raw.cgpa}" (must be 0.00 - 4.00).` });
        return;
      }

      try {
        const uid = `STU-${String(nextSeq++).padStart(4, '0')}`;
        insertStmt.run(
          uid,
          regNo,
          fullName,
          raw.email ? String(raw.email).trim() : null,
          raw.phone ? String(raw.phone).trim() : null,
          matchedDept.id,
          matchedProg?.id ?? null,
          sem,
          admYear,
          `Batch ${admYear}`,
          cgpa,
          raw.academic_status ? String(raw.academic_status).trim() : 'Active',
          guardianName,
          raw.guardian_phone ? String(raw.guardian_phone).trim() : null
        );
        imported++;
      } catch (e: unknown) {
        skipped++;
        errors.push({ row: idx + 1, registration_number: regNo, reason: e instanceof Error ? e.message : 'Insert error' });
      }
    });

    const status = errors.length === 0 ? 'Completed' : imported > 0 ? 'Partial' : 'Failed';
    db.prepare(
      `INSERT INTO import_history (entity_type, file_name, total_rows, imported_rows, skipped_rows, error_count, status, imported_by, details_json)
       VALUES ('students', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(fileName || 'upload.csv', rows.length, imported, skipped, errors.length, status, req.user!.id, JSON.stringify(errors.slice(0, 50)));

    logAudit(req.user, 'BULK_IMPORT_STUDENTS', 'students', null, `Imported ${imported}/${rows.length} from ${fileName}`);
    res.json({ totalRows: rows.length, importedRows: imported, skippedRows: skipped, errors, status });
  });

  router.post('/import/faculty', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const { fileName, rows } = req.body ?? {};
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'No rows supplied for faculty import.' });
      return;
    }

    const depts = db.prepare('SELECT id, code, name FROM departments').all() as Array<{ id: number; code: string; name: string }>;
    let imported = 0;
    let skipped = 0;
    const errors: Array<{ row: number; employee_id?: string; reason: string }> = [];

    const insertStmt = db.prepare(`
      INSERT INTO faculty (
        employee_id, full_name, email, phone, department_id, designation, qualification,
        specialization, subjects_taught, experience_years, joining_date, responsibilities, status, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    rows.forEach((raw: Record<string, unknown>, idx: number) => {
      const empId = String(raw.employee_id || '').trim();
      const fullName = String(raw.full_name || '').trim();
      const email = String(raw.email || '').trim();
      const deptVal = String(raw.department || '').trim();
      const designation = String(raw.designation || 'Lecturer').trim();
      const qualification = String(raw.qualification || '').trim();

      if (!empId || !fullName || !email || !qualification) {
        skipped++;
        errors.push({
          row: idx + 1,
          employee_id: empId || '(missing)',
          reason: 'Missing required employee_id, full_name, email, or qualification.',
        });
        return;
      }

      const dupEmp = db
        .prepare('SELECT id FROM faculty WHERE UPPER(employee_id) = UPPER(?) OR LOWER(email) = LOWER(?)')
        .get(empId, email);
      if (dupEmp) {
        skipped++;
        errors.push({
          row: idx + 1,
          employee_id: empId,
          reason: 'Duplicate employee ID or email already exists in faculty registry.',
        });
        return;
      }

      const matchedDept = depts.find(
        (d) =>
          d.code.toLowerCase() === deptVal.toLowerCase() ||
          d.name.toLowerCase() === deptVal.toLowerCase() ||
          d.name.toLowerCase().includes(deptVal.toLowerCase())
      );

      if (!matchedDept) {
        skipped++;
        errors.push({ row: idx + 1, employee_id: empId, reason: `Unknown department "${deptVal}".` });
        return;
      }

      const expYears = Math.max(0, Number(raw.experience_years) || 0);
      const joiningDate = raw.joining_date ? String(raw.joining_date).trim() : new Date().toISOString().slice(0, 10);

      try {
        insertStmt.run(
          empId,
          fullName,
          email,
          raw.phone ? String(raw.phone).trim() : null,
          matchedDept.id,
          designation,
          qualification,
          raw.specialization ? String(raw.specialization).trim() : null,
          raw.subjects_taught ? String(raw.subjects_taught).trim() : null,
          expYears,
          joiningDate,
          raw.responsibilities ? String(raw.responsibilities).trim() : null,
          raw.status ? String(raw.status).trim() : 'Active'
        );
        imported++;
      } catch (e: unknown) {
        skipped++;
        errors.push({ row: idx + 1, employee_id: empId, reason: e instanceof Error ? e.message : 'Insert error' });
      }
    });

    const status = errors.length === 0 ? 'Completed' : imported > 0 ? 'Partial' : 'Failed';
    db.prepare(
      `INSERT INTO import_history (entity_type, file_name, total_rows, imported_rows, skipped_rows, error_count, status, imported_by, details_json)
       VALUES ('faculty', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(fileName || 'faculty_upload.csv', rows.length, imported, skipped, errors.length, status, req.user!.id, JSON.stringify(errors.slice(0, 50)));

    logAudit(req.user, 'BULK_IMPORT_FACULTY', 'faculty', null, `Imported ${imported}/${rows.length} from ${fileName}`);
    res.json({ totalRows: rows.length, importedRows: imported, skippedRows: skipped, errors, status });
  });

  router.get('/import/history', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (_req, res) => {
    const history = db
      .prepare(
        `SELECT ih.*, u.full_name as imported_by_name
         FROM import_history ih
         LEFT JOIN users u ON u.id = ih.imported_by
         ORDER BY ih.created_at DESC LIMIT 30`
      )
      .all();
    res.json({ history });
  });

  // ======================== FACULTY ========================
  router.get('/faculty', requireAuth, (req, res) => {
    const { search, departmentId, status, origin } = req.query;
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (search) {
      const p = `%${String(search).trim()}%`;
      conditions.push('(f.full_name LIKE ? OR f.employee_id LIKE ? OR COALESCE(f.specialization, \'\') LIKE ? OR COALESCE(f.subjects_taught, \'\') LIKE ?)');
      params.push(p, p, p, p);
    }
    if (departmentId && departmentId !== 'all') {
      conditions.push('f.department_id = ?');
      params.push(Number(departmentId));
    }
    if (status && status !== 'all') {
      conditions.push('f.status = ?');
      params.push(String(status));
    }
    if (origin === 'real') {
      conditions.push('f.is_demo = 0');
    } else if (origin === 'demo') {
      conditions.push('f.is_demo = 1');
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT f.*, d.code as department_code, d.name as department_name
         FROM faculty f
         JOIN departments d ON d.id = f.department_id
         ${where}
         ORDER BY f.employee_id ASC`
      )
      .all(...params);
    res.json({ faculty: rows });
  });

  router.post('/faculty', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.employee_id || !b.full_name || !b.email || !b.department_id || !b.designation || !b.qualification) {
      res.status(400).json({ error: 'Employee ID, full name, email, department, designation, and qualification are required.' });
      return;
    }
    const deptExists = db.prepare('SELECT id FROM departments WHERE id = ?').get(Number(b.department_id));
    if (!deptExists) {
      res.status(400).json({ error: 'Selected department does not exist.' });
      return;
    }
    const dupEmp = db
      .prepare('SELECT id, employee_id, email FROM faculty WHERE UPPER(employee_id) = UPPER(?) OR LOWER(email) = LOWER(?)')
      .get(String(b.employee_id).trim(), String(b.email).trim()) as { employee_id: string; email: string } | undefined;
    if (dupEmp) {
      const conflictField =
        dupEmp.employee_id.toUpperCase() === String(b.employee_id).trim().toUpperCase()
          ? `Employee ID ${b.employee_id}`
          : `Email ${b.email}`;
      res.status(409).json({ error: `${conflictField} already exists in the faculty registry.` });
      return;
    }
    const expYears = Math.max(0, Number(b.experience_years) || 0);
    const info = db
      .prepare(
        `INSERT INTO faculty (employee_id, full_name, email, phone, photo_url, department_id, designation, qualification, specialization, subjects_taught, experience_years, joining_date, responsibilities, status, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .run(
        String(b.employee_id).trim(),
        String(b.full_name).trim(),
        String(b.email).trim(),
        b.phone ? String(b.phone).trim() : null,
        b.photo_url || null,
        Number(b.department_id),
        String(b.designation).trim(),
        String(b.qualification).trim(),
        b.specialization ? String(b.specialization).trim() : null,
        b.subjects_taught ? String(b.subjects_taught).trim() : null,
        expYears,
        b.joining_date || new Date().toISOString().slice(0, 10),
        b.responsibilities ? String(b.responsibilities).trim() : null,
        b.status || 'Active'
      );
    logAudit(req.user, 'CREATE_FACULTY', 'faculty', Number(info.lastInsertRowid), `${b.full_name}`);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.put('/faculty/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    const existing = db.prepare('SELECT id FROM faculty WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Faculty member not found.' });
      return;
    }
    if (!b.employee_id || !b.full_name || !b.email || !b.department_id || !b.designation || !b.qualification) {
      res.status(400).json({ error: 'Employee ID, full name, email, department, designation, and qualification are required.' });
      return;
    }
    const dup = db
      .prepare('SELECT id FROM faculty WHERE (UPPER(employee_id) = UPPER(?) OR LOWER(email) = LOWER(?)) AND id != ?')
      .get(String(b.employee_id).trim(), String(b.email).trim(), id);
    if (dup) {
      res.status(409).json({ error: 'Another faculty member already uses this Employee ID or email.' });
      return;
    }
    db.prepare(
      `UPDATE faculty SET employee_id=?, full_name=?, email=?, phone=?, photo_url=COALESCE(?, photo_url),
        department_id=?, designation=?, qualification=?, specialization=?, subjects_taught=?,
        experience_years=?, joining_date=?, responsibilities=?, status=?
       WHERE id=?`
    ).run(
      String(b.employee_id).trim(),
      String(b.full_name).trim(),
      String(b.email).trim(),
      b.phone ? String(b.phone).trim() : null,
      b.photo_url || null,
      Number(b.department_id),
      String(b.designation).trim(),
      String(b.qualification).trim(),
      b.specialization ? String(b.specialization).trim() : null,
      b.subjects_taught ? String(b.subjects_taught).trim() : null,
      Math.max(0, Number(b.experience_years) || 0),
      b.joining_date || new Date().toISOString().slice(0, 10),
      b.responsibilities ? String(b.responsibilities).trim() : null,
      b.status || 'Active',
      id
    );
    logAudit(req.user, 'UPDATE_FACULTY', 'faculty', id, `${b.full_name}`);
    res.json({ ok: true });
  });

  router.delete('/faculty/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT full_name, employee_id FROM faculty WHERE id = ?').get(id) as { full_name: string; employee_id: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Faculty member not found.' });
      return;
    }
    db.prepare('DELETE FROM faculty WHERE id = ?').run(id);
    logAudit(req.user, 'DELETE_FACULTY', 'faculty', id, `${existing.full_name} (${existing.employee_id})`);
    res.json({ ok: true });
  });

  // ======================== DEPARTMENTS ========================
  router.get('/departments', requireAuth, (_req, res) => {
    const departments = db
      .prepare(
        `SELECT d.*,
                (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id) as student_count,
                (SELECT COUNT(*) FROM faculty f WHERE f.department_id = d.id) as faculty_count,
                (SELECT COUNT(*) FROM programs p WHERE p.department_id = d.id) as program_count,
                (SELECT COUNT(*) FROM courses c WHERE c.department_id = d.id) as course_count,
                (SELECT ROUND(AVG(s.cgpa), 2) FROM students s WHERE s.department_id = d.id AND s.cgpa IS NOT NULL) as avg_cgpa
         FROM departments d
         ORDER BY d.code ASC`
      )
      .all();
    res.json({ departments });
  });

  router.post('/departments', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const { code, name, head_name, description, established_year, building_location } = req.body ?? {};
    if (!code || !name) {
      res.status(400).json({ error: 'Department code and name are required.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO departments (code, name, head_name, description, established_year, building_location)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(String(code).trim(), String(name).trim(), head_name || null, description || null, established_year ? Number(established_year) : 2026, building_location || null);
    logAudit(req.user, 'CREATE_DEPARTMENT', 'departments', Number(info.lastInsertRowid), name);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.put('/departments/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { code, name, head_name, description, established_year, building_location } = req.body ?? {};
    db.prepare(
      `UPDATE departments SET code=?, name=?, head_name=?, description=?, established_year=?, building_location=? WHERE id=?`
    ).run(code, name, head_name || null, description || null, established_year ? Number(established_year) : null, building_location || null, id);
    logAudit(req.user, 'UPDATE_DEPARTMENT', 'departments', id, name);
    res.json({ ok: true });
  });

  router.delete('/departments/:id', requireAuth, requireRole('SUPER_ADMIN'), (req: AuthedRequest, res) => {
    try {
      db.prepare('DELETE FROM departments WHERE id = ?').run(Number(req.params.id));
      logAudit(req.user, 'DELETE_DEPARTMENT', 'departments', req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(409).json({ error: 'Cannot delete department with active students or faculty assigned.' });
    }
  });

  // ======================== ACADEMICS ========================
  router.get('/academics', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const programs = db
      .prepare(
        `SELECT p.*, d.code as department_code, d.name as department_name
         FROM programs p JOIN departments d ON d.id = p.department_id`
      )
      .all();
    const semesters = db.prepare('SELECT * FROM semesters ORDER BY start_date DESC').all();
    const courses = db
      .prepare(
        `SELECT c.*, d.code as department_code, d.name as department_name,
                p.code as program_code, f.full_name as instructor_name
         FROM courses c
         JOIN departments d ON d.id = c.department_id
         LEFT JOIN programs p ON p.id = c.program_id
         LEFT JOIN faculty f ON f.id = c.instructor_id
         ORDER BY c.code ASC`
      )
      .all();
    const examinations = db
      .prepare(
        `SELECT ex.*, sem.name as semester_name, d.code as department_code
         FROM examinations ex
         LEFT JOIN semesters sem ON sem.id = ex.semester_id
         LEFT JOIN departments d ON d.id = ex.department_id
         ORDER BY ex.exam_date DESC`
      )
      .all();

    const resultsSql =
      user.role === 'STUDENT' && user.linked_student_id
        ? `SELECT r.*, s.registration_number, s.full_name as student_name, c.code as course_code, c.title as course_title,
                  sem.name as semester_name, d.code as department_code
           FROM results r
           JOIN students s ON s.id = r.student_id
           JOIN courses c ON c.id = r.course_id
           JOIN semesters sem ON sem.id = r.semester_id
           JOIN departments d ON d.id = s.department_id
           WHERE r.student_id = ?
           ORDER BY sem.start_date DESC`
        : `SELECT r.*, s.registration_number, s.full_name as student_name, c.code as course_code, c.title as course_title,
                  sem.name as semester_name, d.code as department_code
           FROM results r
           JOIN students s ON s.id = r.student_id
           JOIN courses c ON c.id = r.course_id
           JOIN semesters sem ON sem.id = r.semester_id
           JOIN departments d ON d.id = s.department_id
           ORDER BY sem.start_date DESC, s.registration_number ASC`;

    const results =
      user.role === 'STUDENT'
        ? user.linked_student_id
          ? db.prepare(resultsSql).all(user.linked_student_id)
          : []
        : db.prepare(resultsSql).all();

    const calendar = db
      .prepare(
        `SELECT ac.*, sem.name as semester_name
         FROM academic_calendar ac
         LEFT JOIN semesters sem ON sem.id = ac.semester_id
         ORDER BY ac.start_date ASC`
      )
      .all();

    res.json({ programs, semesters, courses, examinations, results, calendar });
  });

  router.post('/academics/courses', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.code || !b.title || !b.department_id) {
      res.status(400).json({ error: 'Course code, title, and department are required.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO courses (code, title, department_id, program_id, semester_number, credit_hours, instructor_id, schedule_slot, room_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(b.code).trim(),
        String(b.title).trim(),
        Number(b.department_id),
        b.program_id ? Number(b.program_id) : null,
        Number(b.semester_number) || 1,
        Number(b.credit_hours) || 3,
        b.instructor_id ? Number(b.instructor_id) : null,
        b.schedule_slot || null,
        b.room_number || null
      );
    logAudit(req.user, 'CREATE_COURSE', 'courses', Number(info.lastInsertRowid), b.code);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.post('/academics/results', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TEACHER'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.student_id || !b.course_id || !b.semester_id || b.marks_obtained == null) {
      res.status(400).json({ error: 'Student, course, semester, and marks obtained are required.' });
      return;
    }
    const marks = Number(b.marks_obtained);
    const total = Number(b.total_marks) || 100;
    const { grade, gpa, status } = gradeFromMarks(marks, total);

    db.prepare(
      `INSERT INTO results (student_id, course_id, semester_id, examination_id, marks_obtained, total_marks, grade, gpa_points, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(student_id, course_id, semester_id)
       DO UPDATE SET marks_obtained = excluded.marks_obtained, total_marks = excluded.total_marks,
                     grade = excluded.grade, gpa_points = excluded.gpa_points, status = excluded.status`
    ).run(Number(b.student_id), Number(b.course_id), Number(b.semester_id), b.examination_id ? Number(b.examination_id) : null, marks, total, grade, gpa, status);

    // Recalculate student's cumulative GPA from actual results
    const avgRow = db
      .prepare('SELECT ROUND(AVG(gpa_points), 2) as new_cgpa FROM results WHERE student_id = ?')
      .get(Number(b.student_id)) as { new_cgpa: number | null };
    if (avgRow?.new_cgpa != null) {
      db.prepare('UPDATE students SET cgpa = ? WHERE id = ?').run(avgRow.new_cgpa, Number(b.student_id));
    }

    logAudit(req.user, 'UPSERT_RESULT', 'results', `${b.student_id}-${b.course_id}`, `Marks ${marks}/${total} (${grade})`);
    res.status(201).json({ grade, gpa, status, updatedCgpa: avgRow?.new_cgpa });
  });

  router.post('/academics/calendar', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.title || !b.start_date) {
      res.status(400).json({ error: 'Title and start date are required.' });
      return;
    }
    const info = db
      .prepare('INSERT INTO academic_calendar (title, event_type, start_date, end_date, semester_id, description) VALUES (?, ?, ?, ?, ?, ?)')
      .run(b.title, b.event_type || 'Academic Milestone', b.start_date, b.end_date || b.start_date, b.semester_id ? Number(b.semester_id) : null, b.description || null);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  // ======================== ATTENDANCE INTELLIGENCE ========================
  router.get('/attendance', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { departmentId, courseId, date } = req.query;

    const studentFilter = user.role === 'STUDENT' && user.linked_student_id ? 'AND a.student_id = ?' : '';
    const baseParams: (string | number)[] = [];
    if (user.role === 'STUDENT' && user.linked_student_id) baseParams.push(user.linked_student_id);

    const extraConds: string[] = [];
    if (departmentId && departmentId !== 'all') {
      extraConds.push('a.department_id = ?');
      baseParams.push(Number(departmentId));
    }
    if (courseId && courseId !== 'all') {
      extraConds.push('a.course_id = ?');
      baseParams.push(Number(courseId));
    }
    if (date) {
      extraConds.push('a.attendance_date = ?');
      baseParams.push(String(date));
    }

    const extraWhere = extraConds.length > 0 ? `AND ${extraConds.join(' AND ')}` : '';

    const records = db
      .prepare(
        `SELECT a.*, s.registration_number, s.full_name as student_name, d.code as department_code, c.code as course_code, c.title as course_title
         FROM attendance a
         JOIN students s ON s.id = a.student_id
         JOIN departments d ON d.id = a.department_id
         JOIN courses c ON c.id = a.course_id
         WHERE 1=1 ${studentFilter} ${extraWhere}
         ORDER BY a.attendance_date DESC, s.registration_number ASC
         LIMIT 250`
      )
      .all(...baseParams);

    const studentSummary =
      user.role === 'STUDENT' && !user.linked_student_id
        ? []
        : db
            .prepare(
              `SELECT s.id as student_id, s.registration_number, s.full_name, d.code as department_code, d.name as department_name,
                      COUNT(a.id) as total_sessions,
                      SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) as attended_sessions,
                      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent_sessions,
                      ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 1) as attendance_pct
               FROM students s
               JOIN departments d ON d.id = s.department_id
               LEFT JOIN attendance a ON a.student_id = s.id
               ${user.role === 'STUDENT' ? 'WHERE s.id = ?' : departmentId && departmentId !== 'all' ? 'WHERE s.department_id = ?' : ''}
               GROUP BY s.id
               ORDER BY attendance_pct ASC`
            )
            .all(...(user.role === 'STUDENT' ? [user.linked_student_id!] : departmentId && departmentId !== 'all' ? [Number(departmentId)] : []));

    const byDepartment = db
      .prepare(
        `SELECT d.code, d.name,
                COUNT(a.id) as total_marks,
                ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.id), 0), 1) as attendance_pct
         FROM departments d
         LEFT JOIN attendance a ON a.department_id = d.id
         GROUP BY d.id`
      )
      .all();

    const monthlyTrend = db
      .prepare(
        `SELECT substr(attendance_date, 1, 7) as month,
                COUNT(*) as total_marks,
                ROUND(100.0 * SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as attendance_pct
         FROM attendance
         GROUP BY substr(attendance_date, 1, 7)
         ORDER BY month ASC`
      )
      .all();

    res.json({ records, studentSummary, byDepartment, monthlyTrend });
  });

  router.post('/attendance/bulk', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TEACHER'), (req: AuthedRequest, res) => {
    const { course_id, attendance_date, entries } = req.body ?? {};
    if (!course_id || !attendance_date || !Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: 'Course, attendance date, and student entries are required.' });
      return;
    }

    const course = db.prepare('SELECT id, department_id FROM courses WHERE id = ?').get(Number(course_id)) as { id: number; department_id: number } | undefined;
    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    const currentSem = db.prepare('SELECT id FROM semesters WHERE is_current = 1 LIMIT 1').get() as { id: number } | undefined;

    const stmt = db.prepare(`
      INSERT INTO attendance (student_id, course_id, department_id, semester_id, attendance_date, status, marked_by_user_id, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(student_id, course_id, attendance_date)
      DO UPDATE SET status = excluded.status, marked_by_user_id = excluded.marked_by_user_id, remarks = excluded.remarks
    `);

    db.exec('BEGIN TRANSACTION');
    try {
      for (const entry of entries as Array<{ student_id: number; status: string; remarks?: string }>) {
        stmt.run(
          Number(entry.student_id),
          course.id,
          course.department_id,
          currentSem?.id ?? null,
          String(attendance_date),
          entry.status || 'Present',
          req.user!.id,
          entry.remarks || null
        );
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    logAudit(req.user, 'MARK_ATTENDANCE', 'attendance', `${course_id}:${attendance_date}`, `Marked ${entries.length} students`);
    res.status(201).json({ ok: true, count: entries.length });
  });

  // ======================== SCHOLARSHIPS & FINANCE ========================
  router.get('/scholarships', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const programs = db.prepare('SELECT * FROM scholarships ORDER BY id ASC').all();

    let assistance: unknown[] = [];
    let restricted = false;

    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      assistance = db
        .prepare(
          `SELECT fa.*, s.registration_number, s.full_name as student_name, d.code as department_code,
                  sch.title as scholarship_title, sch.code as scholarship_code
           FROM financial_assistance fa
           JOIN students s ON s.id = fa.student_id
           JOIN departments d ON d.id = s.department_id
           LEFT JOIN scholarships sch ON sch.id = fa.scholarship_id
           ORDER BY fa.created_at DESC`
        )
        .all();
    } else if (user.role === 'STUDENT' && user.linked_student_id) {
      assistance = db
        .prepare(
          `SELECT fa.*, s.registration_number, s.full_name as student_name, d.code as department_code,
                  sch.title as scholarship_title, sch.code as scholarship_code
           FROM financial_assistance fa
           JOIN students s ON s.id = fa.student_id
           JOIN departments d ON d.id = s.department_id
           LEFT JOIN scholarships sch ON sch.id = fa.scholarship_id
           WHERE fa.student_id = ?
           ORDER BY fa.created_at DESC`
        )
        .all(user.linked_student_id);
      restricted = true;
    } else {
      restricted = true;
    }

    res.json({ programs, assistance, restricted });
  });

  router.post('/scholarships', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.code || !b.title || !b.provider) {
      res.status(400).json({ error: 'Scholarship code, title, and provider are required.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO scholarships (code, title, provider, category, coverage_type, annual_budget_pkr, eligibility_criteria, deadline, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(b.code).trim(),
        String(b.title).trim(),
        String(b.provider).trim(),
        b.category || 'Need-Based',
        b.coverage_type || '100% Tuition Waiver',
        Number(b.annual_budget_pkr) || 0,
        b.eligibility_criteria || 'Enrolled regular student',
        b.deadline || null,
        b.status || 'Open',
        b.description || null
      );
    logAudit(req.user, 'CREATE_SCHOLARSHIP', 'scholarships', Number(info.lastInsertRowid), b.title);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.post('/financial-assistance', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'STUDENT'), (req: AuthedRequest, res) => {
    const user = req.user!;
    const b = req.body ?? {};
    const targetStudentId = user.role === 'STUDENT' ? user.linked_student_id : Number(b.student_id);
    if (!targetStudentId || !b.assistance_type) {
      res.status(400).json({ error: 'Student and assistance type are required.' });
      return;
    }
    const initialStatus = user.role === 'STUDENT' ? 'Pending' : b.application_status || 'Pending';
    const info = db
      .prepare(
        `INSERT INTO financial_assistance (student_id, scholarship_id, academic_year, assistance_type, amount_pkr, fee_concession_pct, application_status, approved_by, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        targetStudentId,
        b.scholarship_id ? Number(b.scholarship_id) : null,
        b.academic_year || '2026-2027',
        String(b.assistance_type),
        Number(b.amount_pkr) || 0,
        Number(b.fee_concession_pct) || 0,
        initialStatus,
        initialStatus === 'Approved' || initialStatus === 'Disbursed' ? user.full_name : null,
        b.remarks || null
      );
    logAudit(req.user, 'CREATE_FINANCIAL_ASSISTANCE', 'financial_assistance', Number(info.lastInsertRowid));
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.put('/financial-assistance/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { application_status, amount_pkr, fee_concession_pct, remarks } = req.body ?? {};
    db.prepare(
      `UPDATE financial_assistance
       SET application_status = ?, amount_pkr = COALESCE(?, amount_pkr), fee_concession_pct = COALESCE(?, fee_concession_pct),
           remarks = COALESCE(?, remarks),
           approved_by = CASE WHEN ? IN ('Approved','Disbursed') THEN ? ELSE approved_by END,
           disbursement_date = CASE WHEN ? = 'Disbursed' THEN date('now') ELSE disbursement_date END
       WHERE id = ?`
    ).run(
      application_status,
      amount_pkr != null ? Number(amount_pkr) : null,
      fee_concession_pct != null ? Number(fee_concession_pct) : null,
      remarks ?? null,
      application_status,
      req.user!.full_name,
      application_status,
      id
    );
    logAudit(req.user, 'UPDATE_FINANCIAL_ASSISTANCE', 'financial_assistance', id, `Status -> ${application_status}`);
    res.json({ ok: true });
  });

  // ======================== EVENTS & ACTIVITIES ========================
  router.get('/events', requireAuth, (req, res) => {
    const { category, status } = req.query;
    const conds: string[] = [];
    const params: string[] = [];
    if (category && category !== 'all') {
      conds.push('e.category = ?');
      params.push(String(category));
    }
    if (status && status !== 'all') {
      conds.push('e.status = ?');
      params.push(String(status));
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const events = db
      .prepare(
        `SELECT e.*, d.code as department_code, d.name as department_name,
                (SELECT COUNT(*) FROM event_participants ep WHERE ep.event_id = e.id) as participant_count
         FROM events e
         LEFT JOIN departments d ON d.id = e.department_id
         ${where}
         ORDER BY e.event_date DESC`
      )
      .all(...params);
    const participants = db.prepare('SELECT * FROM event_participants ORDER BY id DESC').all();
    res.json({ events, participants });
  });

  router.post('/events', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TEACHER'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.title || !b.category || !b.event_date || !b.venue || !b.organizer) {
      res.status(400).json({ error: 'Title, category, date, venue, and organizer are required.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO events (title, category, event_date, venue, organizer, department_id, guest_speakers, description, outcomes, cover_image_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        b.title,
        b.category,
        b.event_date,
        b.venue,
        b.organizer,
        b.department_id ? Number(b.department_id) : null,
        b.guest_speakers || null,
        b.description || null,
        b.outcomes || null,
        b.cover_image_url || null,
        b.status || 'Upcoming'
      );
    logAudit(req.user, 'CREATE_EVENT', 'events', Number(info.lastInsertRowid), b.title);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.put('/events/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TEACHER'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    db.prepare(
      `UPDATE events SET title=?, category=?, event_date=?, venue=?, organizer=?, department_id=?, guest_speakers=?, description=?, outcomes=?, cover_image_url=COALESCE(?, cover_image_url), status=?
       WHERE id=?`
    ).run(
      b.title,
      b.category,
      b.event_date,
      b.venue,
      b.organizer,
      b.department_id ? Number(b.department_id) : null,
      b.guest_speakers || null,
      b.description || null,
      b.outcomes || null,
      b.cover_image_url || null,
      b.status || 'Completed',
      id
    );
    logAudit(req.user, 'UPDATE_EVENT', 'events', id, b.title);
    res.json({ ok: true });
  });

  router.delete('/events/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM events WHERE id = ?').run(Number(req.params.id));
    logAudit(req.user, 'DELETE_EVENT', 'events', req.params.id);
    res.json({ ok: true });
  });

  router.post('/events/:id/participants', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TEACHER'), (req: AuthedRequest, res) => {
    const eventId = Number(req.params.id);
    const { student_id, participant_name, role, certificate_issued } = req.body ?? {};
    let name = participant_name ? String(participant_name).trim() : '';
    if (student_id && !name) {
      const stu = db.prepare('SELECT full_name FROM students WHERE id = ?').get(Number(student_id)) as { full_name: string } | undefined;
      name = stu?.full_name || '';
    }
    if (!name) {
      res.status(400).json({ error: 'Participant name or student is required.' });
      return;
    }
    db.prepare(
      `INSERT INTO event_participants (event_id, student_id, participant_name, role, certificate_issued)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(event_id, participant_name) DO UPDATE SET role=excluded.role, certificate_issued=excluded.certificate_issued`
    ).run(eventId, student_id ? Number(student_id) : null, name, role || 'Participant', certificate_issued ? 1 : 0);
    res.status(201).json({ ok: true });
  });

  // ======================== ACHIEVEMENTS & CERTIFICATES ========================
  router.get('/achievements', requireAuth, (req, res) => {
    const { category, level, search } = req.query;
    const conds: string[] = [];
    const params: string[] = [];
    if (category && category !== 'all') {
      conds.push('a.category = ?');
      params.push(String(category));
    }
    if (level && level !== 'all') {
      conds.push('a.level = ?');
      params.push(String(level));
    }
    if (search) {
      const p = `%${String(search).trim()}%`;
      conds.push('(a.title LIKE ? OR s.full_name LIKE ? OR s.registration_number LIKE ? OR a.issuing_organization LIKE ?)');
      params.push(p, p, p, p);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const achievements = db
      .prepare(
        `SELECT a.*, s.full_name as student_name, s.registration_number, d.code as department_code
         FROM achievements a
         JOIN students s ON s.id = a.student_id
         JOIN departments d ON d.id = s.department_id
         ${where}
         ORDER BY a.achievement_date DESC`
      )
      .all(...params);
    const certificates = db
      .prepare(
        `SELECT c.*, s.full_name as student_name, s.registration_number
         FROM certificates c
         JOIN students s ON s.id = c.student_id
         ORDER BY c.issue_date DESC`
      )
      .all();
    res.json({ achievements, certificates });
  });

  router.post('/achievements', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN', 'TEACHER'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.student_id || !b.title || !b.category || !b.achievement_date || !b.issuing_organization) {
      res.status(400).json({ error: 'Student, title, category, date, and issuing organization are required.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO achievements (student_id, title, category, level, achievement_date, issuing_organization, description, certificate_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(b.student_id),
        b.title,
        b.category,
        b.level || 'College',
        b.achievement_date,
        b.issuing_organization,
        b.description || null,
        b.certificate_url || null
      );
    logAudit(req.user, 'CREATE_ACHIEVEMENT', 'achievements', Number(info.lastInsertRowid), b.title);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.delete('/achievements/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM achievements WHERE id = ?').run(Number(req.params.id));
    logAudit(req.user, 'DELETE_ACHIEVEMENT', 'achievements', req.params.id);
    res.json({ ok: true });
  });

  // ======================== DIGITAL ARCHIVE ========================
  router.get('/archive', requireAuth, (req, res) => {
    const { category, folder, search } = req.query;
    const conds: string[] = [];
    const params: string[] = [];
    if (category && category !== 'all') {
      conds.push('a.category = ?');
      params.push(String(category));
    }
    if (folder && folder !== 'all') {
      conds.push('a.folder = ?');
      params.push(String(folder));
    }
    if (search) {
      const p = `%${String(search).trim()}%`;
      conds.push('(a.title LIKE ? OR a.description LIKE ? OR a.year_label LIKE ?)');
      params.push(p, p, p);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const documents = db
      .prepare(
        `SELECT a.*, u.full_name as uploaded_by_name
         FROM archive_documents a
         LEFT JOIN users u ON u.id = a.uploaded_by
         ${where}
         ORDER BY a.created_at DESC`
      )
      .all(...params);
    const folders = db.prepare('SELECT DISTINCT folder FROM archive_documents ORDER BY folder ASC').all();
    res.json({ documents, folders });
  });

  router.post('/archive', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.title || !b.category || !b.year_label) {
      res.status(400).json({ error: 'Title, category, and year label are required.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO archive_documents (title, folder, category, year_label, description, file_url, file_name, file_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        b.title,
        b.folder || 'General Archive',
        b.category,
        b.year_label,
        b.description || null,
        b.file_url || null,
        b.file_name || null,
        b.file_type || null,
        req.user!.id
      );
    logAudit(req.user, 'CREATE_ARCHIVE_DOC', 'archive_documents', Number(info.lastInsertRowid), b.title);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.delete('/archive/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM archive_documents WHERE id = ?').run(Number(req.params.id));
    logAudit(req.user, 'DELETE_ARCHIVE_DOC', 'archive_documents', req.params.id);
    res.json({ ok: true });
  });

  // ======================== COLLEGE RESOURCES & INVENTORY ========================
  router.get('/resources', requireAuth, (req, res) => {
    const { category, status } = req.query;
    const conds: string[] = [];
    const params: string[] = [];
    if (category && category !== 'all') {
      conds.push('r.category = ?');
      params.push(String(category));
    }
    if (status && status !== 'all') {
      conds.push('r.condition_status = ?');
      params.push(String(status));
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
    const resources = db
      .prepare(
        `SELECT r.*, d.code as department_code, d.name as department_name
         FROM resources r
         LEFT JOIN departments d ON d.id = r.department_id
         ${where}
         ORDER BY r.resource_code ASC`
      )
      .all(...params);
    const inventory = db
      .prepare(
        `SELECT i.*, r.name as resource_name
         FROM inventory i
         LEFT JOIN resources r ON r.id = i.resource_id
         ORDER BY i.item_sku ASC`
      )
      .all();
    res.json({ resources, inventory });
  });

  router.post('/resources', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    if (!b.resource_code || !b.name || !b.category || !b.location) {
      res.status(400).json({ error: 'Resource code, name, category, and location are required.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO resources (resource_code, name, category, location, department_id, quantity, available_quantity, condition_status, last_maintenance_date, next_maintenance_date, maintenance_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        b.resource_code,
        b.name,
        b.category,
        b.location,
        b.department_id ? Number(b.department_id) : null,
        Number(b.quantity) || 1,
        Number(b.available_quantity ?? b.quantity) || 1,
        b.condition_status || 'Operational',
        b.last_maintenance_date || null,
        b.next_maintenance_date || null,
        b.maintenance_notes || null
      );
    logAudit(req.user, 'CREATE_RESOURCE', 'resources', Number(info.lastInsertRowid), b.name);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.put('/resources/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    db.prepare(
      `UPDATE resources SET name=?, category=?, location=?, quantity=?, available_quantity=?, condition_status=?, last_maintenance_date=?, next_maintenance_date=?, maintenance_notes=?
       WHERE id=?`
    ).run(
      b.name,
      b.category,
      b.location,
      Number(b.quantity) || 1,
      Number(b.available_quantity) || 0,
      b.condition_status || 'Operational',
      b.last_maintenance_date || null,
      b.next_maintenance_date || null,
      b.maintenance_notes || null,
      id
    );
    logAudit(req.user, 'UPDATE_RESOURCE', 'resources', id, b.name);
    res.json({ ok: true });
  });

  router.delete('/resources/:id', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM resources WHERE id = ?').run(Number(req.params.id));
    logAudit(req.user, 'DELETE_RESOURCE', 'resources', req.params.id);
    res.json({ ok: true });
  });

  // ======================== AI CAMPUS INTELLIGENCE ========================
  router.post('/ai/query', requireAuth, async (req: AuthedRequest, res) => {
    const { question } = req.body ?? {};
    if (!question || !String(question).trim()) {
      res.status(400).json({ error: 'Please enter an institutional question.' });
      return;
    }

    try {
      const result = await runCampusIntelligenceQuery(String(question).trim(), req.user!);
      logAudit(req.user, 'AI_CAMPUS_QUERY', 'ai_intelligence', null, String(question).slice(0, 120));
      res.json(result);
    } catch (err: unknown) {
      console.error('AI query error:', err);
      const message = err instanceof Error ? err.message : 'AI Campus Intelligence request failed.';
      res.status(500).json({ error: message });
    }
  });

  // ======================== ADVANCED ANALYTICS ========================
  router.get('/analytics', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { year, departmentId } = req.query;

    const stuConds: string[] = [];
    const stuParams: number[] = [];
    if (year && year !== 'all') {
      stuConds.push('s.admission_year = ?');
      stuParams.push(Number(year));
    }
    if (departmentId && departmentId !== 'all') {
      stuConds.push('s.department_id = ?');
      stuParams.push(Number(departmentId));
    }
    const stuWhere = stuConds.length > 0 ? `WHERE ${stuConds.join(' AND ')}` : '';

    const enrollmentByYear = db
      .prepare(
        `SELECT admission_year as year, batch_label as batch, COUNT(*) as count, ROUND(AVG(cgpa), 2) as avgCgpa
         FROM students s ${stuWhere}
         GROUP BY admission_year, batch_label ORDER BY admission_year ASC`
      )
      .all(...stuParams);

    const departmentComparison = db
      .prepare(
        `SELECT d.code, d.name,
                COUNT(DISTINCT s.id) as students,
                ROUND(AVG(s.cgpa), 2) as avgCgpa,
                (SELECT COUNT(*) FROM faculty f WHERE f.department_id = d.id) as faculty,
                (SELECT ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)
                 FROM attendance a WHERE a.department_id = d.id) as attendancePct
         FROM departments d
         LEFT JOIN students s ON s.department_id = d.id ${year && year !== 'all' ? 'AND s.admission_year = ?' : ''}
         ${departmentId && departmentId !== 'all' ? 'WHERE d.id = ?' : ''}
         GROUP BY d.id
         ORDER BY students DESC`
      )
      .all(...(year && year !== 'all' ? [Number(year)] : []), ...(departmentId && departmentId !== 'all' ? [Number(departmentId)] : []));

    const cgpaDistribution = db
      .prepare(
        `SELECT
           CASE
             WHEN cgpa >= 3.7 THEN '3.70 - 4.00 (Distinction)'
             WHEN cgpa >= 3.3 THEN '3.30 - 3.69 (Merit)'
             WHEN cgpa >= 3.0 THEN '3.00 - 3.29 (Good)'
             ELSE 'Below 3.00 (Support)'
           END as band,
           COUNT(*) as count
         FROM students s
         ${stuWhere ? stuWhere + ' AND s.cgpa IS NOT NULL' : 'WHERE s.cgpa IS NOT NULL'}
         GROUP BY band`
      )
      .all(...stuParams);

    const attendanceByMonth = db
      .prepare(
        `SELECT substr(attendance_date, 1, 7) as month,
                COUNT(*) as records,
                ROUND(100.0 * SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as rate
         FROM attendance
         GROUP BY substr(attendance_date, 1, 7)
         ORDER BY month ASC`
      )
      .all();

    const scholarshipDistribution =
      user.role === 'SUPER_ADMIN' || user.role === 'ADMIN'
        ? db
            .prepare(
              `SELECT application_status as status, COUNT(*) as count, SUM(amount_pkr) as totalPkr
               FROM financial_assistance
               GROUP BY application_status`
            )
            .all()
        : [];

    const eventParticipation = db
      .prepare(
        `SELECT e.category, COUNT(DISTINCT e.id) as events, COUNT(ep.id) as participants
         FROM events e
         LEFT JOIN event_participants ep ON ep.event_id = e.id
         GROUP BY e.category`
      )
      .all();

    const achievementAnalysis = db
      .prepare(
        `SELECT category, COUNT(*) as count
         FROM achievements
         GROUP BY category
         ORDER BY count DESC`
      )
      .all();

    const facultyStats = db
      .prepare(
        `SELECT d.code as department, COUNT(f.id) as count, ROUND(AVG(f.experience_years), 1) as avgExperience
         FROM departments d
         LEFT JOIN faculty f ON f.department_id = d.id
         GROUP BY d.id`
      )
      .all();

    const resourceUtilization = db
      .prepare(
        `SELECT category, SUM(quantity) as total, SUM(available_quantity) as available
         FROM resources
         GROUP BY category`
      )
      .all();

    res.json({
      enrollmentByYear,
      departmentComparison,
      cgpaDistribution,
      attendanceByMonth,
      scholarshipDistribution,
      eventParticipation,
      achievementAnalysis,
      facultyStats,
      resourceUtilization,
    });
  });

  // ======================== ADMIN / SETTINGS / RBAC ========================
  router.get('/admin/users', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (_req, res) => {
    const users = db
      .prepare(
        `SELECT u.id, u.email, u.full_name, u.role, u.department_id, u.linked_student_id, u.linked_faculty_id, u.status, u.created_at,
                d.code as department_code
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         ORDER BY u.id ASC`
      )
      .all();
    res.json({ users });
  });

  router.post('/admin/users', requireAuth, requireRole('SUPER_ADMIN'), (req: AuthedRequest, res) => {
    const { email, password, full_name, role, department_id } = req.body ?? {};
    if (!email || !password || !full_name || !role) {
      res.status(400).json({ error: 'Email, password, full name, and role are required.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    const dup = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(String(email).trim());
    if (dup) {
      res.status(409).json({ error: `Account with email ${email} already exists.` });
      return;
    }
    const info = db
      .prepare('INSERT INTO users (email, password_hash, full_name, role, department_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(String(email).trim(), hashPassword(String(password)), String(full_name).trim(), role, department_id ? Number(department_id) : null, 'Active');
    logAudit(req.user, 'ADMIN_CREATE_USER', 'users', Number(info.lastInsertRowid), `${email} (${role})`);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.put('/admin/users/:id', requireAuth, requireRole('SUPER_ADMIN'), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const { role, status } = req.body ?? {};
    db.prepare('UPDATE users SET role = COALESCE(?, role), status = COALESCE(?, status) WHERE id = ?').run(role || null, status || null, id);
    logAudit(req.user, 'ADMIN_UPDATE_USER', 'users', id, `role=${role}, status=${status}`);
    res.json({ ok: true });
  });

  router.get('/admin/audit-logs', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (_req, res) => {
    const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 120').all();
    res.json({ logs });
  });

  router.get('/admin/backup', requireAuth, requireRole('SUPER_ADMIN'), (req: AuthedRequest, res) => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      institution: 'Akhuwat College for Women, Chakwal',
      departments: db.prepare('SELECT * FROM departments').all(),
      programs: db.prepare('SELECT * FROM programs').all(),
      semesters: db.prepare('SELECT * FROM semesters').all(),
      students: db.prepare('SELECT * FROM students').all(),
      faculty: db.prepare('SELECT * FROM faculty').all(),
      courses: db.prepare('SELECT * FROM courses').all(),
      attendance: db.prepare('SELECT * FROM attendance').all(),
      results: db.prepare('SELECT * FROM results').all(),
      scholarships: db.prepare('SELECT * FROM scholarships').all(),
      financial_assistance: db.prepare('SELECT * FROM financial_assistance').all(),
      events: db.prepare('SELECT * FROM events').all(),
      achievements: db.prepare('SELECT * FROM achievements').all(),
      archive_documents: db.prepare('SELECT * FROM archive_documents').all(),
      resources: db.prepare('SELECT * FROM resources').all(),
      announcements: db.prepare('SELECT * FROM announcements').all(),
    };
    logAudit(req.user, 'EXPORT_DB_BACKUP', 'system', null, 'Downloaded full JSON database backup');
    res.setHeader('Content-Disposition', `attachment; filename="akhuwat_campus_brain_backup_${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(snapshot);
  });

  return router;
}
