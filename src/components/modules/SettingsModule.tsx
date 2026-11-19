import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, KeyRound, Loader2, Moon, Plus, Shield, Sun } from 'lucide-react';
import type { AuthUser, UserRole } from '../../types/index.ts';
import { apiFetch } from '../../utils/api.ts';
import { useTheme } from '../../context/ThemeContext.tsx';
import { Modal } from '../ui/Modal.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { SafeImage } from '../ui/SafeImage.tsx';

interface AdminUserRow {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  department_code: string | null;
  status: string;
  created_at: string;
}

interface AuditLogRow {
  id: number;
  user_email: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  created_at: string;
}

export function SettingsModule({ user }: { user: AuthUser }) {
  const { theme, toggleTheme } = useTheme();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [tab, setTab] = useState<'profile' | 'users' | 'audit'>('profile');

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // Admin RBAC state
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'ADMIN' as UserRole });

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isAdmin = isSuperAdmin || user.role === 'ADMIN';

  const loadAdminData = async () => {
    if (!isAdmin) return;
    setLoadingAdmin(true);
    setAdminError(null);
    try {
      const [uRes, lRes] = await Promise.all([
        apiFetch<{ users: AdminUserRow[] }>('/api/admin/users'),
        apiFetch<{ logs: AuditLogRow[] }>('/api/admin/audit-logs'),
      ]);
      setUsers(uRes.users);
      setLogs(lRes.logs);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to load administrative records');
    } finally {
      setLoadingAdmin(false);
    }
  };

  useEffect(() => {
    loadAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.role]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from your current password.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordSuccess(res.message || 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (isAdmin) await loadAdminData();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setAdminSuccess(null);

    if (!newUser.full_name.trim() || !newUser.email.trim()) {
      setModalError('Full name and email are required.');
      return;
    }
    if (newUser.password.length < 8) {
      setModalError('Password must be at least 8 characters long.');
      return;
    }

    setSavingUser(true);
    try {
      await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(newUser) });
      setUserModalOpen(false);
      setAdminSuccess(`Account provisioned for ${newUser.email} (${newUser.role}).`);
      setNewUser({ full_name: '', email: '', password: '', role: 'ADMIN' });
      await loadAdminData();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to provision user.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleRoleChange = async (id: number, role: UserRole) => {
    setAdminError(null);
    setAdminSuccess(null);
    setSavingUser(true);
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ role }) });
      setAdminSuccess(`User #${id} role updated to ${role}.`);
      await loadAdminData();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to update user role.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleStatusToggle = async (id: number, current: string) => {
    setAdminError(null);
    setAdminSuccess(null);
    setSavingUser(true);
    const nextStatus = current === 'Active' ? 'Suspended' : 'Active';
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      setAdminSuccess(`User #${id} status changed to ${nextStatus}.`);
      await loadAdminData();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Failed to update user status.');
    } finally {
      setSavingUser(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#07111F] rounded-lg">
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === 'profile' ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
          >
            Account & Preferences
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setTab('users')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === 'users' ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                User Management & RBAC
              </button>
              <button
                type="button"
                onClick={() => setTab('audit')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${tab === 'audit' ? 'bg-white dark:bg-[#162944] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              >
                Security Audit Logs
              </button>
            </>
          )}
        </div>

        {isSuperAdmin && (
          <a
            href="/api/admin/backup"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
          >
            <Download className="w-3.5 h-3.5" />
            Download Institutional Database Backup (JSON)
          </a>
        )}
      </div>

      {adminError && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{adminError}</span>
        </div>
      )}

      {adminSuccess && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{adminSuccess}</span>
        </div>
      )}

      {tab === 'profile' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-white p-0.5 border border-slate-200 dark:border-slate-700 shrink-0 overflow-hidden">
                  <SafeImage
                    src="/assets/aistudio/image_92675513.png"
                    alt="Akhuwat Logo"
                    className="w-full h-full object-contain"
                    fallbackLabel="ACW"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <Shield className="w-4 h-4 text-[#C59B27]" />
                    <span>Authenticated Institutional Session</span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">Akhuwat College for Women, Chakwal</div>
                </div>
              </div>
              <div>Name: <span className="font-semibold">{user.full_name}</span></div>
              <div>Email: <span className="font-mono-tabular">{user.email}</span></div>
              <div>Assigned Role: <span className="font-semibold text-[#0B1F3A] dark:text-[#E5BA41]">{user.role}</span></div>
              <div>Institution: Akhuwat College for Women, Chakwal, Pakistan</div>
            </div>

            <div className="p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Interface Appearance</div>
                <div className="text-xs text-slate-500 mt-0.5">Switch between Institutional Light and Deep Navy Dark Mode</div>
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-[#E5BA41]" /> : <Moon className="w-4 h-4" />}
                {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              </button>
            </div>
          </div>

          {/* Change Password Card */}
          <form
            onSubmit={handlePasswordChange}
            className="p-6 rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#C59B27]" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Update Account Password</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Use a strong password with at least 8 characters. Changes are recorded in the security audit log.
                </p>
              </div>
            </div>

            {passwordError && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1">Current Password *</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">New Password (min 8 chars) *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingPassword}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] disabled:opacity-50"
              >
                {savingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {savingPassword ? 'Updating Password...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'users' && isAdmin && (
        <div className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Institutional Accounts & Role Permissions</span>
              {(loadingAdmin || savingUser) && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C59B27]" />}
            </div>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  setModalError(null);
                  setUserModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F]"
              >
                <Plus className="w-3.5 h-3.5" />
                Provision User
              </button>
            )}
          </div>
          {loadingAdmin && users.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#0B1729]">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    {isSuperAdmin && <th className="py-3 px-4 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 px-4 font-semibold">{u.full_name}</td>
                      <td className="py-3 px-4 font-mono-tabular">{u.email}</td>
                      <td className="py-3 px-4">
                        {isSuperAdmin ? (
                          <select
                            disabled={savingUser}
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] disabled:opacity-50"
                          >
                            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                            <option value="ADMIN">ADMIN</option>
                            <option value="TEACHER">TEACHER</option>
                            <option value="STUDENT">STUDENT</option>
                          </select>
                        ) : (
                          u.role
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            u.status === 'Active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      {isSuperAdmin && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            disabled={savingUser}
                            onClick={() => handleStatusToggle(u.id, u.status)}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                          >
                            {u.status === 'Active' ? 'Suspend' : 'Activate'}
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
      )}

      {tab === 'audit' && isAdmin && (
        <div className="rounded-xl bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 overflow-hidden">
          {loadingAdmin && logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading audit trail...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6"><EmptyState title="No Audit Logs" description="System operations are logged here automatically." /></div>
          ) : (
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-[#0B1729] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Entity</th>
                    <th className="py-2.5 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-4 font-mono-tabular text-slate-500 whitespace-nowrap">{l.created_at}</td>
                      <td className="py-2.5 px-4">{l.user_email} ({l.user_role})</td>
                      <td className="py-2.5 px-4 font-mono-tabular font-semibold">{l.action}</td>
                      <td className="py-2.5 px-4">{l.entity_type} {l.entity_id ? `#${l.entity_id}` : ''}</td>
                      <td className="py-2.5 px-4 text-slate-500 max-w-sm truncate">{l.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={userModalOpen} onClose={() => setUserModalOpen(false)} title="Provision Institutional User">
        <form onSubmit={handleCreateUser} className="space-y-3">
          {modalError && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1">Full Name *</label>
            <input type="text" required value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Email *</label>
            <input type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Password (min 8 chars) *</label>
              <input type="password" required minLength={8} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Role *</label>
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F]">
                <option value="ADMIN">ADMIN</option>
                <option value="TEACHER">TEACHER</option>
                <option value="STUDENT">STUDENT</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setUserModalOpen(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700">Cancel</button>
            <button type="submit" disabled={savingUser} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] dark:bg-[#C59B27] text-white dark:text-[#07111F] disabled:opacity-50">
              {savingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {savingUser ? 'Provisioning...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
