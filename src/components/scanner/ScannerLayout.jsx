import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { WifiOff, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import ScannerBottomNav from './ScannerBottomNav';
import useWorkspace from '../../hooks/useWorkspace';
import WorkspaceSwitcher from '../admin/WorkspaceSwitcher';

const SCANNER_ROLES = ['scanner', 'super_admin', 'event_admin', 'admin'];

export default function ScannerLayout() {
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { workspaces, activeWorkspace, workspaceId, loadWorkspaces, switchWorkspace } = useWorkspace();
  const [online, setOnline] = useState(navigator.onLine);
  const navigate = useNavigate();
  const location = useLocation();

  const match = location.pathname.match(/\/scanner\/([^/]+)/);
  const occurrenceId = match ? match[1] : null;

  useEffect(() => {
    async function load() {
      const me = await base44.auth.me();
      if (!me || !SCANNER_ROLES.includes(me.role)) {
        navigate('/');
        return;
      }
      setUser(me);
      await loadWorkspaces(me);
      setLoading(false);
    }
    load();

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = user && ['super_admin', 'event_admin', 'admin'].includes(user.role);

  return (
    <div className="min-h-screen bg-background flex flex-col safe-area-top">
      {isAdmin && (
        <div className="bg-card border-b border-border px-4 py-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground hover:text-foreground">
            <Link to="/admin"><Shield className="h-4 w-4" />Back to Admin</Link>
          </Button>
          {workspaces.length > 1 && (
            <div className="w-48">
              <WorkspaceSwitcher workspaces={workspaces} activeWorkspace={activeWorkspace} onSwitch={switchWorkspace} collapsed={false} />
            </div>
          )}
        </div>
      )}
      {!online && (
        <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-2 text-sm font-medium">
          <WifiOff className="h-4 w-4" />
          Offline — reconnect to continue scanning
        </div>
      )}
      <main className="flex-1 overflow-auto pb-20 overscroll-none">
        <Outlet context={{ user, assignments, workspaceId }} />
      </main>
      <ScannerBottomNav occurrenceId={occurrenceId} />
    </div>
  );
}