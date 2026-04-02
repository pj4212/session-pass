import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ScanLine, LogOut, WifiOff } from 'lucide-react';

const SCANNER_ROLES = ['scanner', 'super_admin', 'event_admin'];

export default function ScannerLayout() {
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      const me = await base44.auth.me();
      if (!me || !SCANNER_ROLES.includes(me.role)) {
        navigate('/');
        return;
      }
      setUser(me);

      // super_admin/event_admin see all events, scanners see only assigned
      if (me.role === 'scanner') {
        const assigns = await base44.entities.ScannerAssignment.filter({ user_id: me.id, is_active: true });
        setAssignments(assigns);
      }
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!online && (
        <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-2 text-sm font-medium">
          <WifiOff className="h-4 w-4" />
          Offline — reconnect to continue scanning
        </div>
      )}
      <header className="h-14 border-b flex items-center justify-between px-4 shrink-0">
        <Link to="/scanner" className="flex items-center gap-2 font-bold">
          <ScanLine className="h-5 w-5" />
          Scanner
        </Link>
        <Button variant="ghost" size="icon" onClick={() => base44.auth.logout()}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet context={{ user, assignments }} />
      </main>
    </div>
  );
}