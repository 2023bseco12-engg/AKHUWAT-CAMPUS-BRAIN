import React from 'react';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  Building2,
  Award,
  Wallet,
  CalendarDays,
  Trophy,
  Boxes,
  Archive,
  Sparkles,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import type { ModuleKey, UserRole } from '../../types/index.ts';
import { SafeImage } from '../ui/SafeImage.tsx';

interface NavItem {
  key: ModuleKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
}

export const SIDEBAR_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'students', label: 'Student Management', icon: Users },
  { key: 'faculty', label: 'Faculty Management', icon: GraduationCap },
  { key: 'academics', label: 'Academic Records', icon: BookOpen },
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'departments', label: 'Departments', icon: Building2 },
  { key: 'scholarships', label: 'Scholarships', icon: Award },
  { key: 'finance', label: 'Finance', icon: Wallet, roles: ['SUPER_ADMIN', 'ADMIN', 'STUDENT'] },
  { key: 'events', label: 'Events & Activities', icon: CalendarDays },
  { key: 'achievements', label: 'Achievements', icon: Trophy },
  { key: 'resources', label: 'College Resources', icon: Boxes },
  { key: 'archive', label: 'Digital Archive', icon: Archive },
  { key: 'ai', label: 'AI Intelligence', icon: Sparkles },
  { key: 'analytics', label: 'Reports & Analytics', icon: BarChart3 },
  { key: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  activeModule: ModuleKey;
  onSelect: (key: ModuleKey) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userRole: UserRole;
}

export function Sidebar({
  activeModule,
  onSelect,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  userRole,
}: SidebarProps) {
  const visibleItems = SIDEBAR_ITEMS.filter((item) => !item.roles || item.roles.includes(userRole));

  const navContent = (
    <div className="flex flex-col h-full bg-[#0B1F3A] text-slate-100 border-r border-[#163156] select-none">
      {/* Institutional Brand Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-[#163156] min-h-[68px]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-white p-0.5 shrink-0 border border-[#C59B27]/60">
            <SafeImage
              src="/assets/aistudio/image_92675513.png"
              alt="Akhuwat Logo"
              className="w-full h-full object-contain"
              fallbackLabel="ACW"
            />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-serif-institutional text-sm font-bold tracking-tight text-white truncate">
                Akhuwat Brain
              </div>
              <div className="text-[11px] text-[#E5BA41] truncate">ACW Chakwal</div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:flex p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#132E54] transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#132E54] transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5" aria-label="Primary Institutional Navigation">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onSelect(item.key);
                onCloseMobile();
              }}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap ${
                isActive
                  ? 'bg-[#C59B27] text-[#07111F] font-semibold'
                  : 'text-slate-300 hover:bg-[#132E54] hover:text-white'
              } ${collapsed ? 'justify-center px-2' : ''}`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#07111F]' : 'text-[#E5BA41]/90'}`} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Institutional Footer Mark */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-[#163156] text-[11px] text-slate-400">
          <div className="font-medium text-slate-200 truncate">Akhuwat College for Women</div>
          <div className="truncate mt-0.5">Chakwal, Punjab · Pakistan</div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-[width] duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{navContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-[270px] max-w-[85vw] h-full z-10">{navContent}</aside>
        </div>
      )}
    </>
  );
}
