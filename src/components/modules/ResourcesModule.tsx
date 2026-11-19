import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, FileText, Plus, Trash2 } from 'lucide-react';
import type { AuthUser, CampusResource } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { exportToPdf } from '../../utils/reports.ts';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

const RESOURCE_CATEGORIES = [
  'Classrooms',
  'Laboratories',
  'Computers',
  'Library books',
  'Furniture',
  'Equipment',
  'Office resources',
];

export function ResourcesModule({ user }: { user: AuthUser }) {
  const [resources, setResources] = useState<CampusResource[]>([]);
  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    resource_code: '',
    name: '',
    category: 'Computers',
    location: '',
    quantity: 1,
    available_quantity: 1,
    condition_status: 'Operational',
    last_maintenance_date: new Date().toISOString().slice(0, 10),
    next_maintenance_date: '',
    maintenance_notes: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<CampusResource | null>(null);

  const canManage = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (catFilter !== 'all') qs.set('category', catFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      const res = await apiFetch<{ resources: CampusResource[] }>(`/api/resources?${qs.toString()}`);
      setResources(res.resources);
    } finally {
      setLoading(false);
    }
  }, [catFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      resource_code: '',
      name: '',
      category: 'Computers',
      location: '',
      quantity: 1,
      available_quantity: 1,
      condition_status: 'Operational',
      last_maintenance_date: new Date().toISOString().slice(0, 10),
      next_maintenance_date: '',
      maintenance_notes: '',
    });
    setFormOpen(true);
  };

  const openEdit = (r: CampusResource) => {
    setEditingId(r.id);
    setForm({
      resource_code: r.resource_code,
      name: r.name,
      category: r.category,
      location: r.location,
      quantity: r.quantity,
      available_quantity: r.available_quantity,
      condition_status: r.condition_status,
      last_maintenance_date: r.last_maintenance_date || '',
      next_maintenance_date: r.next_maintenance_date || '',
      maintenance_notes: r.maintenance_notes || '',
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await apiFetch(`/api/resources/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await apiFetch('/api/resources', { method: 'POST', body: JSON.stringify(form) });
    }
    setFormOpen(false);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiFetch(`/api/resources/${deleteTarget.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
            <option value="all">All Resource Categories</option>
            {RESOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
            <option value="all">All Condition Statuses</option>
            <option value="Operational">Operational</option>
            <option value="Needs Maintenance">Needs Maintenance</option>
            <option value="Under Repair">Under Repair</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportToPdf({
                title: 'College Resources, Assets & Maintenance Inventory',
                generatedBy: user.full_name,
                columns: ['Code', 'Asset Name', 'Category', 'Location', 'Qty (Avail/Total)', 'Condition', 'Last Maintenance'],
                rows: resources.map((r) => [
                  r.resource_code,
                  r.name,
                  r.category,
                  r.location,
                  `${r.available_quantity}/${r.quantity}`,
                  r.condition_status,
                  r.last_maintenance_date || '—',
                ]),
                fileName: 'ACW_Resources_Inventory.pdf',
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <FileText className="w-3.5 h-3.5" />
            Inventory PDF
          </button>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Resource
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading campus inventory...</div>
        ) : resources.length === 0 ? (
          <div className="p-6"><EmptyState title="No Resources Found" description="Add campus classrooms, labs, books, or equipment." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-[#0B1729] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Resource / Asset</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4 text-right">Available / Total</th>
                  <th className="py-3 px-4">Condition</th>
                  <th className="py-3 px-4">Maintenance Notes</th>
                  {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {resources.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 px-4 font-mono-tabular">{r.resource_code}</td>
                    <td className="py-3 px-4 font-semibold">{r.name}</td>
                    <td className="py-3 px-4">{r.category}</td>
                    <td className="py-3 px-4">{r.location}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular">{r.available_quantity} / {r.quantity}</td>
                    <td className="py-3 px-4 font-medium">
                      <span className={r.condition_status === 'Operational' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                        {r.condition_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{r.maintenance_notes || '—'}</td>
                    {canManage && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button type="button" onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(r)} className="p-1.5 rounded text-red-600 hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Update Campus Resource' : 'Add Campus Resource'}>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Resource Code *</label>
              <input type="text" required disabled={Boolean(editingId)} value={form.resource_code} onChange={(e) => setForm({ ...form, resource_code: e.target.value })} placeholder="RES-LAB-03" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                {RESOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Asset / Room Name *</label>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Location *</label>
            <input type="text" required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Total Quantity</label>
              <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Available</label>
              <input type="number" min={0} value={form.available_quantity} onChange={(e) => setForm({ ...form, available_quantity: Number(e.target.value) })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Condition</label>
              <select value={form.condition_status} onChange={(e) => setForm({ ...form, condition_status: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                <option value="Operational">Operational</option>
                <option value="Needs Maintenance">Needs Maintenance</option>
                <option value="Under Repair">Under Repair</option>
                <option value="Retired">Retired</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Maintenance Notes</label>
            <input type="text" value={form.maintenance_notes} onChange={(e) => setForm({ ...form, maintenance_notes: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">Save Resource</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Resource"
        message={`Remove ${deleteTarget?.name} (${deleteTarget?.resource_code}) from campus inventory?`}
      />
    </div>
  );
}
