import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import type { AuthUser, Department, Program, Student } from '../../types/index.ts';
import { apiFetch, uploadFile } from '../../utils/api.ts';
import { exportToCsv, exportToExcel, exportToPdf } from '../../utils/reports.ts';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { SafeImage } from '../ui/SafeImage.tsx';
import { BulkImportModal, type ImportFieldSpec } from '../ui/BulkImportModal.tsx';

interface StudentDetailPayload {
  student: Student;
  attendanceHistory: Array<{ id: number; attendance_date: string; status: string; course_code: string; course_title: string }>;
  results: Array<{ id: number; course_code: string; course_title: string; semester_name: string; marks_obtained: number; total_marks: number; grade: string; gpa_points: number }>;
  scholarships: Array<{ id: number; scholarship_title: string | null; assistance_type: string; amount_pkr: number; application_status: string; academic_year: string }>;
  achievements: Array<{ id: number; title: string; category: string; level: string; achievement_date: string; issuing_organization: string }>;
  certificates: Array<{ id: number; certificate_code: string; title: string; issued_by: string; issue_date: string }>;
  participation: Array<{ id: number; event_title: string; category: string; event_date: string; role: string }>;
}

interface StudentsModuleProps {
  user: AuthUser;
}

const emptyStudentForm = {
  registration_number: '',
  full_name: '',
  email: '',
  phone: '',
  photo_url: '',
  department_id: '',
  program_id: '',
  current_semester: 1,
  admission_year: 2026,
  cgpa: '',
  academic_status: 'Active',
  guardian_name: '',
  guardian_phone: '',
  guardian_relation: 'Father',
  address: '',
  cnic: '',
  date_of_birth: '',
};

const STUDENT_IMPORT_FIELDS: ImportFieldSpec[] = [
  { key: 'registration_number', label: 'Registration Number', required: true },
  { key: 'full_name', label: 'Full Name', required: true },
  { key: 'department', label: 'Department Code/Name', required: true },
  { key: 'program', label: 'Program Code/Name' },
  { key: 'current_semester', label: 'Semester' },
  { key: 'admission_year', label: 'Admission Year' },
  { key: 'cgpa', label: 'CGPA' },
  { key: 'academic_status', label: 'Academic Status' },
  { key: 'guardian_name', label: 'Guardian Name' },
  { key: 'guardian_phone', label: 'Guardian Phone' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
];

export function StudentsModule({ user }: StudentsModuleProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [semFilter, setSemFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyStudentForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [importOpen, setImportOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<StudentDetailPayload | null>(null);
  const [profileTab, setProfileTab] = useState<'overview' | 'attendance' | 'results' | 'achievements'>('overview');

  const canManage = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const loadMeta = useCallback(async () => {
    try {
      const [dRes, aRes] = await Promise.all([
        apiFetch<{ departments: Department[] }>('/api/departments'),
        apiFetch<{ programs: Program[] }>('/api/academics'),
      ]);
      setDepartments(dRes.departments);
      setPrograms(aRes.programs);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Unable to load departments and programs.');
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (deptFilter !== 'all') qs.set('departmentId', deptFilter);
      if (semFilter !== 'all') qs.set('semester', semFilter);
      if (batchFilter !== 'all') qs.set('batch', batchFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (originFilter !== 'all') qs.set('origin', originFilter);
      const res = await apiFetch<{ students: Student[] }>(`/api/students?${qs.toString()}`);
      setStudents(res.students);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Failed to load student records from database.');
    } finally {
      setLoading(false);
    }
  }, [search, deptFilter, semFilter, batchFilter, statusFilter, originFilter]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    const t = setTimeout(loadStudents, 150);
    return () => clearTimeout(t);
  }, [loadStudents]);

  const availableYears = useMemo(() => {
    const yrs = new Set([2022, 2023, 2024, 2025, 2026, 2027]);
    students.forEach((s) => yrs.add(s.admission_year));
    return Array.from(yrs).sort((a, b) => b - a);
  }, [students]);

  const filteredPrograms = useMemo(() => {
    if (!form.department_id) return programs;
    const deptIdNum = Number(form.department_id);
    const matching = programs.filter((p) => p.department_id === deptIdNum);
    return matching.length > 0 ? matching : programs;
  }, [programs, form.department_id]);

  const existingRegsSet = useMemo(
    () => new Set(students.map((s) => s.registration_number.toUpperCase())),
    [students]
  );

  const hasActiveFilters =
    search.trim() !== '' ||
    deptFilter !== 'all' ||
    semFilter !== 'all' ||
    batchFilter !== 'all' ||
    statusFilter !== 'all' ||
    originFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setDeptFilter('all');
    setSemFilter('all');
    setBatchFilter('all');
    setStatusFilter('all');
    setOriginFilter('all');
  };

  const openCreate = () => {
    const firstDeptId = departments[0] ? String(departments[0].id) : '';
    const firstProg = programs.find((p) => String(p.department_id) === firstDeptId) || programs[0];
    setEditingId(null);
    setForm({
      ...emptyStudentForm,
      department_id: firstDeptId,
      program_id: firstProg ? String(firstProg.id) : '',
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (s: Student) => {
    setEditingId(s.id);
    setForm({
      registration_number: s.registration_number,
      full_name: s.full_name,
      email: s.email || '',
      phone: s.phone || '',
      photo_url: s.photo_url || '',
      department_id: String(s.department_id),
      program_id: s.program_id ? String(s.program_id) : '',
      current_semester: s.current_semester,
      admission_year: s.admission_year,
      cgpa: s.cgpa != null ? String(s.cgpa) : '',
      academic_status: s.academic_status,
      guardian_name: s.guardian_name,
      guardian_phone: s.guardian_phone || '',
      guardian_relation: s.guardian_relation || 'Father',
      address: s.address || '',
      cnic: s.cnic || '',
      date_of_birth: s.date_of_birth || '',
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openProfile = async (id: number) => {
    setProfileLoading(true);
    setPageError(null);
    try {
      const res = await apiFetch<StudentDetailPayload>(`/api/students/${id}`);
      setProfileTab('overview');
      setProfileData(res);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Unable to load student academic profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Photograph file must be 5 MB or smaller.');
      return;
    }
    setUploadingPhoto(true);
    setFormError(null);
    try {
      const uploaded = await uploadFile(file);
      setForm((prev) => ({ ...prev, photo_url: uploaded.url }));
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to upload photograph.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const validateStudentForm = (): string | null => {
    if (form.registration_number.trim().length < 3) {
      return 'Registration number must be at least 3 characters (e.g. ACW-2026-CS-040).';
    }
    if (form.full_name.trim().length < 2) {
      return 'Full name must be at least 2 characters.';
    }
    if (!form.department_id) {
      return 'Please select an academic department.';
    }
    if (form.guardian_name.trim().length < 2) {
      return 'Guardian name is required.';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Please enter a valid student email address.';
    }
    if (form.current_semester < 1 || form.current_semester > 12) {
      return 'Current semester must be between 1 and 12.';
    }
    if (form.admission_year < 2015 || form.admission_year > 2040) {
      return 'Admission year must be between 2015 and 2040.';
    }
    if (form.cgpa !== '') {
      const c = Number(form.cgpa);
      if (Number.isNaN(c) || c < 0 || c > 4) {
        return 'CGPA must be between 0.00 and 4.00.';
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateStudentForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        ...form,
        registration_number: form.registration_number.trim(),
        full_name: form.full_name.trim(),
        guardian_name: form.guardian_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        guardian_phone: form.guardian_phone.trim(),
        address: form.address.trim(),
        cnic: form.cnic.trim(),
        department_id: Number(form.department_id),
        program_id: form.program_id ? Number(form.program_id) : null,
        current_semester: Number(form.current_semester),
        admission_year: Number(form.admission_year),
        cgpa: form.cgpa === '' ? null : Number(form.cgpa),
      };
      if (editingId) {
        await apiFetch(`/api/students/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setNotice(`Updated student record for ${payload.full_name}.`);
      } else {
        await apiFetch('/api/students', { method: 'POST', body: JSON.stringify(payload) });
        setNotice(`Enrolled new student ${payload.full_name} (${payload.registration_number}).`);
      }
      setFormOpen(false);
      await loadStudents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save student record.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setPageError(null);
    try {
      await apiFetch(`/api/students/${deleteTarget.id}`, { method: 'DELETE' });
      setNotice(`Removed student record: ${deleteTarget.full_name} (${deleteTarget.registration_number}).`);
      setDeleteTarget(null);
      await loadStudents();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Failed to delete student record.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const buildReportConfig = () => ({
    title: 'Centralized Student Directory Report',
    subtitle: `Filtered Cohort (${students.length} records)`,
    period: 'Academic Year 2026-2027',
    generatedBy: user.full_name,
    summaryPairs: [
      { label: 'Total Students', value: students.length },
      {
        label: 'Average CGPA',
        value:
          students.filter((s) => s.cgpa != null).length > 0
            ? (
                students.reduce((acc, s) => acc + (s.cgpa || 0), 0) /
                students.filter((s) => s.cgpa != null).length
              ).toFixed(2)
            : 'N/A',
      },
      { label: 'Active Status', value: students.filter((s) => s.academic_status === 'Active').length },
    ],
    columns: ['Reg No.', 'Student Name', 'Department', 'Program', 'Sem', 'Batch', 'CGPA', 'Attendance %', 'Status'],
    rows: students.map((s) => [
      s.registration_number,
      s.full_name,
      s.department_code || s.department_name || '',
      s.program_code || '',
      `Sem ${s.current_semester}`,
      s.batch_label,
      s.cgpa != null ? s.cgpa.toFixed(2) : 'Unrecorded',
      s.attendance_pct != null ? `${s.attendance_pct}%` : 'Unrecorded',
      s.academic_status,
    ]),
    fileName: `ACW_Students_${new Date().toISOString().slice(0, 10)}`,
  });

  const exportIndividualProfilePdf = (p: StudentDetailPayload) => {
    const s = p.student;
    exportToPdf({
      title: `Student Academic Dossier — ${s.full_name}`,
      subtitle: `${s.registration_number} · ${s.department_name} (${s.program_name || 'Undergraduate'})`,
      period: `${s.batch_label} · Semester ${s.current_semester}`,
      generatedBy: user.full_name,
      summaryPairs: [
        { label: 'Cumulative GPA', value: s.cgpa != null ? s.cgpa.toFixed(2) : 'N/A' },
        { label: 'Attendance Records', value: p.attendanceHistory.length },
        { label: 'Achievements', value: p.achievements.length },
        { label: 'Status', value: s.academic_status },
      ],
      columns: ['Course Code', 'Course Title', 'Semester', 'Marks', 'Grade', 'GPA'],
      rows:
        p.results.length > 0
          ? p.results.map((r) => [
              r.course_code || '',
              r.course_title || '',
              r.semester_name || '',
              `${r.marks_obtained}/${r.total_marks}`,
              r.grade,
              r.gpa_points.toFixed(2),
            ])
          : [['—', 'No examination results recorded yet', '—', '—', '—', '—']],
      fileName: `ACW_Student_${s.registration_number}`,
    });
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)} className="font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {pageError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <span>{pageError}</span>
          <button type="button" onClick={loadStudents} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, Reg No, email..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#07111F]"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter by department"
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>

          <select
            value={semFilter}
            onChange={(e) => setSemFilter(e.target.value)}
            aria-label="Filter by semester"
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                Semester {s}
              </option>
            ))}
          </select>

          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            aria-label="Filter by batch"
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Batches</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                Batch {y}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by academic status"
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Probation">Probation</option>
            <option value="Graduated">Graduated</option>
            <option value="On Leave">On Leave</option>
          </select>

          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value)}
            aria-label="Filter by record origin"
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Records</option>
            <option value="real">College Records Only</option>
            <option value="demo">Demo Samples Only</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#162944]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Showing <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">{students.length}</span> student record{students.length === 1 ? '' : 's'}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => exportToCsv(buildReportConfig())}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944] whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => exportToExcel(buildReportConfig())}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944] whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>
            <button
              type="button"
              onClick={() => exportToPdf(buildReportConfig())}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944] whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF Report
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#C59B27] text-[#0B1F3A] dark:text-[#E5BA41] hover:bg-[#C59B27]/10 whitespace-nowrap shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import CSV / Excel
                </button>
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Student
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading student database...</span>
          </div>
        ) : students.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No Student Records Match Criteria"
              description="Adjust your department/semester filters or enroll a new student record."
              actionLabel={canManage ? 'Enroll New Student' : undefined}
              onAction={canManage ? openCreate : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1729] text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Reg No.</th>
                  <th className="py-3 px-4">Department & Program</th>
                  <th className="py-3 px-4">Batch / Sem</th>
                  <th className="py-3 px-4 text-right">CGPA</th>
                  <th className="py-3 px-4 text-right">Attendance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-[#162944]/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                          <SafeImage
                            src={s.photo_url}
                            alt={s.full_name}
                            className="w-full h-full object-cover"
                            fallbackIcon={<User className="w-4 h-4" />}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                            <span>{s.full_name}</span>
                            {s.is_demo === 1 && (
                              <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                DEMO
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{s.email || s.student_uid}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {s.registration_number}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{s.department_code}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
                        {s.program_name || s.department_name}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular whitespace-nowrap">
                      {s.batch_label} · Sem {s.current_semester}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900 dark:text-slate-100">
                      {s.cgpa != null ? s.cgpa.toFixed(2) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular">
                      {s.attendance_pct != null ? (
                        <span
                          className={
                            s.attendance_pct < 75
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }
                        >
                          {s.attendance_pct}%
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          s.academic_status === 'Active'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : s.academic_status === 'Probation'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {s.academic_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openProfile(s.id)}
                          disabled={profileLoading}
                          title="View Student Profile"
                          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              title="Edit Student"
                              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(s)}
                              title="Delete Student"
                              className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Student Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Student Record' : 'Enroll New Student'}
        subtitle="Akhuwat College for Women, Chakwal — Centralized Student Registry"
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
              {formError}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Registration Number *</label>
              <input
                type="text"
                required
                value={form.registration_number}
                onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
                placeholder="ACW-2026-CS-040"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Department *</label>
              <select
                required
                value={form.department_id}
                onChange={(e) => {
                  const newDeptId = e.target.value;
                  const firstMatch = programs.find((p) => String(p.department_id) === newDeptId);
                  setForm({
                    ...form,
                    department_id: newDeptId,
                    program_id: firstMatch ? String(firstMatch.id) : '',
                  });
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Degree Program</label>
              <select
                value={form.program_id}
                onChange={(e) => setForm({ ...form, program_id: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              >
                <option value="">Select Program</option>
                {filteredPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Current Semester</label>
              <input
                type="number"
                min={1}
                max={12}
                value={form.current_semester}
                onChange={(e) => setForm({ ...form, current_semester: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Admission Year</label>
              <input
                type="number"
                min={2015}
                max={2040}
                value={form.admission_year}
                onChange={(e) => setForm({ ...form, admission_year: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">CGPA (0.00 - 4.00)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={4}
                value={form.cgpa}
                onChange={(e) => setForm({ ...form, cgpa: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Academic Status</label>
              <select
                value={form.academic_status}
                onChange={(e) => setForm({ ...form, academic_status: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              >
                <option value="Active">Active</option>
                <option value="Probation">Probation</option>
                <option value="Graduated">Graduated</option>
                <option value="On Leave">On Leave</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="student@student.acw.edu.pk"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+92-300-0000000"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Guardian Name *</label>
              <input
                type="text"
                required
                value={form.guardian_name}
                onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">Relation</label>
                <select
                  value={form.guardian_relation}
                  onChange={(e) => setForm({ ...form, guardian_relation: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                >
                  <option value="Father">Father</option>
                  <option value="Mother">Mother</option>
                  <option value="Brother">Brother</option>
                  <option value="Guardian">Guardian</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Guardian Phone</label>
                <input
                  type="text"
                  value={form.guardian_phone}
                  onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">CNIC / B-Form</label>
              <input
                type="text"
                value={form.cnic}
                onChange={(e) => setForm({ ...form, cnic: e.target.value })}
                placeholder="37201-0000000-0"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Date of Birth</label>
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Address (Chakwal / Tehsil)</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-4">
              {form.photo_url && (
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                  <SafeImage src={form.photo_url} alt="Student preview" className="w-full h-full object-cover" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1">Profile Photograph</label>
                <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#162944]">
                  {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{uploadingPhoto ? 'Uploading...' : form.photo_url ? 'Change Uploaded Photo' : 'Upload Photograph'}</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhoto} />
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingPhoto}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Student Record'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk CSV / Excel Import Modal */}
      {canManage && (
        <BulkImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          entityType="students"
          title="Import Student Records (CSV / Excel)"
          subtitle="Upload a CSV or Excel (.xlsx) sheet to add student records directly to the persistent database."
          fields={STUDENT_IMPORT_FIELDS}
          existingKeys={existingRegsSet}
          duplicateKeyField="registration_number"
          duplicateKeyLabel="Reg No."
          templateFileName="ACW_Student_Import_Template"
          sampleRows={[
            [
              'ACW-2026-CS-101',
              'Maryam Fatima',
              'BS-CS',
              'BSCS',
              1,
              2026,
              3.75,
              'Active',
              'Muhammad Tariq',
              '+92-300-5119901',
              'maryam.f@student.acw.edu.pk',
              '+92-300-4119901',
            ],
          ]}
          onSuccess={async () => {
            setNotice('Bulk student import completed and saved to database.');
            await loadStudents();
          }}
        />
      )}

      {/* Individual Student Profile Dossier Modal */}
      <Modal
        open={Boolean(profileData)}
        onClose={() => setProfileData(null)}
        title={profileData ? profileData.student.full_name : 'Student Profile'}
        subtitle={
          profileData
            ? `${profileData.student.registration_number} · ${profileData.student.department_name} · ${profileData.student.batch_label}`
            : ''
        }
        maxWidthClass="max-w-4xl"
      >
        {profileData && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                  <SafeImage
                    src={profileData.student.photo_url}
                    alt={profileData.student.full_name}
                    className="w-full h-full object-cover"
                    fallbackIcon={<User className="w-6 h-6" />}
                  />
                </div>
                <div className="text-xs space-y-1">
                  <div className="font-mono-tabular text-slate-600 dark:text-slate-300">
                    UID: {profileData.student.student_uid} · Semester {profileData.student.current_semester} · CGPA:{' '}
                    <span className="font-bold text-[#0B1F3A] dark:text-[#E5BA41]">
                      {profileData.student.cgpa != null ? profileData.student.cgpa.toFixed(2) : 'Unrecorded'}
                    </span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Guardian: {profileData.student.guardian_name} ({profileData.student.guardian_relation || 'Guardian'})
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => exportIndividualProfilePdf(profileData)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] whitespace-nowrap shrink-0"
              >
                <FileText className="w-3.5 h-3.5" />
                Generate Student Report PDF
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#07111F] rounded-lg w-fit">
              {(['overview', 'attendance', 'results', 'achievements'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setProfileTab(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                    profileTab === tab
                      ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {profileTab === 'overview' && (
              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Contact & Personal Details</div>
                  <div>Email: {profileData.student.email || '—'}</div>
                  <div>Phone: {profileData.student.phone || '—'}</div>
                  <div>Guardian Phone: {profileData.student.guardian_phone || '—'}</div>
                  <div>CNIC / B-Form: {profileData.student.cnic || '—'}</div>
                  <div>Address: {profileData.student.address || '—'}</div>
                  <div>DOB: {profileData.student.date_of_birth || '—'}</div>
                </div>
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Scholarships & Financial Aid</div>
                  {profileData.scholarships.length === 0 ? (
                    <div className="text-slate-500">No scholarship records visible or assigned.</div>
                  ) : (
                    profileData.scholarships.map((sc) => (
                      <div key={sc.id} className="py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div className="font-medium">{sc.scholarship_title || sc.assistance_type}</div>
                        <div className="text-slate-500">
                          PKR {sc.amount_pkr.toLocaleString()} · {sc.application_status} ({sc.academic_year})
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {profileTab === 'attendance' && (
              <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-[#07111F]">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Course</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {profileData.attendanceHistory.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 px-3 font-mono-tabular">{a.attendance_date}</td>
                        <td className="py-2 px-3">{a.course_code} — {a.course_title}</td>
                        <td className="py-2 px-3 font-medium">{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {profileTab === 'results' && (
              <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-[#07111F]">
                    <tr>
                      <th className="py-2 px-3">Course</th>
                      <th className="py-2 px-3">Semester</th>
                      <th className="py-2 px-3 text-right">Marks</th>
                      <th className="py-2 px-3 text-right">Grade / GPA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {profileData.results.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 px-3">{r.course_code} — {r.course_title}</td>
                        <td className="py-2 px-3">{r.semester_name}</td>
                        <td className="py-2 px-3 text-right font-mono-tabular">{r.marks_obtained}/{r.total_marks}</td>
                        <td className="py-2 px-3 text-right font-mono-tabular font-semibold">{r.grade} ({r.gpa_points.toFixed(2)})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {profileTab === 'achievements' && (
              <div className="space-y-3 text-xs">
                {profileData.achievements.length === 0 && profileData.certificates.length === 0 ? (
                  <div className="text-slate-500">No achievements or certificates recorded yet.</div>
                ) : (
                  <>
                    {profileData.achievements.map((ac) => (
                      <div key={ac.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{ac.title}</div>
                        <div className="text-slate-500 mt-0.5">
                          {ac.category} · {ac.level} · {ac.issuing_organization} · {ac.achievement_date}
                        </div>
                      </div>
                    ))}
                    {profileData.certificates.map((cert) => (
                      <div key={cert.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{cert.title}</div>
                        <div className="text-slate-500 font-mono-tabular mt-0.5">
                          {cert.certificate_code} · Issued by {cert.issued_by} ({cert.issue_date})
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Student Record"
        message={`Are you sure you want to permanently remove ${deleteTarget?.full_name} (${deleteTarget?.registration_number})? Related attendance and academic records will also be deleted.`}
      />
    </div>
  );
}
