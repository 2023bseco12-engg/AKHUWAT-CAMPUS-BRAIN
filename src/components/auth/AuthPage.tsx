import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { SafeImage } from '../ui/SafeImage.tsx';

const DEMO_ACCOUNTS = [
  { roleLabel: 'Super Admin', email: 'principal@acw.edu.pk', pass: 'Akhuwat@2026', desc: 'Principal · Full institutional access' },
  { roleLabel: 'Admin', email: 'admin@acw.edu.pk', pass: 'Akhuwat@2026', desc: 'Academic Admin · Records & Finance' },
  { roleLabel: 'Teacher', email: 'teacher@acw.edu.pk', pass: 'Akhuwat@2026', desc: 'Faculty · Attendance & Results' },
  { roleLabel: 'Student', email: 'student@acw.edu.pk', pass: 'Akhuwat@2026', desc: 'Ayesha Bibi · Self-scoped portal' },
];

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('principal@acw.edu.pk');
  const [password, setPassword] = useState('Akhuwat@2026');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [regNo, setRegNo] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid institutional email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'register' && fullName.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(trimmedEmail, password);
      } else {
        await register({
          full_name: fullName.trim(),
          email: trimmedEmail,
          password,
          role,
          registration_number: regNo.trim() || undefined,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-50 dark:bg-[#07111F]">
      {/* Left Institutional Showcase Panel */}
      <div className="lg:col-span-7 bg-[#0B1F3A] text-white flex flex-col justify-between p-6 sm:p-8 lg:p-10 gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white p-1 border border-[#C59B27] shrink-0">
            <SafeImage
              src="/assets/aistudio/image_92675513.png"
              alt="Akhuwat Logo"
              className="w-full h-full object-contain"
              fallbackLabel="ACW"
            />
          </div>
          <div>
            <div className="text-xs font-semibold tracking-wider text-[#E5BA41] uppercase">
              Akhuwat College for Women · Chakwal
            </div>
            <div className="font-serif-institutional text-xl font-bold text-white">
              Akhuwat Campus Brain
            </div>
          </div>
        </div>

        {/* Crisp, Unobstructed Campus Building Showcase */}
        <div className="rounded-xl overflow-hidden border-2 border-[#C59B27]/60 bg-[#07111F] shadow-xl">
          <div className="relative aspect-[16/9] w-full overflow-hidden">
            <SafeImage
              src="/assets/aistudio/image_1b288e46.png"
              alt="Akhuwat College for Women Chakwal Campus — Shahbaz Khatoon Block"
              className="w-full h-full object-cover object-center"
            />
          </div>
          <div className="px-4 py-2.5 bg-[#07111F] border-t border-[#C59B27]/30 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#E5BA41]">Shahbaz Khatoon Block</span>
            <span className="text-slate-300">Akhuwat College for Women, Chakwal</span>
          </div>
        </div>

        <div className="max-w-2xl">
          <h1 className="font-serif-institutional text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight text-white">
            One College. One Digital Brain. Infinite Possibilities.
          </h1>
          <p className="mt-3 text-sm text-slate-200 leading-relaxed max-w-xl">
            Centralized institutional intelligence unifying student academics, faculty research,
            attendance analytics, Mawakhat scholarships, digital archives, and AI-assisted
            decision support for Akhuwat College for Women, Chakwal.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-6 pt-5 border-t border-white/15 text-xs">
            <div>
              <div className="text-lg font-bold text-[#E5BA41] font-mono-tabular">5 Depts</div>
              <div className="text-slate-300 mt-0.5">Undergraduate Faculties</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#E5BA41] font-mono-tabular">RBAC</div>
              <div className="text-slate-300 mt-0.5">4-Tier Role Security</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#E5BA41] font-mono-tabular">Gemini AI</div>
              <div className="text-slate-300 mt-0.5">Live Database Intelligence</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-3 pb-5 mb-5 border-b border-slate-100 dark:border-slate-800">
              <div className="w-11 h-11 rounded-lg bg-white p-0.5 border border-slate-200 dark:border-slate-700 shrink-0 overflow-hidden">
                <SafeImage
                  src="/assets/aistudio/image_92675513.png"
                  alt="Akhuwat Logo"
                  className="w-full h-full object-contain"
                  fallbackLabel="ACW"
                />
              </div>
              <div>
                <div className="font-serif-institutional text-base font-bold text-slate-900 dark:text-slate-100">
                  Akhuwat Campus Brain
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Akhuwat College for Women, Chakwal
                </div>
              </div>
            </div>

            {/* Mode Switch */}
            <div className="flex p-1 bg-slate-100 dark:bg-[#07111F] rounded-lg mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-white dark:bg-[#162944] text-[#0B1F3A] dark:text-[#E5BA41] shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Institutional Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setEmail('');
                  setPassword('');
                  setError(null);
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-white dark:bg-[#162944] text-[#0B1F3A] dark:text-[#E5BA41] shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Create Account
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Ayesha Bibi"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0B1F3A] dark:focus:border-[#C59B27]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Account Role
                      </label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as 'STUDENT' | 'TEACHER')}
                        className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] text-slate-900 dark:text-slate-100"
                      >
                        <option value="STUDENT">Student</option>
                        <option value="TEACHER">Teacher / Faculty</option>
                      </select>
                    </div>
                    {role === 'STUDENT' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                          Registration No. (Optional)
                        </label>
                        <input
                          type="text"
                          value={regNo}
                          onChange={(e) => setRegNo(e.target.value)}
                          placeholder="ACW-2023-CS-001"
                          className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] text-slate-900 dark:text-slate-100 font-mono-tabular"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Institutional Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@acw.edu.pk"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0B1F3A] dark:focus:border-[#C59B27]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3.5 pr-10 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07111F] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0B1F3A] dark:focus:border-[#C59B27]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0B1F3A] hover:bg-[#132E54] dark:bg-[#C59B27] dark:hover:bg-[#d4a934] text-white dark:text-[#07111F] text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {submitting
                  ? 'Authenticating...'
                  : mode === 'login'
                  ? 'Sign In to Campus Brain'
                  : 'Register Institutional Account'}
              </button>
            </form>

            {/* Role-Based Access Quick Selector for Demonstration */}
            {mode === 'login' && (
              <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <KeyRound className="w-3.5 h-3.5 text-[#C59B27]" />
                    <span>Demonstration Accounts (Evaluation Only)</span>
                  </div>
                  <span className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    DEMO
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
                  Sample seeded records inside the workspace are tagged [DEMO] and can be cleared by an Admin.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => {
                        setEmail(acc.email);
                        setPassword(acc.pass);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        email === acc.email
                          ? 'border-[#C59B27] bg-[#C59B27]/10 dark:bg-[#C59B27]/15'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#162944]'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {acc.roleLabel}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {acc.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
