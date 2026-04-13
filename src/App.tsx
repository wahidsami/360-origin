import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AIProvider } from './contexts/AIContext';
import { DialogProvider } from './contexts/DialogContext';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Signup from './pages/Signup';
import AcceptInvite from './pages/auth/AcceptInvite';
import AuthCallback from './pages/auth/AuthCallback';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { Role } from './types';
import './services/i18n';
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const ClientList = React.lazy(() => import('./pages/Clients').then((module) => ({ default: module.ClientList })));
const ClientCreate = React.lazy(() => import('./pages/ClientCreate').then((module) => ({ default: module.ClientCreate })));
const ClientDetails = React.lazy(() => import('./pages/ClientDetails').then((module) => ({ default: module.ClientDetails })));
const ClientEdit = React.lazy(() => import('./pages/ClientEdit').then((module) => ({ default: module.ClientEdit })));
const ProjectsList = React.lazy(() => import('./pages/Projects').then((module) => ({ default: module.ProjectsList })));
const ProjectCreate = React.lazy(() => import('./pages/ProjectCreate').then((module) => ({ default: module.ProjectCreate })));
const ProjectDetails = React.lazy(() => import('./pages/ProjectDetails').then((module) => ({ default: module.ProjectDetails })));
const ProjectEdit = React.lazy(() => import('./pages/ProjectEdit').then((module) => ({ default: module.ProjectEdit })));
const ProjectReportWorkspace = React.lazy(() => import('./pages/ProjectReportWorkspace'));
const Settings = React.lazy(() => import('./pages/Settings'));
const MyWork = React.lazy(() => import('./pages/MyWork').then((module) => ({ default: module.MyWork })));
const Reports = React.lazy(() => import('./pages/Reports').then((module) => ({ default: module.Reports })));
const FinanceDashboard = React.lazy(() => import('./pages/dashboard/FinanceDashboard').then((module) => ({ default: module.FinanceDashboard })));
const FindingsList = React.lazy(() => import('./pages/findings/FindingsList').then((module) => ({ default: module.FindingsList })));
const FindingDetails = React.lazy(() => import('./pages/findings/FindingDetails').then((module) => ({ default: module.FindingDetails })));
const UsersAdmin = React.lazy(() => import('./pages/admin/UsersAdmin'));
const RolesAdmin = React.lazy(() => import('./pages/admin/RolesAdmin'));
const ReportTemplatesAdmin = React.lazy(() => import('./pages/admin/ReportTemplatesAdmin'));
const WorkspaceTemplatesAdmin = React.lazy(() => import('./pages/admin/WorkspaceTemplatesAdmin'));
const Calendar = React.lazy(() => import('./pages/Calendar'));
const Analytics = React.lazy(() => import('./pages/Analytics'));
const Automations = React.lazy(() => import('./pages/Automations'));
const Integrations = React.lazy(() => import('./pages/Integrations'));
const Wiki = React.lazy(() => import('./pages/Wiki'));

const FinanceRoute: React.FC = () => {
  const { user } = useAuth();
  if (!user) return null;
  return <FinanceDashboard role={user.role} />;
};

// Protected Route Wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-500">Initializing...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RoleProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles: Role[] }> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-500">Initializing...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user || !allowedRoles.includes(user.role)) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
};

import { Toaster } from 'react-hot-toast';

const App: React.FC = () => {
  React.useEffect(() => {
    if (window.location.pathname.startsWith('/api/') && window.location.hash.startsWith('#/app')) {
      window.location.replace(`${window.location.origin}/${window.location.hash}`);
      return;
    }

    const theme = localStorage.getItem('arena360_theme') || 'dark';
    document.documentElement.classList.toggle('theme-light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('arena360_theme', theme);
  }, []);

  const routeFallback = (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-500">Loading...</div>
  );

  return (
    <HashRouter>
      <ErrorBoundary>
        <AuthProvider>
          <AIProvider>
          <DialogProvider>
          <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
          <React.Suspense fallback={routeFallback}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/signup" element={<Signup />} />

            <Route path="/app" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="my-work" element={<MyWork />} />
              <Route path="calendar" element={<Calendar />} />

              <Route path="clients">
                <Route index element={<ClientList />} />
                <Route path="new" element={<ClientCreate />} />
                <Route path=":clientId" element={<ClientDetails />} />
                <Route path=":clientId/edit" element={<ClientEdit />} />
              </Route>

              <Route path="projects">
                <Route index element={<ProjectsList />} />
                <Route path="new" element={<ProjectCreate />} />
                <Route path=":projectId" element={<ProjectDetails />} />
                <Route path=":projectId/report-builder/:reportId" element={<ProjectReportWorkspace />} />
                <Route path=":projectId/edit" element={<ProjectEdit />} />
              </Route>

              <Route path="reports" element={<Reports />} />
              <Route path="finance" element={<RoleProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.OPS, Role.PM, Role.FINANCE]}><FinanceRoute /></RoleProtectedRoute>} />
              <Route path="files" element={<Navigate to="/app/dashboard#shared-files" replace />} />

              <Route path="findings">
                <Route index element={<FindingsList />} />
                <Route path=":findingId" element={<FindingDetails />} />
              </Route>

              <Route path="admin">
                <Route path="report-templates" element={<RoleProtectedRoute allowedRoles={[Role.SUPER_ADMIN]}><ReportTemplatesAdmin /></RoleProtectedRoute>} />
                <Route path="workspace-templates" element={<RoleProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.OPS]}><WorkspaceTemplatesAdmin /></RoleProtectedRoute>} />
                <Route path="users" element={<RoleProtectedRoute allowedRoles={[Role.SUPER_ADMIN]}><UsersAdmin /></RoleProtectedRoute>} />
                <Route path="roles" element={<RoleProtectedRoute allowedRoles={[Role.SUPER_ADMIN]}><RolesAdmin /></RoleProtectedRoute>} />
              </Route>

              <Route path="automations" element={<Automations />} />

              <Route path="integrations" element={<Integrations />} />

              <Route path="wiki" element={<Wiki />} />

              <Route path="analytics" element={<Analytics />} />

              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          </React.Suspense>
          </DialogProvider>
          </AIProvider>
        </AuthProvider>
      </ErrorBoundary>
    </HashRouter>
  );
};

export default App;
