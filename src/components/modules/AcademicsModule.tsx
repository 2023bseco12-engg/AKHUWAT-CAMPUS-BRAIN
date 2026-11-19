import React, { useEffect, useState } from 'react';
import { Calendar, FileText, GraduationCap, Plus } from 'lucide-react';
import type { AuthUser, Course, Department, ExamResult, Faculty, Program, Semester, Student } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { exportToExcel, exportToPdf } from '../../utils/reports.ts';
import { Modal } from '../ui/Modal.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

interface AcademicsPayload {
  programs: Program[];
  semesters: Semester[];
  courses: Course[];
  results: ExamResult[];
  calendar: Array<{ id: number; title: string; event_type: string; start_date: string; end_date: string; semester_name: string | null; description: string | null }>;
}

export function AcademicsModule({ user }: { user: AuthUser }) {
  const [data, setData] = useState<AcademicsPayload | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [tab, setTab] = useState<'courses' | 'results' | 'programs' | 'calendar'>('courses');
  const [deptFilter, setDeptFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [courseOpen, setCourseOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({
    code: '',
    title: '',
    department_id: '',
    program_id: '',
    semester_number: 1,
    credit_hours: 3,
    instructor_id: '',
    schedule_slot: '',
    room_number: '',
  });

  const [gradeOpen, setGradeOpen] = useState(false);
  const [gradeForm, setGradeForm] = useState({
    student_id: '',
    course_id: '',
    semester_id: '',
    marks_obtained: 82,
    total_marks: 100,
  });

  const canAddCourse = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const canEnterGrades = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'TEACHER';

  const loadAll = async () => {
    setLoading(true);
    try {
      const [acad, dRes, fRes, sRes] = await Promise.all([
        apiFetch<AcademicsPayload>('/api/academics'),
        apiFetch<{ departments: Department[] }>('/api/departments'),
        apiFetch<{ faculty: Faculty[] }>('/api/faculty'),
        apiFetch<{ students: Student[] }>('/api/students'),
      ]);
      setData(acad);
      setDepartments(dRes.departments);
      setFaculty(fRes.faculty);
      setStudents(sRes.students);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/academics/courses', {
      method: 'POST',
      body: JSON.stringify({
        ...courseForm,
        department_id: Number(courseForm.department_id),
        program_id: courseForm.program_id ? Number(courseForm.program_id) : null,
        instructor_id: courseForm.instructor_id ? Number(courseForm.instructor_id) : null,
      }),
    });
    setCourseOpen(false);
    await loadAll();
  };

  const handleEnterGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/academics/results', {
      method: 'POST',
      body: JSON.stringify({
        student_id: Number(gradeForm.student_id),
        course_id: Number(gradeForm.course_id),
        semester_id: Number(gradeForm.semester_id),
        marks_obtained: Number(gradeForm.marks_obtained),
        total_marks: Number(gradeForm.total_marks),
      }),
    });
    setGradeOpen(false);
    await loadAll();
  };

  if (loading || !data) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading academic records...</div>;
  }

  const filteredCourses =
    deptFilter === 'all' ? data.courses : data.courses.filter((c) => String(c.department_id) === deptFilter);
  const filteredResults =
    deptFilter === 'all'
      ? data.results
      : data.results.filter((r) => {
          const dept = departments.find((d) => String(d.id) === deptFilter);
          return dept ? r.department_code === dept.code : true;
        });

  const exportAcademicPdf = () => {
    exportToPdf({
      title: 'Semester-Wise & Department-Wise Academic Results Report',
      subtitle: 'Examination Cell — Akhuwat College for Women, Chakwal',
      period: 'Fall 2026 Academic Session',
      generatedBy: user.full_name,
      columns: ['Reg No.', 'Student Name', 'Dept', 'Course', 'Semester', 'Marks', 'Grade', 'GPA'],
      rows: filteredResults.map((r) => [
        r.registration_number || '',
        r.student_name || '',
        r.department_code || '',
        `${r.course_code} — ${r.course_title}`,
        r.semester_name || '',
        `${r.marks_obtained}/${r.total_marks}`,
        r.grade,
        r.gpa_points.toFixed(2),
      ]),
      fileName: `ACW_Academic_Report_${new Date().toISOString().slice(0, 10)}`,
    });
  };

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#07111F] rounded-lg">
            {([
              ['courses', 'Courses & Schedules'],
              ['results', 'Exam Results & CGPA'],
              ['programs', 'Degree Programs'],
              ['calendar', 'Academic Calendar'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  tab === key
                    ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportAcademicPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <FileText className="w-3.5 h-3.5" />
            Academic Report PDF
          </button>
          <button
            type="button"
            onClick={() =>
              exportToExcel({
                title: 'Academic Results Sheet',
                columns: ['Reg No.', 'Student', 'Course', 'Semester', 'Marks', 'Grade', 'GPA'],
                rows: filteredResults.map((r) => [
                  r.registration_number,
                  r.student_name,
                  r.course_code,
                  r.semester_name,
                  r.marks_obtained,
                  r.grade,
                  r.gpa_points,
                ]),
                fileName: 'ACW_Results.xlsx',
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
          >
            Excel
          </button>
          {canAddCourse && tab === 'courses' && (
            <button
              type="button"
              onClick={() => {
                setCourseForm({
                  ...courseForm,
                  department_id: departments[0] ? String(departments[0].id) : '',
                });
                setCourseOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Course
            </button>
          )}
          {canEnterGrades && tab === 'results' && (
            <button
              type="button"
              onClick={() => {
                setGradeForm({
                  student_id: students[0] ? String(students[0].id) : '',
                  course_id: data.courses[0] ? String(data.courses[0].id) : '',
                  semester_id: data.semesters[0] ? String(data.semesters[0].id) : '',
                  marks_obtained: 84,
                  total_marks: 100,
                });
                setGradeOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
            >
              <Plus className="w-3.5 h-3.5" />
              Record Grade
            </button>
          )}
        </div>
      </div>

      {tab === 'courses' && (
        <div className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden">
          {filteredCourses.length === 0 ? (
            <div className="p-6"><EmptyState title="No Courses Found" description="Add courses to build the semester timetable." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#0B1729] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Course Title</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Sem / Credits</th>
                    <th className="py-3 px-4">Instructor</th>
                    <th className="py-3 px-4">Schedule & Room</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCourses.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-[#162944]/40">
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-[#0B1F3A] dark:text-[#E5BA41]">{c.code}</td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{c.title}</td>
                      <td className="py-3 px-4">{c.department_code}</td>
                      <td className="py-3 px-4 font-mono-tabular">Sem {c.semester_number} · {c.credit_hours} Cr</td>
                      <td className="py-3 px-4">{c.instructor_name || 'TBA'}</td>
                      <td className="py-3 px-4 text-slate-500">{c.schedule_slot || '—'} · {c.room_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'results' && (
        <div className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden">
          {filteredResults.length === 0 ? (
            <div className="p-6"><EmptyState title="No Examination Results" description="Record student examination grades to compute semester GPAs." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#0B1729] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Reg No.</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Dept</th>
                    <th className="py-3 px-4">Course</th>
                    <th className="py-3 px-4">Semester</th>
                    <th className="py-3 px-4 text-right">Marks</th>
                    <th className="py-3 px-4 text-right">Grade</th>
                    <th className="py-3 px-4 text-right">GPA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredResults.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 px-4 font-mono-tabular">{r.registration_number}</td>
                      <td className="py-3 px-4 font-medium">{r.student_name}</td>
                      <td className="py-3 px-4">{r.department_code}</td>
                      <td className="py-3 px-4">{r.course_code} — {r.course_title}</td>
                      <td className="py-3 px-4">{r.semester_name}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular">{r.marks_obtained}/{r.total_marks}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold">{r.grade}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#0B1F3A] dark:text-[#E5BA41]">{r.gpa_points.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'programs' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.programs.map((p) => (
            <div key={p.id} className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <GraduationCap className="w-5 h-5 text-[#C59B27]" />
                <div className="text-xs font-mono-tabular font-semibold text-slate-500">{p.code} · {p.department_code}</div>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-2">{p.name}</h3>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono-tabular">
                {p.degree_level} · {p.duration_years} Years ({p.total_semesters} Semesters) · {p.credit_hours} Credit Hours
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'calendar' && (
        <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {data.calendar.map((item) => (
            <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-[#C59B27] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{item.event_type} · {item.semester_name}</div>
                </div>
              </div>
              <div className="text-xs font-mono-tabular text-slate-700 dark:text-slate-300 shrink-0">
                {item.start_date} {item.end_date && item.end_date !== item.start_date ? `→ ${item.end_date}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={courseOpen} onClose={() => setCourseOpen(false)} title="Add Academic Course">
        <form onSubmit={handleCreateCourse} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Course Code *</label>
              <input type="text" required value={courseForm.code} onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })} placeholder="CS-412" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Department *</label>
              <select required value={courseForm.department_id} onChange={(e) => setCourseForm({ ...courseForm, department_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Course Title *</label>
            <input type="text" required value={courseForm.title} onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Semester</label>
              <input type="number" min={1} max={8} value={courseForm.semester_number} onChange={(e) => setCourseForm({ ...courseForm, semester_number: Number(e.target.value) })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Credit Hours</label>
              <input type="number" min={1} max={6} value={courseForm.credit_hours} onChange={(e) => setCourseForm({ ...courseForm, credit_hours: Number(e.target.value) })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Room</label>
              <input type="text" value={courseForm.room_number} onChange={(e) => setCourseForm({ ...courseForm, room_number: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Instructor</label>
              <select value={courseForm.instructor_id} onChange={(e) => setCourseForm({ ...courseForm, instructor_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                <option value="">TBA</option>
                {faculty.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Schedule Slot</label>
              <input type="text" value={courseForm.schedule_slot} onChange={(e) => setCourseForm({ ...courseForm, schedule_slot: e.target.value })} placeholder="Mon/Wed 10:00-11:30" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCourseOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">Save Course</button>
          </div>
        </form>
      </Modal>

      <Modal open={gradeOpen} onClose={() => setGradeOpen(false)} title="Record Student Examination Grade">
        <form onSubmit={handleEnterGrade} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Student *</label>
            <select required value={gradeForm.student_id} onChange={(e) => setGradeForm({ ...gradeForm, student_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
              {students.map((s) => <option key={s.id} value={s.id}>{s.registration_number} — {s.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Course *</label>
              <select required value={gradeForm.course_id} onChange={(e) => setGradeForm({ ...gradeForm, course_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                {data.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Semester *</label>
              <select required value={gradeForm.semester_id} onChange={(e) => setGradeForm({ ...gradeForm, semester_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                {data.semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Marks Obtained *</label>
              <input type="number" required min={0} max={100} value={gradeForm.marks_obtained} onChange={(e) => setGradeForm({ ...gradeForm, marks_obtained: Number(e.target.value) })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Total Marks</label>
              <input type="number" required min={1} value={gradeForm.total_marks} onChange={(e) => setGradeForm({ ...gradeForm, total_marks: Number(e.target.value) })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Grade, GPA points, and student CGPA are recalculated automatically upon saving.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setGradeOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">Save Result & Sync CGPA</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
