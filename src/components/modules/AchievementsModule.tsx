import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Plus, Search, Trash2, Trophy } from 'lucide-react';
import type { Achievement, AuthUser, Student } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { exportToPdf } from '../../utils/reports.ts';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

const ACHIEVEMENT_CATEGORIES = [
  'Academic',
  'Competitions',
  'Leadership',
  'Volunteering',
  'Internships',
  'Research',
  'Sports',
  'Entrepreneurship',
  'Certifications',
  'Community service',
];

export function AchievementsModule({ user }: { user: AuthUser }) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    student_id: '',
    title: '',
    category: 'Academic',
    level: 'College',
    achievement_date: new Date().toISOString().slice(0, 10),
    issuing_organization: 'Akhuwat College for Women, Chakwal',
    description: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<Achievement | null>(null);

  const canAdd = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'TEACHER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (catFilter !== 'all') qs.set('category', catFilter);
      if (levelFilter !== 'all') qs.set('level', levelFilter);
      const [aRes, sRes] = await Promise.all([
        apiFetch<{ achievements: Achievement[] }>(`/api/achievements?${qs.toString()}`),
        user.role === 'STUDENT' ? Promise.resolve({ students: [] as Student[] }) : apiFetch<{ students: Student[] }>('/api/students'),
      ]);
      setAchievements(aRes.achievements);
      setStudents(sRes.students);
    } finally {
      setLoading(false);
    }
  }, [search, catFilter, levelFilter, user.role]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/achievements', {
      method: 'POST',
      body: JSON.stringify({ ...form, student_id: Number(form.student_id) }),
    });
    setFormOpen(false);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiFetch(`/api/achievements/${deleteTarget.id}`, { method: 'DELETE' });
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
              placeholder="Search student, award, org..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#07111F]"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Categories</option>
            {ACHIEVEMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Levels</option>
            <option value="College">College</option>
            <option value="Regional">Regional</option>
            <option value="National">National</option>
            <option value="International">International</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportToPdf({
                title: 'Student Achievements & Honors Archive',
                period: 'Institutional Cumulative Archive',
                generatedBy: user.full_name,
                columns: ['Date', 'Student', 'Reg No.', 'Achievement Title', 'Category', 'Level', 'Issuer'],
                rows: achievements.map((a) => [
                  a.achievement_date,
                  a.student_name || '',
                  a.registration_number || '',
                  a.title,
                  a.category,
                  a.level,
                  a.issuing_organization,
                ]),
                fileName: `ACW_Achievements_${new Date().toISOString().slice(0, 10)}`,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF
          </button>
          {canAdd && (
            <button
              type="button"
              onClick={() => {
                setForm({ ...form, student_id: students[0] ? String(students[0].id) : '' });
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
            >
              <Plus className="w-3.5 h-3.5" />
              Record Achievement
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading achievement archive...</div>
      ) : achievements.length === 0 ? (
        <EmptyState title="No Achievements Found" description="Adjust filters or record a student achievement." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {achievements.map((a) => (
            <div key={a.id} className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-lg bg-[#C59B27]/15 text-[#B4891A] dark:text-[#E5BA41] shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {a.category} · {a.level} · {a.achievement_date}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{a.title}</h3>
                  <div className="text-xs font-medium text-[#0B1F3A] dark:text-[#E5BA41] mt-1">
                    {a.student_name} ({a.registration_number} · {a.department_code})
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Issued by {a.issuing_organization}
                  </div>
                  {a.description && <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">{a.description}</p>}
                </div>
              </div>
              {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(a)}
                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Record Student Achievement">
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Student *</label>
            <select required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
              {students.map((s) => <option key={s.id} value={s.id}>{s.registration_number} — {s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Achievement Title *</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                {ACHIEVEMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Level</label>
              <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                <option value="College">College</option>
                <option value="Regional">Regional</option>
                <option value="National">National</option>
                <option value="International">International</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Date</label>
              <input type="date" required value={form.achievement_date} onChange={(e) => setForm({ ...form, achievement_date: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Issuing Organization *</label>
            <input type="text" required value={form.issuing_organization} onChange={(e) => setForm({ ...form, issuing_organization: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">Save Achievement</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Achievement"
        message={`Remove "${deleteTarget?.title}"?`}
      />
    </div>
  );
}
