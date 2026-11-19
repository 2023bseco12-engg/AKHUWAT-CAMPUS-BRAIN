import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Folder, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { ArchiveDocument, AuthUser } from '../../types/index.ts';
import { apiFetch, uploadFile } from '../../utils/api.ts';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { SafeImage } from '../ui/SafeImage.tsx';

const ARCHIVE_CATEGORIES = [
  'College history',
  'Previous batches',
  'Institutional milestones',
  'Historical photographs',
  'Important documents',
  'Annual reports',
  'College publications',
  'Certificates',
  'Event memories',
  'Important announcements',
];

export function DigitalArchiveModule({ user }: { user: AuthUser }) {
  const [docs, setDocs] = useState<ArchiveDocument[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [folderFilter, setFolderFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    folder: 'Institutional Heritage',
    category: 'Important documents',
    year_label: '2026',
    description: '',
    file_url: '',
    file_name: '',
    file_type: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<ArchiveDocument | null>(null);

  const canManage = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (folderFilter !== 'all') qs.set('folder', folderFilter);
      if (catFilter !== 'all') qs.set('category', catFilter);
      if (search.trim()) qs.set('search', search.trim());
      const res = await apiFetch<{ documents: ArchiveDocument[]; folders: Array<{ folder: string }> }>(`/api/archive?${qs.toString()}`);
      setDocs(res.documents);
      setFolders(res.folders.map((f) => f.folder));
    } finally {
      setLoading(false);
    }
  }, [folderFilter, catFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const up = await uploadFile(file);
    setForm((p) => ({ ...p, file_url: up.url, file_name: up.fileName, file_type: up.mimeType }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/archive', { method: 'POST', body: JSON.stringify(form) });
    setFormOpen(false);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiFetch(`/api/archive/${deleteTarget.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search archive records..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#07111F]"
            />
          </div>
          <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
            <option value="all">All Folders</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
            <option value="all">All Archive Categories</option>
            {ARCHIVE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
          >
            <Plus className="w-3.5 h-3.5" />
            Archive Document
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading digital archive...</div>
      ) : docs.length === 0 ? (
        <EmptyState title="Archive Repository Empty" description="Upload institutional heritage photos, annual reports, or publications." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {docs.map((doc) => {
            const isImage = doc.file_type?.startsWith('image/') || doc.file_url?.endsWith('.jpg') || doc.file_url?.endsWith('.png');
            return (
              <div key={doc.id} className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="aspect-[16/9] bg-slate-100 dark:bg-[#07111F] overflow-hidden">
                    {isImage && doc.file_url ? (
                      <SafeImage src={doc.file_url} alt={doc.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0B1F3A] to-[#173660] text-[#E5BA41] p-4 text-center">
                        <Archive className="w-7 h-7 mb-1.5" />
                        <div className="text-xs font-medium text-white truncate max-w-full">{doc.file_name || doc.category}</div>
                      </div>
                    )}
                  </div>
                  <div className="p-5 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#0B1F3A] dark:text-[#E5BA41]">
                      <Folder className="w-3 h-3" />
                      <span>{doc.folder} · {doc.category} · {doc.year_label}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{doc.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">{doc.description}</p>
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 truncate">By {doc.uploaded_by_name || 'Administration'}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#0B1F3A] dark:text-[#E5BA41] hover:underline"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Open File
                      </a>
                    )}
                    {canManage && (
                      <button type="button" onClick={() => setDeleteTarget(doc)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Upload to College Digital Archive">
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Document / Milestone Title *</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Folder</label>
              <input type="text" value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                {ARCHIVE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Year *</label>
              <input type="text" required value={form.year_label} onChange={(e) => setForm({ ...form, year_label: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div>
            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{form.file_name ? `Attached: ${form.file_name}` : 'Upload Document or Photograph'}</span>
              <input type="file" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">Archive Item</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Archive Item"
        message={`Permanently remove "${deleteTarget?.title}" from the Digital Archive?`}
      />
    </div>
  );
}
