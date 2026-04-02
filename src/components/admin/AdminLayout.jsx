import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, Calendar, Users, Settings, BarChart3, 
  ChevronLeft, ChevronRight, Menu, LogOut, X, FolderOpen
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'event_admin', 'report_viewer'] },
  { path: '/admin/series', label: 'Event Series', icon: FolderOpen, roles: ['super_admin', 'event_admin'] },
  { path: '/admin/events', label: 'Sessions', icon: Calendar, roles: ['super_admin', 'event_admin'] },
  { path: '/admin/reports', label: 'Reports', icon: BarChart3, roles: ['super_admin', 'event_admin', 'report_viewer'] },
  { path: '/admin/settings/users', label: 'Users', icon: Users, roles: ['super_admin'] },
  { path: '/admin/settings/mentors', label: 'Mentors', icon: Settings, roles: ['super_admin'] },
  { path: '/admin/settings/platinum-leaders', label: 'Platinum Leaders', icon: Settings, roles: ['super_admin'] },
];

export default function AdminLayout() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUser() {
      const me = await base44.auth.me();
      if (!me || !['super_admin', 'event_admin', 'report_viewer', 'admin'].includes(me.role)) {
        navigate('/');
        return;
      }
      setUser(me);
      setLoading(false);
    }
    loadUser();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const effectiveRole = user?.role === 'admin' ? 'super_admin' : user?.role;
  const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(effectiveRole));
  const isActive = (path) => location.pathname === path || (path !== '/admin' && location.pathname.startsWith(path));

  const sidebar = (
    <div className={`flex flex-col h-full bg-card border-r ${collapsed ? 'w-16' : 'w-60'} transition-all`}>
      <div className="p-4 border-b flex items-center justify-between">
        {!collapsed && <span className="font-bold text-lg">Admin</span>}
        <Button variant="ghost" size="icon" className="hidden md:flex" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {filteredNav.map(item => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              isActive(item.path) 
                ? 'bg-primary text-primary-foreground' 
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t">
        {!collapsed && (
          <p className="text-xs text-muted-foreground mb-2 truncate">{user?.email}</p>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => base44.auth.logout()}>
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Logout'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{sidebar}</div>
      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full w-60">{sidebar}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b flex items-center px-4 gap-3 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">Admin</span>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  );
}