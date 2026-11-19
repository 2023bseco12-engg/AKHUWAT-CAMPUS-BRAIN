import React, { useEffect, useState } from 'react';
import { Building2, Edit3, Plus, Trash2 } from 'lucide-react';
import type { AuthUser, Department } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

export function DepartmentsModule({ user }: { user: AuthUser }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    head_name: '',
    building_location: '',
    established_year: 2026,
    description: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ departments: Department[] }>('/api/departments');
      setDepartments(res.departments);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ code: '', name: '', head_name: '', building_location: '', established_year: 2026, description: '' });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditingId(d.id);
    setForm({
      code: d.code,
      name: d.name,
      head_name: d.head_name || '',
      building_location: d.building_location || '',
      established_year: d.established_year || 2020,
      description: d.description || '',
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiFetch(`/api/departments/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await apiFetch('/api/departments', { method: 'POST', body: JSON.stringify(form) });
      }
      setModalOpen(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save department.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/departments/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cannot delete department.');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Academic Departments & Schools
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enrollment, faculty strength, programs, and mean CGPA calculated live per department
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
          >
            <Plus className="w-3.5 h-3.5" />
            New Department
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading departments...</div>
      ) : departments.length === 0 ? (
        <EmptyState title="No Departments Configured" description="Create an academic department to begin." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {departments.map((d) => (
            <div
              key={d.id}
              className="p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-[#0B1F3A]/5 dark:bg-[#C59B27]/10 text-[#0B1F3A] dark:text-[#E5BA41]">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-mono-tabular font-semibold text-[#C59B27]">{d.code}</div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{d.name}</h3>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(d)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {user.role === 'SUPER_ADMIN' && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(d)}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">
                  {d.description || 'Undergraduate degree-granting department.'}
                </p>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Head: {d.head_name || 'Unassigned'} · {d.building_location || 'Main Campus'} · Est. {d.established_year || '—'}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                <div>
                  <div className="text-base font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
                    {d.student_count ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-500">Students</div>
                </div>
                <div>
                  <div className="text-base font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
                    {d.faculty_count ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-500">Faculty</div>
                </div>
                <div>
                  <div className="text-base font-bold font-mono-tabular text-slate-900 dark:text-slate-100">
                    {d.course_count ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-500">Courses</div>
                </div>
                <div>
                  <div className="text-base font-bold font-mono-tabular text-[#0B1F3A] dark:text-[#E5BA41]">
                    {d.avg_cgpa != null ? d.avg_cgpa.toFixed(2) : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500">Avg CGPA</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Department' : 'Create Department'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Code *</label>
              <input
                type="text"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="BS-PHY"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Established Year</label>
              <input
                type="number"
                value={form.established_year}
                onChange={(e) => setForm({ ...form, established_year: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Department Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Head of Department</label>
            <input
              type="text"
              value={form.head_name}
              onChange={(e) => setForm({ ...form, head_name: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Building / Wing</label>
            <input
              type="text"
              value={form.building_location}
              onChange={(e) => setForm({ ...form, building_location: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">
              Save Department
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Department"
        message={`Delete ${deleteTarget?.name}? This requires no students or faculty to remain assigned.`}
      />
    </div>
  );
}
