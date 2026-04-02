import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { WifiOff } from 'lucide-react';
import ScannerBottomNav from './ScannerBottomNav';

const SCANNER_ROLES = ['scanner', 'super_admin', 'event_admin', 'admin'];

export default function ScannerLayout() {
  const [user, setUser] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!online && (
        <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-2 text-sm font-medium">
          <WifiOff className="h-4 w-4" />
          Offline — reconnect to continue scanning
        </div>
      )}
      <main className="flex-1 overflow-auto pb-16">
        <Outlet context={{ user, assignments }} />
      </main>
      <ScannerBottomNav occurrenceId={occurrenceId} />
    </div>
  );
}