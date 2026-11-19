import React, { useEffect, useState } from 'react';
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
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Building2,
  CalendarDays,
  GraduationCap,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import type { AuthUser, ModuleKey } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { SafeImage } from '../ui/SafeImage.tsx';
import { Modal } from '../ui/Modal.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

interface OverviewPayload {
  kpis: {
    totalStudents: number;
    totalFaculty: number;
    totalDepartments: number;
    activePrograms: number;
    totalEvents: number;
    totalAchievements: number;
    avgCgpa: number | null;
    overallAttendance: number | null;
    lowAttendanceCount: number;
  };
  demoSummary?: {
    demoStudents: number;
    realStudents: number;
    demoFaculty: number;
    realFaculty: number;
    hasDemoData: boolean;
  };
  deptEnrollment: Array<{ code: string; name: string; students: number; avgCgpa: number | null; faculty: number }>;
  batchTrend: Array<{ batch: string; admission_year: number; enrolled: number; avgCgpa: number | null }>;
  attendanceTrend: Array<{ date: string; total: number; rate: number }>;
  recentEvents: Array<{ id: number; title: string; category: string; event_date: string; venue: string; status: string }>;
  announcements: Array<{ id: number; title: string; body: string; category: string; priority: string; event_date: string | null; created_at: string }>;
}

interface OverviewModuleProps {
  user: AuthUser;
  onNavigate: (module: ModuleKey) => void;
}

export function OverviewModule({ user, onNavigate }: OverviewModuleProps) {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [annOpen, setAnnOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annCat, setAnnCat] = useState('Academic');
  const [annPriority, setAnnPriority] = useState('Important');
  const [annError, setAnnError] = useState<string | null>(null);
  const [savingAnn, setSavingAnn] = useState(false);
  const [clearDemoOpen, setClearDemoOpen] = useState(false);
  const [clearingDemo, setClearingDemo] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<OverviewPayload>('/api/dashboard/overview');
      setData(res);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load institutional overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) {
      setAnnError('Announcement title and message are required.');
      return;
    }
    setSavingAnn(true);
    setAnnError(null);
    try {
      await apiFetch('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: annTitle.trim(),
          body: annBody.trim(),
          category: annCat,
          priority: annPriority,
          target_role: 'ALL',
        }),
      });
      setAnnTitle('');
      setAnnBody('');
      setAnnOpen(false);
      await loadOverview();
    } catch (err: unknown) {
      setAnnError(err instanceof Error ? err.message : 'Unable to publish announcement.');
    } finally {
      setSavingAnn(false);
    }
  };

  const handleClearDemoData = async () => {
    setClearingDemo(true);
    try {
      await apiFetch('/api/admin/clear-demo-data', { method: 'POST' });
      setClearDemoOpen(false);
      await loadOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to clear demonstration records.');
      setClearDemoOpen(false);
    } finally {
      setClearingDemo(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-44 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Unable to Load Institutional Overview"
        description={error || 'No institutional data was returned by the server.'}
        actionLabel="Retry Connection"
        onAction={loadOverview}
      />
    );
  }

  const { kpis, demoSummary } = data;
  const canPostAnnouncement = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'TEACHER';
  const canClearDemo = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const kpiCards = [
    { label: 'Enrolled Students', value: kpis.totalStudents, sub: `Active across ${kpis.totalDepartments} departments`, icon: Users, target: 'students' as ModuleKey },
    { label: 'Faculty Members', value: kpis.totalFaculty, sub: 'Professors, lecturers & labs', icon: GraduationCap, target: 'faculty' as ModuleKey },
    { label: 'Departments & Programs', value: `${kpis.totalDepartments} / ${kpis.activePrograms}`, sub: 'HEC-aligned degree tracks', icon: Building2, target: 'departments' as ModuleKey },
    { label: 'Overall Attendance', value: kpis.overallAttendance != null ? `${kpis.overallAttendance}%` : 'No data', sub: `${kpis.lowAttendanceCount} below 75% threshold`, icon: CalendarDays, target: 'attendance' as ModuleKey },
    { label: 'Institutional Avg CGPA', value: kpis.avgCgpa != null ? kpis.avgCgpa.toFixed(2) : 'No data', sub: 'Calculated from student records', icon: BookOpen, target: 'academics' as ModuleKey },
    { label: 'Events & Achievements', value: `${kpis.totalEvents} / ${kpis.totalAchievements}`, sub: 'Seminars, awards & milestones', icon: Trophy, target: 'achievements' as ModuleKey },
  ];

  return (
    <div className="space-y-6">
      {demoSummary?.hasDemoData && (
        <div className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Demonstration Dataset Active (Sample Records Tagged [DEMO])
              </div>
              <div className="text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                Database currently holds{' '}
                <span className="font-mono-tabular font-semibold">{demoSummary.realStudents}</span> real students &{' '}
                <span className="font-mono-tabular font-semibold">{demoSummary.realFaculty}</span> real faculty alongside{' '}
                <span className="font-mono-tabular font-semibold">{demoSummary.demoStudents}</span> demo students &{' '}
                <span className="font-mono-tabular font-semibold">{demoSummary.demoFaculty}</span> demo faculty.
              </div>
            </div>
          </div>
          {canClearDemo && (
            <button
              type="button"
              onClick={() => setClearDemoOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-[#0B1F3A] border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-[#132E54] whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Demo Data
            </button>
          )}
        </div>
      )}
      {/* Institutional Hero Banner */}
      <section className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0B1F3A] text-white">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-lg bg-white p-0.5 border border-[#C59B27] shrink-0 overflow-hidden">
                  <SafeImage
                    src="/assets/aistudio/image_92675513.png"
                    alt="Akhuwat Logo"
                    className="w-full h-full object-contain"
                    fallbackLabel="ACW"
                  />
                </div>
                <div className="text-xs font-medium text-[#E5BA41]">
                  Akhuwat College for Women, Chakwal · Fall 2026 Academic Session
                </div>
              </div>
              <h2 className="font-serif-institutional text-2xl sm:text-3xl font-bold mt-2 leading-snug">
                One College. One Digital Brain. Infinite Possibilities.
              </h2>
              <p className="text-sm text-slate-300 mt-2 max-w-2xl leading-relaxed">
                Welcome back, {user.full_name}. All institutional indicators, academic outcomes,
                attendance intelligence, and financial records below are computed live from your
                connected relational database.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => onNavigate('ai')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C59B27] hover:bg-[#d4a934] text-[#07111F] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                Ask AI Campus Brain
              </button>
              <button
                type="button"
                onClick={() => onNavigate('analytics')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/20 hover:bg-white/10 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Institutional Analytics
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="lg:col-span-5 p-4 flex flex-col justify-center">
            <div className="rounded-xl overflow-hidden border border-[#C59B27]/50 bg-[#07111F] shadow-lg">
              <div className="aspect-[16/10] w-full overflow-hidden">
                <SafeImage
                  src="/assets/aistudio/image_1b288e46.png"
                  alt="Akhuwat College for Women Chakwal Campus — Shahbaz Khatoon Block"
                  className="w-full h-full object-cover object-center"
                />
              </div>
              <div className="px-3 py-1.5 bg-[#07111F] border-t border-[#C59B27]/30 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#E5BA41]">Shahbaz Khatoon Block</span>
                <span className="text-slate-300">Chakwal Campus</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live KPI Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => onNavigate(card.target)}
              className="text-left p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 hover:border-[#C59B27] dark:hover:border-[#C59B27] transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {card.label}
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1.5 font-mono-tabular">
                    {card.value}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.sub}</div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0B1F3A]/5 dark:bg-[#C59B27]/10 text-[#0B1F3A] dark:text-[#E5BA41] group-hover:bg-[#0B1F3A] group-hover:text-white dark:group-hover:bg-[#C59B27] dark:group-hover:text-[#07111F] transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* Primary Charts Row */}
      <section className="grid lg:grid-cols-12 gap-6">
        {/* Department Enrollment & Avg CGPA */}
        <div className="lg:col-span-7 p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Enrollment & Academic Standing by Department
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Live headcount across active undergraduate departments
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('departments')}
              className="text-xs font-medium text-[#0B1F3A] dark:text-[#E5BA41] hover:underline whitespace-nowrap shrink-0"
            >
              View Departments
            </button>
          </div>

          {data.deptEnrollment.length === 0 ? (
            <EmptyState
              title="No Department Records"
              description="Add departments and enroll students to visualize enrollment distribution."
            />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.deptEnrollment} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="code" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B1F3A',
                      borderColor: '#C59B27',
                      color: '#fff',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="students" name="Enrolled Students" fill="#0B1F3A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="faculty" name="Faculty" fill="#C59B27" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Attendance Trend Line */}
        <div className="lg:col-span-5 p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Institutional Attendance Trend
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Daily attendance rate (%) calculated from session logs
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="text-xs font-medium text-[#0B1F3A] dark:text-[#E5BA41] hover:underline whitespace-nowrap shrink-0"
            >
              Attendance Log
            </button>
          </div>

          {data.attendanceTrend.length === 0 ? (
            <EmptyState
              title="No Attendance Sessions Recorded"
              description="Mark daily class attendance to compute institutional attendance trajectories."
            />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.attendanceTrend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[50, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B1F3A',
                      borderColor: '#C59B27',
                      color: '#fff',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    name="Attendance %"
                    stroke="#C59B27"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#0B1F3A' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Bottom Row: Announcements + Recent Campus Activities + Quick Access */}
      <section className="grid lg:grid-cols-12 gap-6">
        {/* Announcements */}
        <div className="lg:col-span-6 p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Institutional Announcements
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verified circulars & academic notices
              </p>
            </div>
            {canPostAnnouncement && (
              <button
                type="button"
                onClick={() => setAnnOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] text-xs font-medium whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Post Notice
              </button>
            )}
          </div>

          {data.announcements.length === 0 ? (
            <EmptyState
              title="No Active Announcements"
              description="Notices posted by college leadership will appear here."
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.announcements.map((ann) => (
                <div key={ann.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {ann.title}
                    </div>
                    <span
                      className={`text-[11px] font-semibold shrink-0 ${
                        ann.priority === 'Urgent'
                          ? 'text-red-600 dark:text-red-400'
                          : ann.priority === 'Important'
                          ? 'text-amber-700 dark:text-[#E5BA41]'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {ann.priority}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {ann.body}
                  </p>
                  <div className="text-[11px] text-slate-400 mt-1.5">
                    {ann.category} · {ann.event_date ? `Due ${ann.event_date}` : ann.created_at.slice(0, 10)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activities & Quick Actions */}
        <div className="lg:col-span-6 p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Recent Institutional Activities
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Seminars, workshops, convocations & outreach
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('events')}
                className="text-xs font-medium text-[#0B1F3A] dark:text-[#E5BA41] hover:underline whitespace-nowrap shrink-0"
              >
                All Events
              </button>
            </div>

            {data.recentEvents.length === 0 ? (
              <EmptyState
                title="No Events Logged"
                description="Events and workshops created in the Events module appear here."
              />
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentEvents.map((ev) => (
                  <div key={ev.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {ev.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {ev.category} · {ev.venue}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono-tabular text-slate-700 dark:text-slate-300">
                        {ev.event_date}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{ev.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
              Quick Access Actions
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onNavigate('students')}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944] text-left truncate"
              >
                Student Directory
              </button>
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944] text-left truncate"
              >
                Mark Attendance
              </button>
              <button
                type="button"
                onClick={() => onNavigate('scholarships')}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-[#162944] text-left truncate inline-flex items-center gap-1.5"
              >
                <Award className="w-3.5 h-3.5 text-[#C59B27]" />
                Scholarships
              </button>
            </div>
          </div>
        </div>
      </section>

      <Modal open={annOpen} onClose={() => setAnnOpen(false)} title="Post Institutional Announcement">
        <form onSubmit={handleCreateAnnouncement} className="space-y-4">
          {annError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {annError}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Announcement Title
            </label>
            <input
              type="text"
              required
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                value={annCat}
                onChange={(e) => setAnnCat(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              >
                <option value="Academic">Academic</option>
                <option value="Events">Events</option>
                <option value="Attendance">Attendance</option>
                <option value="Scholarship">Scholarship</option>
                <option value="Administrative">Administrative</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <select
                value={annPriority}
                onChange={(e) => setAnnPriority(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              >
                <option value="Normal">Normal</option>
                <option value="Important">Important</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Message
            </label>
            <textarea
              required
              rows={4}
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAnnOpen(false)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingAnn}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
            >
              {savingAnn ? 'Publishing...' : 'Publish Announcement'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={clearDemoOpen}
        onClose={() => setClearDemoOpen(false)}
        onConfirm={handleClearDemoData}
        loading={clearingDemo}
        title="Remove Demonstration Dataset"
        message="This will permanently remove all [DEMO] sample students, faculty, events, and placeholder records while keeping all real college records, departments, programs, and administrator accounts intact."
      />
    </div>
  );
}
