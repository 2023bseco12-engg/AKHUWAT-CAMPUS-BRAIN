import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';
import type { AuthUser } from './auth.ts';
import { db } from './db.ts';

export interface AiQueryResponse {
  answer: string;
  dataPeriod: string;
  sources: string[];
  chart?: {
    type: 'bar' | 'line' | 'pie';
    title: string;
    xKey: string;
    yKey: string;
    yLabel?: string;
    data: Array<Record<string, string | number>>;
  };
  table?: {
    title: string;
    columns: string[];
    rows: Array<Array<string | number | null>>;
  };
  toolsUsed: string[];
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server secrets. Please set GEMINI_API_KEY in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Execute role-scoped database analytical tools
function executeTool(name: string, args: Record<string, unknown>, user: AuthUser): unknown {
  const isStudent = user.role === 'STUDENT';
  const canSeeFinancial = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  switch (name) {
    case 'getInstitutionalSummary': {
      const totalStudents = (db.prepare("SELECT COUNT(*) as c FROM students WHERE academic_status = 'Active'").get() as { c: number }).c;
      const allStudents = (db.prepare('SELECT COUNT(*) as c FROM students').get() as { c: number }).c;
      const totalFaculty = (db.prepare("SELECT COUNT(*) as c FROM faculty WHERE status = 'Active'").get() as { c: number }).c;
      const totalDepartments = (db.prepare('SELECT COUNT(*) as c FROM departments').get() as { c: number }).c;
      const totalPrograms = (db.prepare("SELECT COUNT(*) as c FROM programs WHERE status = 'Active'").get() as { c: number }).c;
      const totalCourses = (db.prepare('SELECT COUNT(*) as c FROM courses').get() as { c: number }).c;
      const totalEvents = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
      const totalAchievements = (db.prepare('SELECT COUNT(*) as c FROM achievements').get() as { c: number }).c;
      const avgCgpaRow = db.prepare('SELECT ROUND(AVG(cgpa), 2) as avg_cgpa, COUNT(cgpa) as graded_count FROM students WHERE cgpa IS NOT NULL').get() as { avg_cgpa: number | null; graded_count: number };
      const attRow = db.prepare(`
        SELECT COUNT(*) as total_marks,
               SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) as present_marks
        FROM attendance
      `).get() as { total_marks: number; present_marks: number | null };

      const currentSem = db.prepare('SELECT code, name, academic_year FROM semesters WHERE is_current = 1 LIMIT 1').get() as { code: string; name: string; academic_year: string } | undefined;

      return {
        institution: 'Akhuwat College for Women, Chakwal',
        currentSemester: currentSem ?? null,
        activeEnrolledStudents: totalStudents,
        totalStudentRecords: allStudents,
        activeFaculty: totalFaculty,
        departments: totalDepartments,
        activePrograms: totalPrograms,
        coursesOffered: totalCourses,
        organizedEvents: totalEvents,
        studentAchievements: totalAchievements,
        institutionalAvgCgpa: avgCgpaRow.avg_cgpa,
        studentsWithCgpaCount: avgCgpaRow.graded_count,
        overallAttendancePct:
          attRow.total_marks > 0 && attRow.present_marks != null
            ? Number(((attRow.present_marks / attRow.total_marks) * 100).toFixed(1))
            : null,
        attendanceRecordsCount: attRow.total_marks,
        sourceTables: ['students', 'faculty', 'departments', 'programs', 'courses', 'events', 'achievements', 'attendance', 'semesters'],
      };
    }

    case 'getDepartmentComparison': {
      const rows = db.prepare(`
        SELECT
          d.code,
          d.name,
          d.head_name,
          COUNT(DISTINCT s.id) as student_count,
          ROUND(AVG(s.cgpa), 2) as avg_cgpa,
          (SELECT COUNT(*) FROM faculty f WHERE f.department_id = d.id AND f.status = 'Active') as faculty_count,
          (SELECT ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)
           FROM attendance a WHERE a.department_id = d.id) as attendance_pct
        FROM departments d
        LEFT JOIN students s ON s.department_id = d.id
        GROUP BY d.id
        ORDER BY student_count DESC
      `).all();
      return {
        departments: rows,
        sourceTables: ['departments', 'students', 'faculty', 'attendance'],
      };
    }

    case 'getTopStudentsByCgpa': {
      const limit = Math.min(20, Math.max(1, Number(args.limit) || 5));
      const deptCode = typeof args.departmentCode === 'string' ? args.departmentCode.trim() : '';

      if (isStudent) {
        if (!user.linked_student_id) {
          return { restricted: true, message: 'Student accounts may only view their own academic record.' };
        }
        const own = db.prepare(`
          SELECT s.registration_number, s.full_name, d.code as department_code, d.name as department_name,
                 s.current_semester, s.batch_label, s.cgpa, s.academic_status
          FROM students s
          JOIN departments d ON d.id = s.department_id
          WHERE s.id = ?
        `).get(user.linked_student_id);
        return {
          restrictedToOwnProfile: true,
          note: 'Privacy policy: Student role can only inspect own academic standing.',
          student: own ?? null,
          sourceTables: ['students', 'departments'],
        };
      }

      const sql = deptCode
        ? `SELECT s.registration_number, s.full_name, d.code as department_code, d.name as department_name,
                  s.current_semester, s.batch_label, s.cgpa
           FROM students s
           JOIN departments d ON d.id = s.department_id
           WHERE s.cgpa IS NOT NULL AND UPPER(d.code) = UPPER(?)
           ORDER BY s.cgpa DESC LIMIT ?`
        : `SELECT s.registration_number, s.full_name, d.code as department_code, d.name as department_name,
                  s.current_semester, s.batch_label, s.cgpa
           FROM students s
           JOIN departments d ON d.id = s.department_id
           WHERE s.cgpa IS NOT NULL
           ORDER BY s.cgpa DESC LIMIT ?`;

      const rows = deptCode ? db.prepare(sql).all(deptCode, limit) : db.prepare(sql).all(limit);
      return {
        topStudents: rows,
        sourceTables: ['students', 'departments'],
      };
    }

    case 'getAttendanceIntelligence': {
      const deptCode = typeof args.departmentCode === 'string' ? args.departmentCode.trim() : '';
      if (isStudent && user.linked_student_id) {
        const own = db.prepare(`
          SELECT c.code as course_code, c.title as course_title,
                 COUNT(*) as total_classes,
                 SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) as attended_classes,
                 ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) as attendance_pct
          FROM attendance a
          JOIN courses c ON c.id = a.course_id
          WHERE a.student_id = ?
          GROUP BY c.id
        `).all(user.linked_student_id);
        return { restrictedToOwnProfile: true, ownAttendance: own, sourceTables: ['attendance', 'courses'] };
      }

      const byDept = db.prepare(`
        SELECT d.code as department_code, d.name as department_name,
               COUNT(*) as total_records,
               SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) as present_count,
               SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent_count,
               ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as attendance_pct
        FROM departments d
        LEFT JOIN attendance a ON a.department_id = d.id
        ${deptCode ? 'WHERE UPPER(d.code) = UPPER(?)' : ''}
        GROUP BY d.id
      `).all(...(deptCode ? [deptCode] : []));

      const lowAttendanceStudents = db.prepare(`
        SELECT s.registration_number, s.full_name, d.code as department_code,
               COUNT(*) as total_sessions,
               SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) as attended_sessions,
               ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as attendance_pct
        FROM attendance a
        JOIN students s ON s.id = a.student_id
        JOIN departments d ON d.id = s.department_id
        GROUP BY s.id
        HAVING attendance_pct < 75.0
        ORDER BY attendance_pct ASC
      `).all();

      const monthlyTrend = db.prepare(`
        SELECT substr(attendance_date, 1, 7) as month,
               COUNT(*) as total_marks,
               ROUND(100.0 * SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) as attendance_pct
        FROM attendance
        GROUP BY substr(attendance_date, 1, 7)
        ORDER BY month ASC
      `).all();

      return {
        byDepartment: byDept,
        lowAttendanceAlerts: lowAttendanceStudents,
        monthlyTrend,
        sourceTables: ['attendance', 'departments', 'students'],
      };
    }

    case 'getScholarshipAnalytics': {
      const programs = db.prepare(`
        SELECT code, title, provider, category, coverage_type, annual_budget_pkr, status
        FROM scholarships
      `).all();

      if (!canSeeFinancial) {
        // Teacher or Student: return program overview and only own records if student
        const ownAid = isStudent && user.linked_student_id
          ? db.prepare(`
              SELECT fa.academic_year, fa.assistance_type, fa.amount_pkr, fa.fee_concession_pct, fa.application_status, sch.title as scholarship_title
              FROM financial_assistance fa
              LEFT JOIN scholarships sch ON sch.id = fa.scholarship_id
              WHERE fa.student_id = ?
            `).all(user.linked_student_id)
          : [];
        return {
          restrictedFinancialDetails: true,
          note: 'Individual financial assistance disbursements are restricted to Admin and Super Admin roles.',
          scholarshipPrograms: programs,
          ownFinancialAssistance: ownAid,
          sourceTables: ['scholarships', 'financial_assistance'],
        };
      }

      const byStatus = db.prepare(`
        SELECT application_status, COUNT(*) as record_count, SUM(amount_pkr) as total_pkr
        FROM financial_assistance
        GROUP BY application_status
      `).all();

      const byProgram = db.prepare(`
        SELECT COALESCE(sch.title, 'Direct Concession') as scholarship_title,
               COUNT(*) as recipients_count,
               SUM(fa.amount_pkr) as total_amount_pkr
        FROM financial_assistance fa
        LEFT JOIN scholarships sch ON sch.id = fa.scholarship_id
        WHERE fa.application_status IN ('Approved', 'Disbursed')
        GROUP BY scholarship_title
      `).all();

      return {
        scholarshipPrograms: programs,
        assistanceByStatus: byStatus,
        awardedByProgram: byProgram,
        sourceTables: ['scholarships', 'financial_assistance'],
      };
    }

    case 'getEventsAndAchievementsSummary': {
      const eventsByCategory = db.prepare(`
        SELECT category, COUNT(*) as event_count,
               SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_count,
               SUM(CASE WHEN status = 'Upcoming' THEN 1 ELSE 0 END) as upcoming_count
        FROM events
        GROUP BY category
        ORDER BY event_count DESC
      `).all();

      const recentEvents = db.prepare(`
        SELECT title, category, event_date, venue, organizer, status, outcomes
        FROM events
        ORDER BY event_date DESC
      `).all();

      const achievementsByCategory = db.prepare(`
        SELECT category, COUNT(*) as count
        FROM achievements
        GROUP BY category
        ORDER BY count DESC
      `).all();

      const topAchievers = isStudent
        ? []
        : db.prepare(`
            SELECT s.registration_number, s.full_name, d.code as department_code, COUNT(a.id) as achievement_count
            FROM achievements a
            JOIN students s ON s.id = a.student_id
            JOIN departments d ON d.id = s.department_id
            GROUP BY s.id
            ORDER BY achievement_count DESC
            LIMIT 10
          `).all();

      return {
        eventsByCategory,
        eventsList: recentEvents,
        achievementsByCategory,
        topAchievers,
        sourceTables: ['events', 'achievements', 'students', 'departments'],
      };
    }

    case 'getBatchPerformanceComparison': {
      const batches = db.prepare(`
        SELECT admission_year, batch_label,
               COUNT(*) as student_count,
               ROUND(AVG(cgpa), 2) as avg_cgpa,
               MIN(cgpa) as min_cgpa,
               MAX(cgpa) as max_cgpa,
               (SELECT ROUND(100.0 * SUM(CASE WHEN a.status IN ('Present','Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)
                FROM attendance a
                JOIN students s2 ON s2.id = a.student_id
                WHERE s2.admission_year = students.admission_year) as avg_attendance_pct
        FROM students
        GROUP BY admission_year, batch_label
        ORDER BY admission_year ASC
      `).all();
      return {
        batchComparison: batches,
        sourceTables: ['students', 'attendance'],
      };
    }

    case 'getResourcesAndArchiveSummary': {
      const resourcesByCategory = db.prepare(`
        SELECT category, COUNT(*) as asset_groups, SUM(quantity) as total_units, SUM(available_quantity) as available_units
        FROM resources
        GROUP BY category
      `).all();
      const maintenanceNeeded = db.prepare(`
        SELECT resource_code, name, category, location, condition_status, maintenance_notes
        FROM resources
        WHERE condition_status != 'Operational'
      `).all();
      const archiveByCategory = db.prepare(`
        SELECT category, COUNT(*) as document_count
        FROM archive_documents
        GROUP BY category
      `).all();
      return {
        resourcesByCategory,
        maintenanceAlerts: maintenanceNeeded,
        archiveByCategory,
        sourceTables: ['resources', 'archive_documents'],
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'getInstitutionalSummary',
    description: 'Retrieves overall live institutional statistics from Akhuwat College for Women Chakwal database: total enrolled students, faculty, departments, programs, courses, events, achievements, overall average CGPA, and overall attendance percentage.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getDepartmentComparison',
    description: 'Retrieves department-by-department enrollment counts, faculty counts, average CGPA, and attendance percentages.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getTopStudentsByCgpa',
    description: 'Retrieves top-performing students ranked by CGPA, optionally filtered by department code (e.g. BS-CS, BS-ECO, BS-ENG, BS-EDU, BS-MGT). Respects student role privacy.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.NUMBER, description: 'Number of top students to return (1-20).' },
        departmentCode: { type: Type.STRING, description: 'Optional department code filter.' },
      },
    },
  },
  {
    name: 'getAttendanceIntelligence',
    description: 'Retrieves department-wise attendance percentages, monthly attendance trends, and low-attendance student alerts (<75%).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        departmentCode: { type: Type.STRING, description: 'Optional department code filter.' },
      },
    },
  },
  {
    name: 'getScholarshipAnalytics',
    description: 'Retrieves scholarship programs, approved/disbursed financial assistance counts, and PKR totals (redacted for unauthorized roles).',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getEventsAndAchievementsSummary',
    description: 'Retrieves events organized by category, full event list with outcomes, student achievements by category, and top student achievers.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getBatchPerformanceComparison',
    description: 'Compares admission batches (2023, 2024, 2025, 2026) on student enrollment count, average CGPA, min/max CGPA, and attendance.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'getResourcesAndArchiveSummary',
    description: 'Retrieves college resources & inventory utilization, maintenance alerts, and digital archive document counts.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

export async function runCampusIntelligenceQuery(
  question: string,
  user: AuthUser
): Promise<AiQueryResponse> {
  const ai = getClient();
  const model = 'gemini-4-hydrogen';

  const systemInstruction = `You are the Akhuwat Campus Brain AI Analyst for Akhuwat College for Women, Chakwal, Pakistan.
You are answering an authenticated user whose role is ${user.role} (${user.full_name}).

CRITICAL RULES:
1. ALWAYS call the provided database tools to retrieve live figures before answering. NEVER invent, guess, or fabricate institutional numbers.
2. Distinguish clearly between missing/unrecorded data (null) and zero (0).
3. Respect user role permissions: if a tool returns restricted or redacted data for ${user.role}, explain respectfully what is restricted and answer only with authorized figures.
4. Explain findings in clear, simple English suitable for college leadership, faculty, or students.
5. After calling the necessary database tools, output a single valid JSON object (no markdown fences) matching this exact schema:
{
  "answer": "Clear multi-paragraph or bulleted simple-English explanation citing exact numbers from the tool outputs.",
  "dataPeriod": "Explicit period and database snapshot date, e.g. Academic Year 2026-2027 (Fall 2026) · Live Institutional Database",
  "sources": ["table_name_1", "table_name_2"],
  "chart": {
    "type": "bar" | "line" | "pie",
    "title": "Descriptive chart title",
    "xKey": "name",
    "yKey": "value",
    "yLabel": "Unit label e.g. Students or CGPA or %",
    "data": [{"name": "Label", "value": 123}]
  },
  "table": {
    "title": "Table title",
    "columns": ["Column A", "Column B"],
    "rows": [["Row 1 A", 10]]
  }
}
Note: "chart" and "table" are optional—include "chart" whenever the question involves comparisons, distributions, rankings, or trends across categories/departments/batches/months.`;

  const contents: Array<Record<string, unknown>> = [
    { role: 'user', parts: [{ text: question }] },
  ];

  const toolsUsed: string[] = [];
  const collectedSources = new Set<string>();

  // Iterative function-calling loop (up to 4 tool rounds)
  let finalText = '';
  for (let round = 0; round < 4; round++) {
    const response = await ai.models.generateContent({
      model,
      contents: contents as never,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      },
    });

    const candidateContent = response.candidates?.[0]?.content;
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0 && candidateContent) {
      contents.push(candidateContent as unknown as Record<string, unknown>);
      const functionResponseParts: Array<Record<string, unknown>> = [];

      for (const call of functionCalls) {
        const fnName = call.name || '';
        toolsUsed.push(fnName);
        const result = executeTool(fnName, (call.args as Record<string, unknown>) || {}, user) as Record<string, unknown>;
        if (Array.isArray(result.sourceTables)) {
          for (const src of result.sourceTables) collectedSources.add(String(src));
        }
        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: fnName,
            response: result,
          },
        });
      }

      contents.push({ role: 'user', parts: functionResponseParts });
      continue;
    }

    finalText = (response.text ?? '').trim();
    break;
  }

  // Parse JSON response gracefully
  const cleaned = finalText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<AiQueryResponse>;
    return {
      answer: parsed.answer || finalText || 'No summary could be generated from the institutional records.',
      dataPeriod: parsed.dataPeriod || `Live Institutional Snapshot · ${new Date().toISOString().slice(0, 10)}`,
      sources:
        Array.isArray(parsed.sources) && parsed.sources.length > 0
          ? parsed.sources
          : Array.from(collectedSources),
      chart: parsed.chart,
      table: parsed.table,
      toolsUsed,
    };
  } catch {
    return {
      answer: finalText || 'Query completed against the institutional database.',
      dataPeriod: `Live Institutional Snapshot · ${new Date().toISOString().slice(0, 10)}`,
      sources: Array.from(collectedSources),
      toolsUsed,
    };
  }
}
