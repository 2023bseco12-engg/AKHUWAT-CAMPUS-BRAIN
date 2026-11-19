import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import type { ModuleKey } from './types/index.ts';
import { AuthPage } from './components/auth/AuthPage.tsx';
import { Sidebar, SIDEBAR_ITEMS } from './components/layout/Sidebar.tsx';
import { TopHeader } from './components/layout/TopHeader.tsx';
import { OverviewModule } from './components/modules/OverviewModule.tsx';
import { StudentsModule } from './components/modules/StudentsModule.tsx';
import { FacultyModule } from './components/modules/FacultyModule.tsx';
import { AcademicsModule } from './components/modules/AcademicsModule.tsx';
import { AttendanceModule } from './components/modules/AttendanceModule.tsx';
import { DepartmentsModule } from './components/modules/DepartmentsModule.tsx';
import { ScholarshipsModule } from './components/modules/ScholarshipsModule.tsx';
import { EventsModule } from './components/modules/EventsModule.tsx';
import { AchievementsModule } from './components/modules/AchievementsModule.tsx';
import { ResourcesModule } from './components/modules/ResourcesModule.tsx';
import { DigitalArchiveModule } from './components/modules/DigitalArchiveModule.tsx';
import { AiIntelligenceModule } from './components/modules/AiIntelligenceModule.tsx';
import { ReportsAnalyticsModule } from './components/modules/ReportsAnalyticsModule.tsx';
import { SettingsModule } from './components/modules/SettingsModule.tsx';

function CampusBrainShell() {
  const { user, loading, logout } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleKey>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#07111F]">
        <div className="text-center space-y-2">
          <div className="font-serif-institutional text-xl font-bold text-[#0B1F3A] dark:text-[#E5BA41]">
            Akhuwat Campus Brain
          </div>
          <div className="text-xs text-slate-500">Initializing institutional workspace...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const activeNav = SIDEBAR_ITEMS.find((i) => i.key === activeModule);
  const activeLabel = activeNav?.label || 'Overview';

  const renderModule = () => {
    switch (activeModule) {
      case 'overview':
        return <OverviewModule user={user} onNavigate={setActiveModule} />;
      case 'students':
        return <StudentsModule user={user} />;
      case 'faculty':
        return <FacultyModule user={user} />;
      case 'academics':
        return <AcademicsModule user={user} />;
      case 'attendance':
        return <AttendanceModule user={user} />;
      case 'departments':
        return <DepartmentsModule user={user} />;
      case 'scholarships':
        return <ScholarshipsModule user={user} mode="scholarships" />;
      case 'finance':
        return <ScholarshipsModule user={user} mode="finance" />;
      case 'events':
        return <EventsModule user={user} />;
      case 'achievements':
        return <AchievementsModule user={user} />;
      case 'resources':
        return <ResourcesModule user={user} />;
      case 'archive':
        return <DigitalArchiveModule user={user} />;
      case 'ai':
        return <AiIntelligenceModule user={user} />;
      case 'analytics':
        return <ReportsAnalyticsModule user={user} />;
      case 'settings':
        return <SettingsModule user={user} />;
      default:
        return <OverviewModule user={user} onNavigate={setActiveModule} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#07111F] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeModule={activeModule}
        onSelect={setActiveModule}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((p) => !p)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        userRole={user.role}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          user={user}
          activeLabel={activeLabel}
          onOpenMobileNav={() => setMobileOpen(true)}
          onNavigate={setActiveModule}
          onLogout={logout}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {renderModule()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CampusBrainShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
