import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, Calendar, Users, Settings, BarChart3, 
  ChevronLeft, ChevronRight, Menu, LogOut, X, FolderOpen, Mail, ScanLine, Ticket
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'event_admin'] },
  { path: '/admin/series', label: 'Event Series', icon: FolderOpen, roles: ['super_admin', 'event_admin'] },
  { path: '/admin/events', label: 'Sessions', icon: Calendar, roles: ['super_admin', 'event_admin'] },
  { path: '/admin/reports', label: 'Reports', icon: BarChart3, roles: ['super_admin', 'event_admin'] },
  { path: '/admin/settings/users', label: 'Users', icon: Users, roles: ['super_admin'] },
  { path: '/admin/settings/platinum-leaders', label: 'Platinum Leaders', icon: Settings, roles: ['super_admin'] },
  { path: '/admin/settings/email-testing', label: 'Email Testing', icon: Mail, roles: ['super_admin'] },
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
      if (!me || !['super_admin', 'event_admin', 'admin'].includes(me.role)) {
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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const effectiveRole = user?.role === 'admin' ? 'super_admin' : user?.role;
  const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(effectiveRole));
  const isActive = (path) => location.pathname === path || (path !== '/admin' && location.pathname.startsWith(path));

  const sidebar = (
    <div className={`flex flex-col h-full bg-sidebar border-r border-sidebar-border ${collapsed ? 'w-16' : 'w-60'} transition-all`}>
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground">Session Pass</span>
          </div>
        )}
        {collapsed && <Ticket className="h-5 w-5 text-primary mx-auto" />}
        <Button variant="ghost" size="icon" className="hidden md:flex text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="md:hidden text-sidebar-foreground hover:text-foreground" onClick={() => setMobileOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {filteredNav.map(item => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.path) 
                ? 'bg-primary text-primary-foreground' 
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {!collapsed && (
          <p className="text-xs text-sidebar-foreground mb-2 truncate px-1">{user?.email}</p>
        )}
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start gap-2 text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent" 
          onClick={() => navigate('/scanner')}
        >
          <ScanLine className="h-4 w-4" />
          {!collapsed && 'Ticket Scanner'}
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start gap-2 text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent" 
          onClick={() => base44.auth.logout()}
        >
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full w-60">{sidebar}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-4 gap-3 md:hidden bg-card">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            <span className="font-semibold">Session Pass</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  );
}