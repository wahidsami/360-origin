import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Users, Briefcase, FileText, ShieldCheck,
  Settings, Bell, Search, LogOut, Menu, X, ChevronRight, Globe, ClipboardList, Calendar, History, DollarSign,
  Sparkles, BookOpen, BarChart3, Workflow, Link2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Role, isInternalRole } from '../types';
import { DateTimeDisplay } from './DateTimeDisplay';
import { SearchResults } from './SearchResults';
import { NotificationsDrawer } from './NotificationsDrawer';
import { OnboardingWizard } from './OnboardingWizard';
import { ChangelogModal } from './ChangelogModal';
import { api } from '../services/api';
import { useAI } from '../contexts/AIContext';

const API_WS_URL = import.meta.env.VITE_API_URL || '';

const hexToHslTuple = (hex: string): string | null => {
  const cleaned = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const SidebarItem = ({ to, icon: Icon, label, onClick, isCollapsed }: any) => (
  <NavLink
    to={to}
    onClick={onClick}
    title={isCollapsed ? label : undefined}
    className={({ isActive }) => `
      flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} rounded-xl transition-all duration-300 group
      ${isActive
        ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-l-4 border-cyan-500 text-cyan-600 shadow-sm'
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'}
    `}
  >
    {({ isActive }) => (
      <>
        <Icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 group-hover:rotate-3 ${isActive ? 'text-cyan-500' : ''}`} />
        {!isCollapsed && <span className="font-bold text-sm truncate">{label}</span>}
        {!isCollapsed && <ChevronRight className="w-4 h-4 shrink-0 -mr-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity rtl:rotate-180" />}
      </>
    )}
  </NavLink>
);

const SidebarSectionLabel = ({ label, isCollapsed }: { label: string; isCollapsed: boolean }) => {
  if (isCollapsed) return <div className="h-3" />;
  return (
    <div className="px-4 pt-4 pb-2">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{label}</p>
    </div>
  );
};

export const Layout: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { openAI } = useAI();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [orgBranding, setOrgBranding] = useState<{ logo?: string | null; primaryColor?: string | null; accentColor?: string | null } | null>(null);

  useEffect(() => {
    if (!user?.orgId) return;

    // QA Default Redirection
    if (user.role === Role.QA && window.location.pathname === '/app/dashboard') {
      navigate('/app/my-work');
    }

    api.org.get().then((o: any) => {
      setOrgBranding({ logo: o.logo, primaryColor: o.primaryColor, accentColor: o.accentColor });
      const root = document.documentElement.style;
      if (o.primaryColor) {
        const hslTuple = hexToHslTuple(o.primaryColor);
        if (hslTuple) root.setProperty('--brand-primary', hslTuple);
      }
      if (o.accentColor) root.setProperty('--brand-accent', o.accentColor);
    }).catch(() => { });
  }, [user?.orgId, user?.role]);

  const loadNotificationCount = async () => {
    try {
      const res = await api.notifications.count();
      setNotificationUnreadCount((res as { count: number }).count ?? 0);
    } catch {
      // ignore
    }
  };

  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    // Defer connection so React StrictMode's double-mount doesn't trigger "closed before connection established"
    const t = window.setTimeout(() => {
      const socket = io(API_WS_URL, {
        path: '/ws',
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      socketRef.current = socket;
      socket.on('notification', (payload?: { title?: string; body?: string; entityType?: string }) => {
        setNotificationUnreadCount((c) => c + 1);
        if (payload?.entityType === 'email') {
          toast.error(payload.body || payload.title || 'Email delivery issue');
        }
      });
      socket.on('connect_error', () => {
        // Fallback to polling only; count is already loaded
      });
    }, 150);
    return () => {
      window.clearTimeout(t);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  useEffect(() => {
    loadNotificationCount();
    const interval = setInterval(loadNotificationCount, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);


  const toggleLang = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en';
    i18n.changeLanguage(newLang);
    document.dir = newLang === 'ar' ? 'rtl' : 'ltr';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const primaryMenuItems = [
    { to: '/app/dashboard', icon: LayoutDashboard, label: t('dashboard') },
  ];

  if (user && isInternalRole(user.role)) {
    primaryMenuItems.push({ to: '/app/my-work', icon: ClipboardList, label: t('my_work') });
    primaryMenuItems.push({ to: '/app/calendar', icon: Calendar, label: t('calendar') });
  }

  primaryMenuItems.push(
    { to: '/app/clients', icon: Users, label: t('clients') },
    { to: '/app/projects', icon: Briefcase, label: t('projects') }
  );

  if (user && [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.DEV, Role.QA, Role.FINANCE, Role.CLIENT_OWNER, Role.CLIENT_MANAGER, Role.CLIENT_MEMBER].includes(user.role)) {
    primaryMenuItems.push({ to: '/app/reports', icon: FileText, label: t('reports') });
  }

  if (user && [Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.FINANCE].includes(user.role)) {
    primaryMenuItems.push({ to: '/app/finance', icon: DollarSign, label: t('financials') });
  }

  const knowledgeMenuItems: Array<{ to: string; icon: any; label: string }> = [];
  if (user) {
    knowledgeMenuItems.push({ to: '/app/wiki', icon: BookOpen, label: t('wiki') });
  }
  if (user && isInternalRole(user.role)) {
    knowledgeMenuItems.push({ to: '/app/analytics', icon: BarChart3, label: t('analytics') });
  }

  const adminToolItems: Array<{ to: string; icon: any; label: string }> = [];
  if (user && [Role.SUPER_ADMIN, Role.OPS, Role.PM].includes(user.role)) {
    adminToolItems.push({ to: '/app/automations', icon: Workflow, label: t('automations') });
    adminToolItems.push({ to: '/app/integrations', icon: Link2, label: t('integrations') });
  }

  const adminManagementItems: Array<{ to: string; icon: any; label: string }> = [];
  if (user?.role === Role.SUPER_ADMIN) {
    adminManagementItems.push({ to: '/app/admin/report-templates', icon: FileText, label: 'Report Builder' });
  }
  if (user && [Role.SUPER_ADMIN, Role.OPS].includes(user.role)) {
    adminManagementItems.push({ to: '/app/admin/workspace-templates', icon: Briefcase, label: 'Workspace Builder' });
  }
  if (user?.role === Role.SUPER_ADMIN) {
    adminManagementItems.push({ to: '/app/admin/users', icon: Users, label: 'Users' });
    adminManagementItems.push({ to: '/app/admin/roles', icon: ShieldCheck, label: 'Roles' });
  }

  const dashboardLogoSrc = orgBranding?.logo || '/arenalogo.png';
  const dashboardLogoAlt = 'Arena 360 logo';

  return (
    <div className={`flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 overflow-hidden font-sans selection:bg-cyan-500/30 transition-colors duration-500 ${i18n.language === 'ar' ? 'font-brand-ar' : 'font-brand-en'}`}>
      {/* Background Ambience - Modified for light theme */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/5 dark:bg-cyan-900/10 rounded-full blur-[100px] animate-pulse-subtle" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/5 dark:bg-indigo-900/10 rounded-full blur-[100px] animate-pulse-subtle delay-1000" />
      </div>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 ${isCollapsed ? 'w-20' : 'w-72'} 
        bg-white dark:bg-slate-900 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800
        transform transition-all duration-300 lg:transform-none flex flex-col shadow-xl lg:shadow-none
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 rtl:translate-x-full rtl:lg:translate-x-0'}
      `}>
        {/* Desktop Collapse Toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute -right-3 top-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full w-6 h-6 items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white z-50 transition-all shadow-sm"
        >
          <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
        </button>

        <div className={`p-4 flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3'} border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 relative h-20`}>
          {!isCollapsed && (
            <div className="p-4 flex items-center justify-center">
              <img src={dashboardLogoSrc} alt={dashboardLogoAlt} className="max-h-12 w-auto object-contain" />
            </div>
          )}
          {isCollapsed && (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <img src={dashboardLogoSrc} alt={dashboardLogoAlt} className="max-h-8 w-auto object-contain" />
            </div>
          )}
          <button onClick={() => setSidebarOpen(false)} className={`ml-auto lg:hidden text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors ${isCollapsed ? 'hidden' : ''}`}>
            <X />
          </button>
        </div>

        <nav className={`flex-1 ${isCollapsed ? 'p-2' : 'p-4'} space-y-2 overflow-y-auto`}>
          {primaryMenuItems.map((item) => (
            <SidebarItem key={item.to} {...item} onClick={() => setSidebarOpen(false)} isCollapsed={isCollapsed} />
          ))}

          {knowledgeMenuItems.length > 0 && (
            <>
              <SidebarSectionLabel label="Workspace" isCollapsed={isCollapsed} />
              {knowledgeMenuItems.map((item) => (
                <SidebarItem key={item.to} {...item} onClick={() => setSidebarOpen(false)} isCollapsed={isCollapsed} />
              ))}
            </>
          )}

          {adminToolItems.length > 0 && (
            <>
              <SidebarSectionLabel label="Admin Tools" isCollapsed={isCollapsed} />
              <div className="space-y-2 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900/40">
                {adminToolItems.map((item) => (
                  <SidebarItem key={item.to} {...item} onClick={() => setSidebarOpen(false)} isCollapsed={isCollapsed} />
                ))}
              </div>
            </>
          )}

          {adminManagementItems.length > 0 && (
            <>
              <SidebarSectionLabel label="Administration" isCollapsed={isCollapsed} />
              {adminManagementItems.map((item) => (
                <SidebarItem key={item.to} {...item} onClick={() => setSidebarOpen(false)} isCollapsed={isCollapsed} />
              ))}
            </>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
            <SidebarItem to="/app/settings" icon={Settings} label={t('settings')} onClick={() => setSidebarOpen(false)} isCollapsed={isCollapsed} />
          </div>
        </nav>

        <div className={`p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 ${isCollapsed ? 'flex justify-center px-2' : ''}`}>
          <div className={`flex items-center gap-3 ${isCollapsed ? 'p-2' : 'p-3'} rounded-2xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/30 w-full shadow-sm`}>
            <img src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.name}&background=0d9488&color=fff`} className={`${isCollapsed ? 'w-8 h-8' : 'w-10 h-10'} shrink-0 rounded-full border-2 border-slate-200 dark:border-slate-600`} alt="Profile" />
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user?.name}</p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 truncate uppercase tracking-wider">{user?.role.replace(/_/g, ' ')}</p>
                </div>
                <button onClick={handleLogout} className="text-slate-400 hover:text-rose-500 transition-colors p-1" title={t('logout')}>
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
          {isCollapsed && (
            <button onClick={handleLogout} className="absolute bottom-6 right-1 bg-white dark:bg-slate-800 border border-[#E4E9F2] dark:border-slate-700 rounded-full w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors shadow-sm" title={t('logout')}>
              <LogOut className="w-3 h-3" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/50 backdrop-blur-md flex items-center justify-between px-6 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-400 mr-4">
            <Menu />
          </button>

          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="relative w-full max-w-md hidden md:flex items-center gap-2 bg-slate-100 dark:bg-slate-950/50 border border-[#E4E9F2] dark:border-slate-700 rounded-full py-2 pl-4 pr-4 text-sm text-slate-500 dark:text-slate-400 hover:border-cyan-500/50 transition-all group"
            >
              <Search className="w-4 h-4 shrink-0 rtl:order-2 group-hover:text-cyan-500 transition-colors" />
              <span className="font-medium">{t('search')}</span>
              <kbd className="ml-auto hidden sm:inline px-2 py-0.5 text-[10px] font-bold bg-white dark:bg-slate-800 border border-[#E4E9F2] dark:border-slate-700 rounded shadow-sm">Ctrl+K</kbd>
            </button>
          </div>
          <SearchResults open={searchOpen} onClose={() => setSearchOpen(false)} />

          <div className="flex items-center gap-4 flex-1 justify-center">
            <DateTimeDisplay />
          </div>

          <div className="flex items-center gap-4">
            <button type="button" onClick={() => openAI()} className="p-2 text-slate-400 dark:text-slate-500 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-slate-800 rounded-full transition-all group" title={t('ai_assistant')}>
              <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
            <button onClick={toggleLang} className="p-2 text-slate-400 dark:text-slate-500 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-slate-800 rounded-full transition-all">
              <span className="font-bold text-xs flex items-center gap-2">
                <Globe className="w-4 h-4" />
                {i18n.language.toUpperCase()}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setNotificationDrawerOpen(true)}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-slate-800 rounded-full transition-all relative"
              title={t('notifications')}
            >
              <Bell className="w-5 h-5" />
              {notificationUnreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-black bg-rose-500 text-white rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse-subtle">
                  {notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setChangelogOpen(true)}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-slate-800 rounded-full transition-all"
              title={t('changelog')}
            >
              <History className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 w-full min-w-0 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <div className="w-full px-6 py-6 space-y-8 animate-in fade-in duration-500">
            <Outlet />
          </div>
        </main>
      </div>
      {user?.role === Role.SUPER_ADMIN && <OnboardingWizard />}
      {/* Portals: rendered at top-level to avoid z-index / stacking context issues */}
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <NotificationsDrawer
        open={notificationDrawerOpen}
        onClose={() => { setNotificationDrawerOpen(false); loadNotificationCount(); }}
      />
    </div>
  );
};
