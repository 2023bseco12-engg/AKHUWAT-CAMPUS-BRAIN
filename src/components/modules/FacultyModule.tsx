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
import type { AuthUser, Department, Faculty } from '../../types/index.ts';
import { apiFetch, uploadFile } from '../../utils/api.ts';
import { exportToCsv, exportToExcel, exportToPdf } from '../../utils/reports.ts';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { SafeImage } from '../ui/SafeImage.tsx';
import { BulkImportModal, type ImportFieldSpec } from '../ui/BulkImportModal.tsx';

interface FacultyModuleProps {
  user: AuthUser;
}

const emptyForm = {
  employee_id: '',
  full_name: '',
  email: '',
  phone: '',
  photo_url: '',
  department_id: '',
  designation: 'Lecturer',
  qualification: '',
  specialization: '',
  subjects_taught: '',
  experience_years: 1,
  joining_date: new Date().toISOString().slice(0, 10),
  responsibilities: '',
  status: 'Active',
};

const FACULTY_IMPORT_FIELDS: ImportFieldSpec[] = [
  { key: 'employee_id', label: 'Employee ID', required: true },
  { key: 'full_name', label: 'Full Name', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'department', label: 'Department Code/Name', required: true },
  { key: 'designation', label: 'Designation', required: true },
  { key: 'qualification', label: 'Qualification', required: true },
  { key: 'specialization', label: 'Specialization' },
  { key: 'subjects_taught', label: 'Subjects Taught' },
  { key: 'experience_years', label: 'Experience (Years)' },
  { key: 'joining_date', label: 'Joining Date (YYYY-MM-DD)' },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status' },
];

export function FacultyModule({ user }: FacultyModuleProps) {
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [originFilter, setOriginFilter] = useState('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<Faculty | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Faculty | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (deptFilter !== 'all') qs.set('departmentId', deptFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (originFilter !== 'all') qs.set('origin', originFilter);
      const [fRes, dRes] = await Promise.all([
        apiFetch<{ faculty: Faculty[] }>(`/api/faculty?${qs.toString()}`),
        apiFetch<{ departments: Department[] }>('/api/departments'),
      ]);
      setFaculty(fRes.faculty);
      setDepartments(dRes.departments);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Failed to load faculty directory from database.');
    } finally {
      setLoading(false);
    }
  }, [search, deptFilter, statusFilter, originFilter]);

  useEffect(() => {
    const t = setTimeout(loadData, 150);
    return () => clearTimeout(t);
  }, [loadData]);

  const existingEmpIds = useMemo(
    () => new Set(faculty.map((f) => f.employee_id.toUpperCase())),
    [faculty]
  );

  const hasActiveFilters =
    search.trim() !== '' || deptFilter !== 'all' || statusFilter !== 'all' || originFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setDeptFilter('all');
    setStatusFilter('all');
    setOriginFilter('all');
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, department_id: departments[0] ? String(departments[0].id) : '' });
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (f: Faculty) => {
    setEditingId(f.id);
    setForm({
      employee_id: f.employee_id,
      full_name: f.full_name,
      email: f.email,
      phone: f.phone || '',
      photo_url: f.photo_url || '',
      department_id: String(f.department_id),
      designation: f.designation,
      qualification: f.qualification,
      specialization: f.specialization || '',
      subjects_taught: f.subjects_taught || '',
      experience_years: f.experience_years,
      joining_date: f.joining_date,
      responsibilities: f.responsibilities || '',
      status: f.status,
    });
    setError(null);
    setFormOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Portrait file must be 5 MB or smaller.');
      return;
    }
    setUploadingPhoto(true);
    setError(null);
    try {
      const up = await uploadFile(file);
      setForm((p) => ({ ...p, photo_url: up.url }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload portrait image.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const validateForm = (): string | null => {
    if (form.employee_id.trim().length < 3) {
      return 'Employee ID must be at least 3 characters (e.g. FAC-ACW-015).';
    }
    if (form.full_name.trim().length < 2) {
      return 'Full name must be at least 2 characters.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Please enter a valid institutional email address.';
    }
    if (!form.department_id) {
      return 'Please select a department.';
    }
    if (form.designation.trim().length < 2) {
      return 'Designation is required.';
    }
    if (form.qualification.trim().length < 2) {
      return 'Academic qualification is required.';
    }
    if (form.experience_years < 0 || Number.isNaN(form.experience_years)) {
      return 'Experience years must be 0 or greater.';
    }
    return null;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validateForm();
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        employee_id: form.employee_id.trim(),
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        designation: form.designation.trim(),
        qualification: form.qualification.trim(),
        specialization: form.specialization.trim(),
        subjects_taught: form.subjects_taught.trim(),
        responsibilities: form.responsibilities.trim(),
        department_id: Number(form.department_id),
        experience_years: Number(form.experience_years),
      };
      if (editingId) {
        await apiFetch(`/api/faculty/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setNotice(`Updated faculty profile for ${payload.full_name}.`);
      } else {
        await apiFetch('/api/faculty', { method: 'POST', body: JSON.stringify(payload) });
        setNotice(`Added faculty member ${payload.full_name} (${payload.employee_id}).`);
      }
      setFormOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save faculty member.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setPageError(null);
    try {
      await apiFetch(`/api/faculty/${deleteTarget.id}`, { method: 'DELETE' });
      setNotice(`Removed faculty record: ${deleteTarget.full_name} (${deleteTarget.employee_id}).`);
      setDeleteTarget(null);
      await loadData();
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Unable to remove faculty record.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const reportConfig = () => ({
    title: 'Faculty & Academic Staff Directory',
    subtitle: `Akhuwat College for Women, Chakwal (${faculty.length} records)`,
    period: 'Academic Year 2026-2027',
    generatedBy: user.full_name,
    summaryPairs: [
      { label: 'Total Faculty', value: faculty.length },
      { label: 'Active Members', value: faculty.filter((f) => f.status === 'Active').length },
      {
        label: 'Avg Experience',
        value:
          faculty.length > 0
            ? `${(faculty.reduce((acc, f) => acc + f.experience_years, 0) / faculty.length).toFixed(1)} yrs`
            : 'N/A',
      },
    ],
    columns: ['Employee ID', 'Name', 'Department', 'Designation', 'Qualification', 'Email', 'Exp (Yrs)', 'Joining Date', 'Status'],
    rows: faculty.map((f) => [
      f.employee_id,
      f.full_name,
      f.department_code || '',
      f.designation,
      f.qualification,
      f.email,
      f.experience_years,
      f.joining_date,
      f.status,
    ]),
    fileName: `ACW_Faculty_${new Date().toISOString().slice(0, 10)}`,
  });

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
          <button type="button" onClick={loadData} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, specialization, subjects..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#07111F]"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter faculty by department"
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter faculty by status"
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Statuses</option>
            <option value="Active">Active</option>
            <option value="On Leave">On Leave</option>
            <option value="Retired">Retired</option>
          </select>
          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value)}
            aria-label="Filter faculty by record origin"
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
            Showing <span className="font-mono-tabular font-semibold text-slate-800 dark:text-slate-200">{faculty.length}</span> faculty member{faculty.length === 1 ? '' : 's'}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportToCsv(reportConfig())}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944]"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => exportToExcel(reportConfig())}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>
            <button
              type="button"
              onClick={() => exportToPdf(reportConfig())}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944]"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#C59B27] text-[#0B1F3A] dark:text-[#E5BA41] hover:bg-[#C59B27]/10"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import CSV / Excel
                </button>
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Faculty
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading faculty directory...</span>
        </div>
      ) : faculty.length === 0 ? (
        <EmptyState
          title="No Faculty Members Found"
          description="Try clearing your search filter or add a new faculty profile."
          actionLabel={canManage ? 'Add Faculty Member' : undefined}
          onAction={canManage ? openCreate : undefined}
        />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {faculty.map((f) => (
            <div
              key={f.id}
              className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                  <SafeImage
                    src={f.photo_url}
                    alt={f.full_name}
                    className="w-full h-full object-cover"
                    fallbackIcon={<User className="w-5 h-5" />}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {f.full_name}
                    </div>
                    {f.is_demo === 1 && (
                      <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                        DEMO
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#0B1F3A] dark:text-[#E5BA41] font-medium truncate">
                    {f.designation}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular mt-0.5">
                    {f.employee_id} · {f.department_code} · {f.status}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <div className="truncate">Qualification: {f.qualification}</div>
                <div className="truncate">Specialization: {f.specialization || '—'}</div>
                <div className="truncate">Subjects: {f.subjects_taught || '—'}</div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                  {f.experience_years} yrs exp · Joined {f.joining_date}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewTarget(f)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="View profile"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(f)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(f)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit Faculty Profile' : 'Add Faculty Member'}
        subtitle="Akhuwat College for Women, Chakwal — Faculty & Staff Directory"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Employee ID *</label>
              <input
                type="text"
                required
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                placeholder="FAC-ACW-015"
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
              <label className="block text-xs font-medium mb-1">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@acw.edu.pk"
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
              <label className="block text-xs font-medium mb-1">Department *</label>
              <select
                required
                value={form.department_id}
                onChange={(e) => setForm({ ...form, department_id: e.target.value })}
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
              <label className="block text-xs font-medium mb-1">Designation *</label>
              <input
                type="text"
                required
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Qualification *</label>
              <input
                type="text"
                required
                value={form.qualification}
                onChange={(e) => setForm({ ...form, qualification: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Specialization</label>
              <input
                type="text"
                value={form.specialization}
                onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Experience (Years)</label>
              <input
                type="number"
                min={0}
                value={form.experience_years}
                onChange={(e) => setForm({ ...form, experience_years: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] font-mono-tabular"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">Joining Date</label>
                <input
                  type="date"
                  value={form.joining_date}
                  onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                >
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Retired">Retired</option>
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Subjects Taught</label>
              <input
                type="text"
                value={form.subjects_taught}
                onChange={(e) => setForm({ ...form, subjects_taught: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Institutional Responsibilities</label>
              <input
                type="text"
                value={form.responsibilities}
                onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-4">
              {form.photo_url && (
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                  <SafeImage src={form.photo_url} alt="Faculty preview" className="w-full h-full object-cover" />
                </div>
              )}
              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#162944]">
                {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{uploadingPhoto ? 'Uploading...' : form.photo_url ? 'Replace Portrait Photo' : 'Upload Portrait Photo'}</span>
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhoto} />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingPhoto}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Saving...' : 'Save Faculty Record'}
            </button>
          </div>
        </form>
      </Modal>

      {canManage && (
        <BulkImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          entityType="faculty"
          title="Import Faculty Directory (CSV / Excel)"
          subtitle="Upload a CSV or Excel (.xlsx) sheet to add faculty profiles directly to the persistent database."
          fields={FACULTY_IMPORT_FIELDS}
          existingKeys={existingEmpIds}
          duplicateKeyField="employee_id"
          duplicateKeyLabel="Employee ID"
          templateFileName="ACW_Faculty_Import_Template"
          sampleRows={[
            [
              'FAC-ACW-050',
              'Dr. Ayesha Noor',
              'ayesha.noor@acw.edu.pk',
              'BS-CS',
              'Assistant Professor',
              'Ph.D. Computer Science',
              'Cybersecurity',
              'Information Security, Computer Networks',
              6,
              '2026-09-01',
              '+92-300-5119050',
              'Active',
            ],
          ]}
          onSuccess={async () => {
            setNotice('Bulk faculty import completed and saved to database.');
            await loadData();
          }}
        />
      )}

      <Modal
        open={Boolean(viewTarget)}
        onClose={() => setViewTarget(null)}
        title={viewTarget?.full_name || ''}
        subtitle={viewTarget ? `${viewTarget.designation} · ${viewTarget.department_name}` : ''}
      >
        {viewTarget && (
          <div className="space-y-3 text-xs">
            <div><span className="font-semibold">Employee ID:</span> <span className="font-mono-tabular">{viewTarget.employee_id}</span></div>
            <div><span className="font-semibold">Status:</span> {viewTarget.status}</div>
            <div><span className="font-semibold">Qualification:</span> {viewTarget.qualification}</div>
            <div><span className="font-semibold">Specialization:</span> {viewTarget.specialization || '—'}</div>
            <div><span className="font-semibold">Subjects Taught:</span> {viewTarget.subjects_taught || '—'}</div>
            <div><span className="font-semibold">Responsibilities:</span> {viewTarget.responsibilities || '—'}</div>
            <div><span className="font-semibold">Contact:</span> {viewTarget.email} · {viewTarget.phone || '—'}</div>
            <div><span className="font-semibold">Joining Date:</span> {viewTarget.joining_date} ({viewTarget.experience_years} years experience)</div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Faculty Record"
        message={`Confirm removal of ${deleteTarget?.full_name} (${deleteTarget?.employee_id}) from the institutional faculty registry?`}
      />
    </div>
  );
}
