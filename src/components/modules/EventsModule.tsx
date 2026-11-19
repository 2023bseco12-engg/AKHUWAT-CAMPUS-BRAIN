import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, FileText, Plus, Trash2, Upload, Users } from 'lucide-react';
import type { AuthUser, CampusEvent, Department } from '../../types/index.ts';
import { apiFetch, uploadFile } from '../../utils/api.ts';
import { exportToPdf } from '../../utils/reports.ts';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { SafeImage } from '../ui/SafeImage.tsx';

const EVENT_CATEGORIES = [
  'Seminars',
  'Workshops',
  'Entrepreneurship sessions',
  'Competitions',
  'Academic events',
  'Social activities',
  'Career development sessions',
];

export function EventsModule({ user }: { user: AuthUser }) {
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [catFilter, setCatFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'Seminars',
    event_date: new Date().toISOString().slice(0, 10),
    venue: 'Main Auditorium, Chakwal Campus',
    organizer: '',
    department_id: '',
    guest_speakers: '',
    description: '',
    outcomes: '',
    cover_image_url: '',
    status: 'Upcoming',
  });
  const [deleteTarget, setDeleteTarget] = useState<CampusEvent | null>(null);
  const [partEvent, setPartEvent] = useState<CampusEvent | null>(null);
  const [partName, setPartName] = useState('');
  const [partRole, setPartRole] = useState('Participant');

  const canManage = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'TEACHER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = catFilter !== 'all' ? `?category=${encodeURIComponent(catFilter)}` : '';
      const [eRes, dRes] = await Promise.all([
        apiFetch<{ events: CampusEvent[] }>(`/api/events${qs}`),
        apiFetch<{ departments: Department[] }>('/api/departments'),
      ]);
      setEvents(eRes.events);
      setDepartments(dRes.departments);
    } finally {
      setLoading(false);
    }
  }, [catFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const up = await uploadFile(file);
    setForm((p) => ({ ...p, cover_image_url: up.url }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/events', {
      method: 'POST',
      body: JSON.stringify({ ...form, department_id: form.department_id ? Number(form.department_id) : null }),
    });
    setFormOpen(false);
    await load();
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partEvent) return;
    await apiFetch(`/api/events/${partEvent.id}/participants`, {
      method: 'POST',
      body: JSON.stringify({ participant_name: partName, role: partRole, certificate_issued: true }),
    });
    setPartName('');
    setPartEvent(null);
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiFetch(`/api/events/${deleteTarget.id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    await load();
  };

  const exportEventsPdf = () => {
    exportToPdf({
      title: 'Institutional Events, Workshops & Activities Report',
      subtitle: 'Akhuwat College for Women, Chakwal',
      period: 'Academic Year 2026-2027',
      generatedBy: user.full_name,
      columns: ['Date', 'Event Title', 'Category', 'Venue', 'Organizer', 'Participants', 'Status'],
      rows: events.map((ev) => [
        ev.event_date,
        ev.title,
        ev.category,
        ev.venue,
        ev.organizer,
        ev.participant_count ?? 0,
        ev.status,
      ]),
      fileName: `ACW_Events_Report_${new Date().toISOString().slice(0, 10)}`,
    });
  };

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
          >
            <option value="all">All Event Categories</option>
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportEventsPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <FileText className="w-3.5 h-3.5" />
            Download Events Report PDF
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Event
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading events...</div>
      ) : events.length === 0 ? (
        <EmptyState title="No Events Found" description="Create a seminar, workshop, or academic event." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between">
              <div>
                <div className="aspect-[16/9] bg-slate-100 dark:bg-[#07111F] overflow-hidden">
                  <SafeImage
                    src={ev.cover_image_url}
                    alt={ev.title}
                    className="w-full h-full object-cover"
                    fallbackIcon={<CalendarDays className="w-6 h-6" />}
                    fallbackLabel={ev.category}
                  />
                </div>
                <div className="p-5 space-y-2">
                  <div className="text-[11px] font-medium text-[#0B1F3A] dark:text-[#E5BA41]">
                    {ev.category} · {ev.event_date} · {ev.status}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ev.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{ev.description}</p>
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5 pt-1">
                    <div>Venue: {ev.venue}</div>
                    <div>Organizer: {ev.organizer}</div>
                    {ev.guest_speakers && <div>Speakers: {ev.guest_speakers}</div>}
                    {ev.outcomes && <div className="text-emerald-700 dark:text-emerald-400">Outcome: {ev.outcomes}</div>}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-mono-tabular text-slate-500">{ev.participant_count ?? 0} Participants</span>
                <div className="flex items-center gap-2">
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setPartEvent(ev)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#0B1F3A] dark:text-[#E5BA41] hover:underline"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Add Participant
                    </button>
                  )}
                  {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(ev)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Create Campus Event / Workshop" maxWidthClass="max-w-2xl">
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Event Title *</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Event Date *</label>
              <input type="date" required value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Venue *</label>
              <input type="text" required value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Organizer *</label>
              <input type="text" required value={form.organizer} onChange={(e) => setForm({ ...form, organizer: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Department</label>
              <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                <option value="">College-Wide</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                <option value="Upcoming">Upcoming</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Guest Speakers</label>
            <input type="text" value={form.guest_speakers} onChange={(e) => setForm({ ...form, guest_speakers: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Outcomes</label>
            <input type="text" value={form.outcomes} onChange={(e) => setForm({ ...form, outcomes: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div>
            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{form.cover_image_url ? 'Image Uploaded' : 'Upload Event Photograph'}</span>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">Publish Event</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(partEvent)} onClose={() => setPartEvent(null)} title={`Record Participant — ${partEvent?.title || ''}`}>
        <form onSubmit={handleAddParticipant} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Participant Full Name *</label>
            <input type="text" required value={partName} onChange={(e) => setPartName(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Role</label>
            <input type="text" value={partRole} onChange={(e) => setPartRole(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPartEvent(null)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">Save Participant</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Event"
        message={`Remove "${deleteTarget?.title}" from the events registry?`}
      />
    </div>
  );
}
