import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
// Page transitions are handled inside each layout (PublicLayout, AdminLayout, ScannerLayout)

// Lazy-loaded pages
const EventPage = React.lazy(() => import('./pages/EventPage'));
const OrderConfirmation = React.lazy(() => import('./pages/OrderConfirmation'));
const PublicLayout = React.lazy(() => import('./components/PublicLayout'));
const AdminLayout = React.lazy(() => import('./components/admin/AdminLayout'));
const ScannerLayout = React.lazy(() => import('./components/scanner/ScannerLayout'));
const ScannerHome = React.lazy(() => import('./pages/scanner/ScannerHome'));
const ScannerDashboard = React.lazy(() => import('./pages/scanner/ScannerDashboard'));
const QRScanner = React.lazy(() => import('./pages/scanner/QRScanner'));
const ManualCheckinList = React.lazy(() => import('./pages/scanner/ManualCheckinList'));
const Dashboard = React.lazy(() => import('./pages/admin/Dashboard'));
const EventList = React.lazy(() => import('./pages/admin/EventList'));
const EventForm = React.lazy(() => import('./pages/admin/EventForm'));
const AttendeeList = React.lazy(() => import('./pages/admin/AttendeeList'));
const MentorManagement = React.lazy(() => import('./pages/admin/MentorManagement'));
const PlatinumLeaderManagement = React.lazy(() => import('./pages/admin/PlatinumLeaderManagement'));
const UserManagement = React.lazy(() => import('./pages/admin/UserManagement'));
const Reports = React.lazy(() => import('./pages/admin/Reports'));
const SeriesManagement = React.lazy(() => import('./pages/admin/SeriesManagement'));
const SeriesPage = React.lazy(() => import('./pages/SeriesPage'));
const Home = React.lazy(() => import('./pages/Home'));
const EmailTesting = React.lazy(() => import('./pages/admin/EmailTesting'));
const LoadTest = React.lazy(() => import('./pages/admin/LoadTest'));
const RateLimitLogs = React.lazy(() => import('./pages/admin/RateLimitLogs'));
const PastSessions = React.lazy(() => import('./pages/admin/PastSessions'));
const WorkspaceManagement = React.lazy(() => import('./pages/admin/WorkspaceManagement'));
const AccountSettings = React.lazy(() => import('./components/AccountSettings'));


const LazyFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Suspense fallback={<LazyFallback />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/event/:slug" element={<EventPage />} />
            <Route path="/series/:slug" element={<SeriesPage />} />
            <Route path="/order/:orderNumber" element={<OrderConfirmation />} />
            <Route path="/account" element={<AccountSettings />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="series" element={<SeriesManagement />} />
            <Route path="events" element={<EventList />} />
            <Route path="events/new" element={<EventForm />} />
            <Route path="events/:id/edit" element={<EventForm />} />
            <Route path="events/:id/attendees" element={<AttendeeList />} />
            <Route path="past-sessions" element={<PastSessions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings/mentors" element={<MentorManagement />} />
            <Route path="settings/platinum-leaders" element={<PlatinumLeaderManagement />} />
            <Route path="settings/users" element={<UserManagement />} />
            <Route path="settings/email-testing" element={<EmailTesting />} />
            <Route path="settings/load-test" element={<LoadTest />} />
            <Route path="settings/rate-limit-logs" element={<RateLimitLogs />} />
            <Route path="settings/workspaces" element={<WorkspaceManagement />} />
          </Route>
          <Route path="/scanner" element={<ScannerLayout />}>
            <Route index element={<ScannerHome />} />
            <Route path=":occurrenceId/dashboard" element={<ScannerDashboard />} />
            <Route path=":occurrenceId/scan" element={<QRScanner />} />
            <Route path=":occurrenceId/list" element={<ManualCheckinList />} />
          </Route>
          <Route path="*" element={<PageNotFound />} />
        </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App