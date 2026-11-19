import React, { useEffect, useState } from 'react';
import { Award, FileText, Lock, Plus } from 'lucide-react';
import type { AuthUser, FinancialAssistance, ScholarshipProgram, Student } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { exportToPdf } from '../../utils/reports.ts';
import { Modal } from '../ui/Modal.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

interface ScholarshipsPayload {
  programs: ScholarshipProgram[];
  assistance: FinancialAssistance[];
  restricted: boolean;
}

export function ScholarshipsModule({ user, mode = 'scholarships' }: { user: AuthUser; mode?: 'scholarships' | 'finance' }) {
  const [data, setData] = useState<ScholarshipsPayload | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [progOpen, setProgOpen] = useState(false);
  const [aidOpen, setAidOpen] = useState(false);

  const [progForm, setProgForm] = useState({
    code: '',
    title: '',
    provider: 'Akhuwat Education Foundation',
    category: 'Need-Based',
    coverage_type: '100% Tuition Waiver',
    annual_budget_pkr: 1000000,
    eligibility_criteria: '',
    deadline: '2026-12-31',
  });

  const [aidForm, setAidForm] = useState({
    student_id: '',
    scholarship_id: '',
    assistance_type: 'Fee Concession',
    amount_pkr: 85000,
    fee_concession_pct: 100,
    application_status: 'Pending',
    remarks: '',
  });

  const canManage = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  const canApply = canManage || user.role === 'STUDENT';

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, stuRes] = await Promise.all([
        apiFetch<ScholarshipsPayload>('/api/scholarships'),
        user.role === 'TEACHER'
          ? Promise.resolve({ students: [] as Student[] })
          : apiFetch<{ students: Student[] }>('/api/students'),
      ]);
      setData(sRes);
      setStudents(stuRes.students);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role]);

  const handleCreateProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/scholarships', { method: 'POST', body: JSON.stringify(progForm) });
    setProgOpen(false);
    await load();
  };

  const handleCreateAid = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/financial-assistance', {
      method: 'POST',
      body: JSON.stringify({
        ...aidForm,
        student_id: user.role === 'STUDENT' ? user.linked_student_id : Number(aidForm.student_id),
        scholarship_id: aidForm.scholarship_id ? Number(aidForm.scholarship_id) : null,
      }),
    });
    setAidOpen(false);
    await load();
  };

  const updateAidStatus = async (id: number, status: string) => {
    await apiFetch(`/api/financial-assistance/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ application_status: status }),
    });
    await load();
  };

  if (loading || !data) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading scholarship & financial records...</div>;
  }

  const totalDisbursed = data.assistance
    .filter((a) => a.application_status === 'Disbursed' || a.application_status === 'Approved')
    .reduce((acc, a) => acc + a.amount_pkr, 0);

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {mode === 'finance'
              ? 'Financial Assistance, Fee Concessions & Disbursements'
              : 'Institutional Scholarship Programs & Awards'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mawakhat fee-free empowerment · Protected financial confidentiality
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={() =>
                exportToPdf({
                  title: 'Scholarship & Financial Assistance Disbursement Report',
                  period: 'Academic Year 2026-2027',
                  generatedBy: user.full_name,
                  summaryPairs: [
                    { label: 'Total Records', value: data.assistance.length },
                    { label: 'Approved/Disbursed PKR', value: `PKR ${totalDisbursed.toLocaleString()}` },
                  ],
                  columns: ['Reg No.', 'Student', 'Dept', 'Program', 'Type', 'Amount (PKR)', 'Concession %', 'Status'],
                  rows: data.assistance.map((a) => [
                    a.registration_number || '',
                    a.student_name || '',
                    a.department_code || '',
                    a.scholarship_title || 'Direct Grant',
                    a.assistance_type,
                    a.amount_pkr.toLocaleString(),
                    `${a.fee_concession_pct}%`,
                    a.application_status,
                  ]),
                  fileName: `ACW_Financial_Aid_${new Date().toISOString().slice(0, 10)}`,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <FileText className="w-3.5 h-3.5" />
              Financial Report PDF
            </button>
          )}
          {canApply && (
            <button
              type="button"
              onClick={() => {
                setAidForm({
                  ...aidForm,
                  student_id: students[0] ? String(students[0].id) : '',
                  scholarship_id: data.programs[0] ? String(data.programs[0].id) : '',
                });
                setAidOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
            >
              <Plus className="w-3.5 h-3.5" />
              {user.role === 'STUDENT' ? 'Apply for Financial Aid' : 'Record Assistance'}
            </button>
          )}
          {canManage && mode === 'scholarships' && (
            <button
              type="button"
              onClick={() => setProgOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <Plus className="w-3.5 h-3.5" />
              New Scholarship Scheme
            </button>
          )}
        </div>
      </div>

      {/* Scholarship Programs */}
      {mode === 'scholarships' && (
        <div className="grid md:grid-cols-2 gap-4">
          {data.programs.map((p) => (
            <div key={p.id} className="p-5 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Award className="w-5 h-5 text-[#C59B27] shrink-0" />
                  <div>
                    <div className="text-[11px] font-mono-tabular text-slate-500">{p.code} · {p.category}</div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.title}</h3>
                  </div>
                </div>
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0">{p.status}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{p.description}</p>
              <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <div>Provider: {p.provider} · Coverage: {p.coverage_type}</div>
                <div>Eligibility: {p.eligibility_criteria}</div>
                <div className="font-mono-tabular">Annual Fund: PKR {p.annual_budget_pkr.toLocaleString()} · Deadline: {p.deadline || 'Rolling'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Restricted Financial Assistance Table */}
      <div className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="w-4 h-4 text-[#C59B27]" />
            <span>
              {user.role === 'STUDENT'
                ? 'My Scholarship & Financial Assistance Applications'
                : 'Authorized Financial Assistance & Concession Ledger'}
            </span>
          </div>
          {canManage && (
            <span className="text-xs font-mono-tabular font-semibold text-[#0B1F3A] dark:text-[#E5BA41]">
              Approved/Disbursed: PKR {totalDisbursed.toLocaleString()}
            </span>
          )}
        </div>

        {user.role === 'TEACHER' ? (
          <div className="p-6">
            <EmptyState
              title="Confidential Financial Access Restricted"
              description="Individual student financial assistance and household concession records are restricted to Super Admin, Admin, and the respective Student."
            />
          </div>
        ) : data.assistance.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No Financial Assistance Records" description="No applications have been submitted or recorded yet." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-[#0B1729] border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Scholarship / Type</th>
                  <th className="py-3 px-4">Academic Year</th>
                  <th className="py-3 px-4 text-right">Amount (PKR)</th>
                  <th className="py-3 px-4 text-right">Concession</th>
                  <th className="py-3 px-4">Status</th>
                  {canManage && <th className="py-3 px-4 text-right">Decision</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.assistance.map((a) => (
                  <tr key={a.id}>
                    <td className="py-3 px-4">
                      <div className="font-semibold">{a.student_name}</div>
                      <div className="text-[11px] font-mono-tabular text-slate-500">{a.registration_number} · {a.department_code}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div>{a.scholarship_title || a.assistance_type}</div>
                      <div className="text-[11px] text-slate-500">{a.remarks || a.assistance_type}</div>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular">{a.academic_year}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold">{a.amount_pkr.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular">{a.fee_concession_pct}%</td>
                    <td className="py-3 px-4 font-medium">{a.application_status}</td>
                    {canManage && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <select
                          value={a.application_status}
                          onChange={(e) => updateAidStatus(a.id, e.target.value)}
                          className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Under Review">Under Review</option>
                          <option value="Approved">Approved</option>
                          <option value="Disbursed">Disbursed</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={progOpen} onClose={() => setProgOpen(false)} title="Add Scholarship Scheme">
        <form onSubmit={handleCreateProgram} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Code *</label>
              <input type="text" required value={progForm.code} onChange={(e) => setProgForm({ ...progForm, code: e.target.value })} placeholder="SCH-ACW-2026" className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Category</label>
              <input type="text" value={progForm.category} onChange={(e) => setProgForm({ ...progForm, category: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Title *</label>
            <input type="text" required value={progForm.title} onChange={(e) => setProgForm({ ...progForm, title: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Provider *</label>
              <input type="text" required value={progForm.provider} onChange={(e) => setProgForm({ ...progForm, provider: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Annual Budget (PKR)</label>
              <input type="number" value={progForm.annual_budget_pkr} onChange={(e) => setProgForm({ ...progForm, annual_budget_pkr: Number(e.target.value) })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Eligibility Criteria *</label>
            <input type="text" required value={progForm.eligibility_criteria} onChange={(e) => setProgForm({ ...progForm, eligibility_criteria: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setProgOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">Save Scholarship</button>
          </div>
        </form>
      </Modal>

      <Modal open={aidOpen} onClose={() => setAidOpen(false)} title={user.role === 'STUDENT' ? 'Submit Financial Assistance Application' : 'Record Financial Assistance'}>
        <form onSubmit={handleCreateAid} className="space-y-3">
          {canManage && (
            <div>
              <label className="block text-xs font-medium mb-1">Student *</label>
              <select required value={aidForm.student_id} onChange={(e) => setAidForm({ ...aidForm, student_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                {students.map((s) => <option key={s.id} value={s.id}>{s.registration_number} — {s.full_name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Scholarship Program</label>
              <select value={aidForm.scholarship_id} onChange={(e) => setAidForm({ ...aidForm, scholarship_id: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                <option value="">Direct Fee Concession</option>
                {data.programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Assistance Type</label>
              <select value={aidForm.assistance_type} onChange={(e) => setAidForm({ ...aidForm, assistance_type: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                <option value="Fee Concession">Fee Concession</option>
                <option value="Merit Scholarship">Merit Scholarship</option>
                <option value="Endowment Grant">Endowment Grant</option>
                <option value="Financial Aid">Financial Aid</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Requested / Grant Amount (PKR)</label>
              <input type="number" value={aidForm.amount_pkr} onChange={(e) => setAidForm({ ...aidForm, amount_pkr: Number(e.target.value) })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Fee Concession %</label>
              <input type="number" min={0} max={100} value={aidForm.fee_concession_pct} onChange={(e) => setAidForm({ ...aidForm, fee_concession_pct: Number(e.target.value) })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Justification / Remarks</label>
            <textarea rows={2} value={aidForm.remarks} onChange={(e) => setAidForm({ ...aidForm, remarks: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAidOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]">Submit</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
