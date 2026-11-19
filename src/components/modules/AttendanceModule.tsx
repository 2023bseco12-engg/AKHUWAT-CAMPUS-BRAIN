import { useCallback, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { AlertTriangle, CheckSquare, FileText } from 'lucide-react';
import type { AuthUser, Course, Department, Student } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { exportToCsv, exportToPdf } from '../../utils/reports.ts';
import { EmptyState } from '../ui/EmptyState.tsx';

interface AttendancePayload {
  records: Array<{ id: number; attendance_date: string; status: string; registration_number: string; student_name: string; department_code: string; course_code: string }>;
  studentSummary: Array<{ student_id: number; registration_number: string; full_name: string; department_code: string; total_sessions: number; attended_sessions: number; absent_sessions: number; attendance_pct: number | null }>;
  byDepartment: Array<{ code: string; name: string; total_marks: number; attendance_pct: number | null }>;
  monthlyTrend: Array<{ month: string; total_marks: number; attendance_pct: number | null }>;
}

export function AttendanceModule({ user }: { user: AuthUser }) {
  const [data, setData] = useState<AttendancePayload | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [deptFilter, setDeptFilter] = useState('all');
  const [tab, setTab] = useState<'analytics' | 'mark' | 'alerts'>('analytics');

  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [markDate, setMarkDate] = useState(new Date().toISOString().slice(0, 10));
  const [marksMap, setMarksMap] = useState<Record<number, 'Present' | 'Absent' | 'Leave' | 'Late'>>({});
  const [savingMarks, setSavingMarks] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const canMark = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'TEACHER';

  const loadData = useCallback(async () => {
    const qs = new URLSearchParams();
    if (deptFilter !== 'all') qs.set('departmentId', deptFilter);
    const [att, dRes, acadRes, stuRes] = await Promise.all([
      apiFetch<AttendancePayload>(`/api/attendance?${qs.toString()}`),
      apiFetch<{ departments: Department[] }>('/api/departments'),
      apiFetch<{ courses: Course[] }>('/api/academics'),
      apiFetch<{ students: Student[] }>('/api/students'),
    ]);
    setData(att);
    setDepartments(dRes.departments);
    setCourses(acadRes.courses);
    setStudents(stuRes.students);
    if (!selectedCourseId && acadRes.courses.length > 0) {
      setSelectedCourseId(String(acadRes.courses[0].id));
    }
  }, [deptFilter, selectedCourseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeCourse = courses.find((c) => String(c.id) === selectedCourseId);
  const classStudents = activeCourse
    ? students.filter((s) => s.department_id === activeCourse.department_id)
    : students;

  useEffect(() => {
    const init: Record<number, 'Present' | 'Absent' | 'Leave' | 'Late'> = {};
    for (const s of classStudents) init[s.id] = marksMap[s.id] || 'Present';
    setMarksMap(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId, students.length]);

  const handleBulkSave = async () => {
    if (!selectedCourseId || classStudents.length === 0) return;
    setSavingMarks(true);
    setSaveMessage(null);
    try {
      const entries = classStudents.map((s) => ({
        student_id: s.id,
        status: marksMap[s.id] || 'Present',
      }));
      await apiFetch('/api/attendance/bulk', {
        method: 'POST',
        body: JSON.stringify({
          course_id: Number(selectedCourseId),
          attendance_date: markDate,
          entries,
        }),
      });
      setSaveMessage(`Saved daily attendance for ${entries.length} students on ${markDate}.`);
      await loadData();
    } finally {
      setSavingMarks(false);
    }
  };

  if (!data) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading attendance intelligence...</div>;
  }

  const lowAttendance = data.studentSummary.filter((s) => s.attendance_pct != null && s.attendance_pct < 75);

  const exportAttendancePdf = () => {
    exportToPdf({
      title: 'Institutional Attendance Intelligence Report',
      subtitle: 'Calculated from verified session attendance logs',
      period: 'Fall 2026 Academic Session',
      generatedBy: user.full_name,
      summaryPairs: [
        { label: 'Students Tracked', value: data.studentSummary.length },
        { label: 'Low Attendance (<75%)', value: lowAttendance.length },
      ],
      columns: ['Reg No.', 'Student Name', 'Dept', 'Attended', 'Total Sessions', 'Absences', 'Attendance %'],
      rows: data.studentSummary.map((s) => [
        s.registration_number,
        s.full_name,
        s.department_code,
        s.attended_sessions,
        s.total_sessions,
        s.absent_sessions,
        s.attendance_pct != null ? `${s.attendance_pct}%` : 'Unrecorded',
      ]),
      fileName: `ACW_Attendance_${new Date().toISOString().slice(0, 10)}`,
    });
  };

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#07111F] rounded-lg">
            <button
              type="button"
              onClick={() => setTab('analytics')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === 'analytics' ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Attendance Overview
            </button>
            {canMark && (
              <button
                type="button"
                onClick={() => setTab('mark')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === 'mark' ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Daily Attendance Entry
              </button>
            )}
            <button
              type="button"
              onClick={() => setTab('alerts')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === 'alerts' ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Low-Attendance Alerts ({lowAttendance.length})
            </button>
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
            onClick={() =>
              exportToCsv({
                title: 'Student Attendance Summary',
                columns: ['Reg No.', 'Name', 'Dept', 'Attended', 'Total', 'Attendance %'],
                rows: data.studentSummary.map((s) => [s.registration_number, s.full_name, s.department_code, s.attended_sessions, s.total_sessions, s.attendance_pct ?? '']),
                fileName: 'ACW_Attendance.csv',
              })
            }
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={exportAttendancePdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF Report
          </button>
        </div>
      </div>

      {tab === 'analytics' && (
        <>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold mb-3">Department-Wise Attendance Comparison (%)</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byDepartment}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="code" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="attendance_pct" name="Attendance %" fill="#0B1F3A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold mb-3">Monthly Attendance Trend (%)</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis domain={[50, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="attendance_pct" name="Monthly Rate %" stroke="#C59B27" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold">
              Student-Wise Cumulative Attendance Percentages
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#0B1729] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Reg No.</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4 text-right">Attended / Total</th>
                    <th className="py-3 px-4 text-right">Attendance %</th>
                    <th className="py-3 px-4">Standing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.studentSummary.map((s) => (
                    <tr key={s.student_id}>
                      <td className="py-3 px-4 font-mono-tabular">{s.registration_number}</td>
                      <td className="py-3 px-4 font-medium">{s.full_name}</td>
                      <td className="py-3 px-4">{s.department_code}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular">{s.attended_sessions} / {s.total_sessions}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold">
                        {s.attendance_pct != null ? `${s.attendance_pct}%` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        {s.attendance_pct == null ? (
                          <span className="text-slate-400">No Sessions</span>
                        ) : s.attendance_pct < 75 ? (
                          <span className="text-red-600 dark:text-red-400 font-semibold">Below 75% Warning</span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">Satisfactory</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'mark' && canMark && (
        <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Course / Class</label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title} ({c.department_code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Session Date</label>
                <input
                  type="date"
                  value={markDate}
                  onChange={(e) => setMarkDate(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] font-mono-tabular"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next: Record<number, 'Present'> = {};
                  for (const s of classStudents) next[s.id] = 'Present';
                  setMarksMap(next);
                }}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Mark All Present
              </button>
              <button
                type="button"
                disabled={savingMarks || classStudents.length === 0}
                onClick={handleBulkSave}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {savingMarks ? 'Saving...' : 'Save Daily Attendance'}
              </button>
            </div>
          </div>

          {saveMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
              {saveMessage}
            </div>
          )}

          {classStudents.length === 0 ? (
            <EmptyState title="No Students in Course Department" description="Select another course to mark attendance." />
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#07111F]">
                  <tr>
                    <th className="py-2.5 px-4">Reg No.</th>
                    <th className="py-2.5 px-4">Student Name</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {classStudents.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 px-4 font-mono-tabular">{s.registration_number}</td>
                      <td className="py-2.5 px-4 font-medium">{s.full_name}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5">
                          {(['Present', 'Absent', 'Late', 'Leave'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setMarksMap((prev) => ({ ...prev, [s.id]: st }))}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                marksMap[s.id] === st
                                  ? st === 'Present'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : st === 'Absent'
                                    ? 'bg-red-600 text-white border-red-600'
                                    : 'bg-amber-600 text-white border-amber-600'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
          {lowAttendance.length === 0 ? (
            <EmptyState
              title="No Low-Attendance Alerts"
              description="All tracked students currently meet the 75% institutional attendance requirement."
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {lowAttendance.map((s) => (
                <div key={s.student_id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {s.full_name} · <span className="font-mono-tabular">{s.registration_number}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.department_code} · Attended {s.attended_sessions} of {s.total_sessions} sessions ({s.absent_sessions} absences)
                      </div>
                    </div>
                  </div>
                  <div className="text-base font-bold font-mono-tabular text-red-600 dark:text-red-400">
                    {s.attendance_pct}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
