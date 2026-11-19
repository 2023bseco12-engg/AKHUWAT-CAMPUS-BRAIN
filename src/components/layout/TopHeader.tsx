import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  X,
  AlertTriangle,
  Calendar,
  Megaphone,
} from 'lucide-react';
import type { AuthUser, ModuleKey } from '../../types/index.ts';
import { useTheme } from '../../context/ThemeContext.tsx';
import { apiFetch } from '../../utils/api.ts';
import { SafeImage } from '../ui/SafeImage.tsx';

interface SearchResult {
  type: string;
  id: number;
  title: string;
  subtitle: string;
  module: ModuleKey;
}

interface NotificationPayload {
  announcements: Array<{ id: number; title: string; body: string; category: string; priority: string; created_at: string }>;
  upcomingEvents: Array<{ id: number; title: string; category: string; event_date: string; venue: string }>;
  attendanceWarnings: Array<{ id?: number; full_name: string; registration_number: string; pct: number }>;
}

interface TopHeaderProps {
  user: AuthUser;
  activeLabel: string;
  onOpenMobileNav: () => void;
  onNavigate: (module: ModuleKey) => void;
  onLogout: () => void;
}

export function TopHeader({
  user,
  activeLabel,
  onOpenMobileNav,
  onNavigate,
  onLogout,
}: TopHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationPayload | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const notifBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<NotificationPayload>('/api/notifications')
      .then(setNotifs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (notifBoxRef.current && !notifBoxRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => {
          setSearchResults(res.results);
          setSearchOpen(true);
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const totalAlerts =
    (notifs?.announcements.length || 0) +
    (notifs?.upcomingEvents.length || 0) +
    (notifs?.attendanceWarnings.length || 0);

  return (
    <header className="sticky top-0 z-30 h-[68px] bg-white/95 dark:bg-[#0B1729]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4">
      {/* Left: Mobile Menu Trigger + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div className="w-9 h-9 rounded-lg bg-white p-0.5 border border-slate-200 dark:border-slate-700 shrink-0 overflow-hidden">
          <SafeImage
            src="/assets/aistudio/image_92675513.png"
            alt="Akhuwat Logo"
            className="w-full h-full object-contain"
            fallbackLabel="ACW"
          />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
            Akhuwat Campus Brain · Chakwal
          </div>
          <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
            {activeLabel}
          </h1>
        </div>
      </div>

      {/* Center: Global Cross-Module Search */}
      <div ref={searchBoxRef} className="relative flex-1 max-w-md hidden md:block">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setSearchOpen(true);
            }}
            placeholder="Search students, faculty, events, archive..."
            aria-label="Global Campus Search"
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-[#07111F] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#0B1F3A] dark:focus:border-[#C59B27]"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSearchResults([]);
                setSearchOpen(false);
              }}
              aria-label="Clear search"
              className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {searchOpen && query.trim() && (
          <div className="absolute left-0 right-0 mt-1.5 bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-80 overflow-y-auto z-50">
            {searchResults.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                No matching institutional records found for "{query}".
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {searchResults.map((item, idx) => (
                  <button
                    key={`${item.type}-${item.id}-${idx}`}
                    type="button"
                    onClick={() => {
                      onNavigate(item.module);
                      setSearchOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-[#162944] transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-[#0B1F3A] dark:text-[#E5BA41] shrink-0">
                      {item.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Notifications, Theme Toggle, Account & Logout */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Notifications Center */}
        <div ref={notifBoxRef} className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((p) => !p)}
            aria-label="Open notifications and announcements"
            className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {totalAlerts > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-md bg-[#C59B27] text-[#07111F] text-[10px] font-bold flex items-center justify-center font-mono-tabular">
                {totalAlerts}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#0E1C30] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Institutional Alerts & Notices
                </span>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifs?.attendanceWarnings.map((w, i) => (
                  <button
                    key={`warn-${i}`}
                    type="button"
                    onClick={() => {
                      onNavigate('attendance');
                      setNotifOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-[#162944] flex items-start gap-2.5"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Low Attendance Alert · {w.pct}%
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {w.full_name} ({w.registration_number})
                      </div>
                    </div>
                  </button>
                ))}
                {notifs?.upcomingEvents.map((ev) => (
                  <button
                    key={`ev-${ev.id}`}
                    type="button"
                    onClick={() => {
                      onNavigate('events');
                      setNotifOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-[#162944] flex items-start gap-2.5"
                  >
                    <Calendar className="w-4 h-4 text-[#0B1F3A] dark:text-[#E5BA41] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {ev.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {ev.event_date} · {ev.venue}
                      </div>
                    </div>
                  </button>
                ))}
                {notifs?.announcements.map((ann) => (
                  <div key={`ann-${ann.id}`} className="px-4 py-3 flex items-start gap-2.5">
                    <Megaphone className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {ann.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {ann.body}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {ann.category} · {ann.priority}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Theme Switcher */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle light or dark mode"
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-[#E5BA41]" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User Profile Summary + Sign Out */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-slate-800">
          <div className="hidden sm:block text-right">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
              {user.full_name}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
              {user.role.replace('_', ' ')}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
