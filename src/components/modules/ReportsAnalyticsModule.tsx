import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, Upload } from 'lucide-react';
import type { AuthUser, Department } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { exportToCsv, exportToExcel, exportToPdf } from '../../utils/reports.ts';
import { EmptyState } from '../ui/EmptyState.tsx';

interface AnalyticsPayload {
  enrollmentByYear: Array<{ year: number; batch: string; count: number; avgCgpa: number | null }>;
  departmentComparison: Array<{ code: string; name: string; students: number; avgCgpa: number | null; faculty: number; attendancePct: number | null }>;
  cgpaDistribution: Array<{ band: string; count: number }>;
  attendanceByMonth: Array<{ month: string; records: number; rate: number }>;
  scholarshipDistribution: Array<{ status: string; count: number; totalPkr: number }>;
  eventParticipation: Array<{ category: string; events: number; participants: number }>;
  achievementAnalysis: Array<{ category: string; count: number }>;
  facultyStats: Array<{ department: string; count: number; avgExperience: number | null }>;
  resourceUtilization: Array<{ category: string; total: number; available: number }>;
}

interface ImportHistoryRow {
  id: number;
  entity_type: string;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_count: number;
  status: string;
  imported_by_name: string | null;
  created_at: string;
}

const PALETTE = ['#0B1F3A', '#C59B27', '#1D4ED8', '#059669', '#D97706', '#64748B'];

const STUDENT_TARGET_FIELDS = [
  { key: 'registration_number', label: 'Registration Number *', required: true },
  { key: 'full_name', label: 'Full Name *', required: true },
  { key: 'department', label: 'Department Code/Name *', required: true },
  { key: 'program', label: 'Program', required: false },
  { key: 'current_semester', label: 'Semester', required: false },
  { key: 'admission_year', label: 'Admission Year', required: false },
  { key: 'cgpa', label: 'CGPA', required: false },
  { key: 'guardian_name', label: 'Guardian Name', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Phone', required: false },
];

const FACULTY_TARGET_FIELDS = [
  { key: 'employee_id', label: 'Employee ID *', required: true },
  { key: 'full_name', label: 'Full Name *', required: true },
  { key: 'email', label: 'Email *', required: true },
  { key: 'department', label: 'Department Code/Name *', required: true },
  { key: 'qualification', label: 'Qualification *', required: true },
  { key: 'designation', label: 'Designation', required: false },
  { key: 'specialization', label: 'Specialization', required: false },
  { key: 'subjects_taught', label: 'Subjects Taught', required: false },
  { key: 'experience_years', label: 'Experience (Yrs)', required: false },
  { key: 'phone', label: 'Phone', required: false },
];

export function ReportsAnalyticsModule({ user }: { user: AuthUser }) {
  const [tab, setTab] = useState<'analytics' | 'reports' | 'import'>('analytics');
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [yearFilter, setYearFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Import Center state
  const [importEntity, setImportEntity] = useState<'students' | 'faculty'>('students');
  const [rawFileName, setRawFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [existingRegs, setExistingRegs] = useState<Set<string>>(new Set());
  const [existingFacultyIds, setExistingFacultyIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [loadingImportMeta, setLoadingImportMeta] = useState(false);
  const [importResult, setImportResult] = useState<{ importedRows: number; skippedRows: number; errors: Array<{ row: number; registration_number?: string; employee_id?: string; reason: string }> } | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryRow[]>([]);

  const canImport = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const targetFields = importEntity === 'students' ? STUDENT_TARGET_FIELDS : FACULTY_TARGET_FIELDS;

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setAnalyticsError(null);
    try {
      const qs = new URLSearchParams();
      if (yearFilter !== 'all') qs.set('year', yearFilter);
      if (deptFilter !== 'all') qs.set('departmentId', deptFilter);
      const [aRes, dRes] = await Promise.all([
        apiFetch<AnalyticsPayload>(`/api/analytics?${qs.toString()}`),
        apiFetch<{ departments: Department[] }>('/api/departments'),
      ]);
      setAnalytics(aRes);
      setDepartments(dRes.departments);
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : 'Failed to load institutional analytics');
    } finally {
      setLoading(false);
    }
  }, [yearFilter, deptFilter]);

  const loadImportMeta = useCallback(async () => {
    if (!canImport) return;
    setLoadingImportMeta(true);
    setImportError(null);
    try {
      const [stuRes, facRes, histRes] = await Promise.all([
        apiFetch<{ students: Array<{ registration_number: string }> }>('/api/students'),
        apiFetch<{ faculty: Array<{ employee_id: string }> }>('/api/faculty'),
        apiFetch<{ history: ImportHistoryRow[] }>('/api/import/history'),
      ]);
      setExistingRegs(new Set(stuRes.students.map((s) => s.registration_number.toUpperCase())));
      setExistingFacultyIds(new Set(facRes.faculty.map((f) => f.employee_id.toUpperCase())));
      setImportHistory(histRes.history);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to load existing records & import history');
    } finally {
      setLoadingImportMeta(false);
    }
  }, [canImport]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (tab === 'import') loadImportMeta();
  }, [tab, loadImportMeta]);

  const handleEntitySwitch = (entity: 'students' | 'faculty') => {
    setImportEntity(entity);
    setRawFileName('');
    setRawHeaders([]);
    setRawRows([]);
    setColumnMap({});
    setImportResult(null);
    setImportError(null);
  };

  const handleDownloadSampleTemplate = (format: 'csv' | 'xlsx') => {
    const sampleRow =
      importEntity === 'students'
        ? {
            registration_number: 'ACW-2026-CS-901',
            full_name: 'Ayesha Fatima',
            department: 'CS',
            program: 'BS Computer Science',
            current_semester: 1,
            admission_year: 2026,
            cgpa: 3.65,
            guardian_name: 'Muhammad Tariq',
            email: 'ayesha.901@acw.edu.pk',
            phone: '0300-5550199',
          }
        : {
            employee_id: 'FAC-ACW-901',
            full_name: 'Dr. Sadia Anwar',
            email: 'sadia.anwar@acw.edu.pk',
            department: 'CS',
            qualification: 'PhD Computer Science',
            designation: 'Assistant Professor',
            specialization: 'Artificial Intelligence',
            subjects_taught: 'Machine Learning, Data Structures',
            experience_years: 7,
            phone: '0301-5550199',
          };
    const ws = XLSX.utils.json_to_sheet([sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, importEntity === 'students' ? 'Students' : 'Faculty');
    XLSX.writeFile(wb, `ACW_${importEntity}_import_template.${format}`);
  };

  const handleFileParse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRawFileName(file.name);
    setImportResult(null);
    setImportError(null);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      if (json.length === 0) {
        setRawHeaders([]);
        setRawRows([]);
        setImportError('The uploaded file does not contain any data rows.');
        return;
      }

      const headers = Object.keys(json[0]);
      setRawHeaders(headers);
      setRawRows(json);

      // Auto-map matching headers
      const autoMap: Record<string, string> = {};
      for (const target of targetFields) {
        const normTarget = target.key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const match = headers.find(
          (h) =>
            h.toLowerCase().replace(/[^a-z0-9]/g, '') === normTarget ||
            h.toLowerCase().includes(target.key.split('_')[0])
        );
        if (match) autoMap[target.key] = match;
      }
      setColumnMap(autoMap);
    } catch (err) {
      setRawHeaders([]);
      setRawRows([]);
      setImportError(err instanceof Error ? err.message : 'Unable to parse file. Please upload a valid .csv, .xlsx, or .xls file.');
    }
  };

  const mappedPreviewRows = rawRows.map((row, idx) => {
    const mapped: Record<string, unknown> = {};
    for (const tf of targetFields) {
      const srcCol = columnMap[tf.key];
      mapped[tf.key] = srcCol ? row[srcCol] : '';
    }
    const primaryKey = String(
      importEntity === 'students' ? mapped.registration_number || '' : mapped.employee_id || ''
    ).trim();
    const name = String(mapped.full_name || '').trim();
    const dept = String(mapped.department || '').trim();
    const isDuplicate = primaryKey
      ? importEntity === 'students'
        ? existingRegs.has(primaryKey.toUpperCase())
        : existingFacultyIds.has(primaryKey.toUpperCase())
      : false;
    const requiredIdField = importEntity === 'students' ? 'registration_number' : 'employee_id';
    const missingFields = [
      !primaryKey && requiredIdField,
      !name && 'full_name',
      !dept && 'department',
      ...(importEntity === 'faculty'
        ? [
            !String(mapped.email || '').trim() && 'email',
            !String(mapped.qualification || '').trim() && 'qualification',
          ]
        : []),
    ].filter(Boolean) as string[];
    return { rowNumber: idx + 1, primaryKey, mapped, isDuplicate, missingFields };
  });

  const handleExecuteImport = async () => {
    if (mappedPreviewRows.length === 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const endpoint = importEntity === 'students' ? '/api/import/students' : '/api/import/faculty';
      const res = await apiFetch<{
        importedRows: number;
        skippedRows: number;
        errors: Array<{ row: number; registration_number?: string; employee_id?: string; reason: string }>;
      }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          fileName: rawFileName,
          rows: mappedPreviewRows.map((r) => r.mapped),
        }),
      });
      setImportResult(res);
      await Promise.all([loadImportMeta(), loadAnalytics()]);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Bulk import failed. Please verify your data and try again.');
    } finally {
      setImporting(false);
    }
  };

  const generateCustomInstitutionalReport = (format: 'pdf' | 'excel' | 'csv') => {
    if (!analytics) return;
    const cfg = {
      title: 'Comprehensive Institutional Performance Report',
      subtitle: 'Akhuwat College for Women, Chakwal — Executive Analytics',
      period: yearFilter === 'all' ? 'All Batches (2023-2026)' : `Batch ${yearFilter}`,
      generatedBy: user.full_name,
      summaryPairs: [
        { label: 'Departments Analyzed', value: analytics.departmentComparison.length },
        { label: 'Total Enrolled', value: analytics.departmentComparison.reduce((a, b) => a + b.students, 0) },
        { label: 'Total Faculty', value: analytics.departmentComparison.reduce((a, b) => a + b.faculty, 0) },
      ],
      columns: ['Dept Code', 'Department Name', 'Enrolled Students', 'Faculty', 'Avg CGPA', 'Attendance %'],
      rows: analytics.departmentComparison.map((d) => [
        d.code,
        d.name,
        d.students,
        d.faculty,
        d.avgCgpa != null ? d.avgCgpa.toFixed(2) : 'Unrecorded',
        d.attendancePct != null ? `${d.attendancePct}%` : 'Unrecorded',
      ]),
      fileName: `ACW_Institutional_Report_${new Date().toISOString().slice(0, 10)}`,
    };
    if (format === 'pdf') exportToPdf(cfg);
    if (format === 'excel') exportToExcel(cfg);
    if (format === 'csv') exportToCsv(cfg);
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#07111F] rounded-lg">
          <button
            type="button"
            onClick={() => setTab('analytics')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === 'analytics' ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
          >
            Visual Analytics Center
          </button>
          <button
            type="button"
            onClick={() => setTab('reports')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === 'reports' ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
          >
            Report Generator (PDF / Excel / CSV)
          </button>
          {canImport && (
            <button
              type="button"
              onClick={() => setTab('import')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === 'import' ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Data Import & Export Center
            </button>
          )}
        </div>

        {tab === 'analytics' && (
          <div className="flex items-center gap-2">
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
              <option value="all">All Admission Years</option>
              {[2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>Batch {y}</option>)}
            </select>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
              <option value="all">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ANALYTICS CHARTS */}
      {tab === 'analytics' && (
        analyticsError ? (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {analyticsError}
            </span>
            <button
              type="button"
              onClick={loadAnalytics}
              className="px-3 py-1 rounded border border-red-300 dark:border-red-800 font-semibold"
            >
              Retry
            </button>
          </div>
        ) : loading || !analytics ? (
          <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#C59B27]" />
            <span>Computing institutional analytics...</span>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold mb-3">Student Enrollment Trends by Batch</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.enrollmentByYear}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="batch" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" name="Students" stroke="#0B1F3A" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold mb-3">CGPA Distribution Across Cohort</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.cgpaDistribution} dataKey="count" nameKey="band" cx="50%" cy="50%" innerRadius={48} outerRadius={85} label>
                      {analytics.cgpaDistribution.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold mb-3">Department Comparison (Students vs Avg CGPA)</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.departmentComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="students" name="Students" fill="#0B1F3A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="avgCgpa" name="Avg CGPA" fill="#C59B27" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold mb-3">Student Achievements by Category</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.achievementAnalysis} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                    <YAxis dataKey="category" type="category" width={100} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Achievements" fill="#C59B27" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold mb-3">Event Participation & Activity Volume</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.eventParticipation}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="events" name="Events" fill="#0B1F3A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="participants" name="Recorded Participants" fill="#C59B27" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold mb-3">Resource Utilization (Available vs Total Units)</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.resourceUtilization}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="total" name="Total Units" fill="#0B1F3A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="available" name="Available Units" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      )}

      {/* REPORT GENERATOR */}
      {tab === 'reports' && (
        <div className="p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 space-y-5">
          <div>
            <h3 className="text-base font-semibold">Institutional Report Generation Center</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Download formatted PDF dossiers with Akhuwat College for Women, Chakwal branding, structured Excel workbooks, or raw CSV datasets.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => generateCustomInstitutionalReport('pdf')}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#C59B27] text-left space-y-2 transition-colors"
            >
              <FileText className="w-6 h-6 text-[#0B1F3A] dark:text-[#E5BA41]" />
              <div className="text-sm font-semibold">Download Branded PDF Report</div>
              <div className="text-xs text-slate-500">Navy & Gold institutional header, summary KPIs, and department metrics table.</div>
            </button>
            <button
              type="button"
              onClick={() => generateCustomInstitutionalReport('excel')}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#C59B27] text-left space-y-2 transition-colors"
            >
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
              <div className="text-sm font-semibold">Download Excel Workbook (.xlsx)</div>
              <div className="text-xs text-slate-500">Multi-row formatted institutional sheet ready for Academic Council review.</div>
            </button>
            <button
              type="button"
              onClick={() => generateCustomInstitutionalReport('csv')}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#C59B27] text-left space-y-2 transition-colors"
            >
              <Download className="w-6 h-6 text-slate-600 dark:text-slate-300" />
              <div className="text-sm font-semibold">Download Raw CSV Dataset</div>
              <div className="text-xs text-slate-500">Clean UTF-8 comma-separated dataset for external statistical analysis.</div>
            </button>
          </div>
        </div>
      )}

      {/* DATA IMPORT & EXPORT CENTER */}
      {tab === 'import' && canImport && (
        <div className="space-y-6">
          {importError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          <div className="p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-base font-semibold">
                    {importEntity === 'students' ? 'Student Bulk Import' : 'Faculty Bulk Import'} (CSV / Excel .xlsx)
                  </h3>
                  <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-[#07111F] border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleEntitySwitch('students')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                        importEntity === 'students'
                          ? 'bg-white dark:bg-[#162944] text-[#0B1F3A] dark:text-white shadow-sm'
                          : 'text-slate-500'
                      }`}
                    >
                      Students
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEntitySwitch('faculty')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                        importEntity === 'faculty'
                          ? 'bg-white dark:bg-[#162944] text-[#0B1F3A] dark:text-white shadow-sm'
                          : 'text-slate-500'
                      }`}
                    >
                      Faculty
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Validates required fields, detects duplicate {importEntity === 'students' ? 'registration numbers' : 'employee IDs'}, highlights missing values, and saves imported records as verified institutional entries.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSampleTemplate('csv')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV Template
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSampleTemplate('xlsx')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Excel Template
                </button>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] text-xs font-semibold cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Select CSV or Excel File</span>
                  <input key={importEntity} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileParse} className="hidden" />
                </label>
              </div>
            </div>

            {rawHeaders.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Step 1 · Map Columns from "{rawFileName}" ({rawRows.length} rows detected)
                </div>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {targetFields.map((tf) => (
                    <div key={tf.key}>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">{tf.label}</label>
                      <select
                        value={columnMap[tf.key] || ''}
                        onChange={(e) => setColumnMap((prev) => ({ ...prev, [tf.key]: e.target.value }))}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                      >
                        <option value="">— Unmapped —</option>
                        {rawHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 pt-2">
                  Step 2 · Validation Preview (Duplicates & Missing Values Flagged)
                </div>
                <div className="max-h-64 overflow-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-[#0B1729]">
                      <tr>
                        <th className="py-2 px-3">Row</th>
                        <th className="py-2 px-3">{importEntity === 'students' ? 'Reg No.' : 'Employee ID'}</th>
                        <th className="py-2 px-3">Full Name</th>
                        <th className="py-2 px-3">Department</th>
                        <th className="py-2 px-3">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {mappedPreviewRows.slice(0, 30).map((r) => (
                        <tr key={r.rowNumber}>
                          <td className="py-2 px-3 font-mono-tabular">{r.rowNumber}</td>
                          <td className="py-2 px-3 font-mono-tabular">{r.primaryKey || '—'}</td>
                          <td className="py-2 px-3">{String(r.mapped.full_name || '—')}</td>
                          <td className="py-2 px-3">{String(r.mapped.department || '—')}</td>
                          <td className="py-2 px-3">
                            {r.isDuplicate ? (
                              <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                                <AlertCircle className="w-3.5 h-3.5" /> Duplicate {importEntity === 'students' ? 'Reg No.' : 'Employee ID'}
                              </span>
                            ) : r.missingFields.length > 0 ? (
                              <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                <AlertCircle className="w-3.5 h-3.5" /> Missing: {r.missingFields.join(', ')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleExecuteImport}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] disabled:opacity-50"
                  >
                    {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {importing ? 'Importing Validated Rows...' : `Commit Import (${rawRows.length} Rows)`}
                  </button>
                </div>
              </div>
            )}

            {importResult && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#07111F] border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                <div className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Import Summary: {importResult.importedRows} Imported · {importResult.skippedRows} Skipped / Errors</span>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 text-red-600 dark:text-red-400">
                    {importResult.errors.map((er, i) => (
                      <div key={i}>Row {er.row} ({er.registration_number || er.employee_id || 'Unknown'}): {er.reason}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-sm font-semibold flex items-center justify-between">
              <span>Import Audit History</span>
              {loadingImportMeta && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C59B27]" />}
            </div>
            {importHistory.length === 0 ? (
              <div className="p-6"><EmptyState title="No Imports Recorded Yet" description="Upload a CSV or Excel dataset above to log import history." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-[#0B1729]">
                    <tr>
                      <th className="py-2.5 px-4">Entity</th>
                      <th className="py-2.5 px-4">File Name</th>
                      <th className="py-2.5 px-4">Rows (Imported / Total)</th>
                      <th className="py-2.5 px-4">Errors</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Imported By</th>
                      <th className="py-2.5 px-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {importHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2.5 px-4 uppercase font-semibold text-[11px] text-[#0B1F3A] dark:text-[#E5BA41]">{h.entity_type}</td>
                        <td className="py-2.5 px-4 font-medium">{h.file_name}</td>
                        <td className="py-2.5 px-4 font-mono-tabular">{h.imported_rows} / {h.total_rows}</td>
                        <td className="py-2.5 px-4 font-mono-tabular">{h.error_count}</td>
                        <td className="py-2.5 px-4">{h.status}</td>
                        <td className="py-2.5 px-4">{h.imported_by_name || 'Admin'}</td>
                        <td className="py-2.5 px-4 font-mono-tabular text-slate-500">{h.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
