import { useLocation, useNavigate } from 'react-router-dom';
import { Home, LayoutDashboard } from 'lucide-react';

export default function BottomTabNav({ user }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = user && ['super_admin', 'event_admin', 'admin'].includes(user.role);
  const isScanner = user && ['scanner', 'super_admin', 'event_admin', 'admin'].includes(user.role);

  const tabs = [
    { id: 'home', label: 'Home', icon: Home, path: '/' },
  ];

  if (isAdmin) {
    tabs.push({ id: 'admin', label: 'Dashboard', icon: LayoutDashboard, path: '/admin' });
  }

  // Don't render if only 1 tab and user not logged in
  if (!user) return null;

  const isActive = (tab) => {
    if (tab.id === 'home') return location.pathname === '/';
    if (tab.id === 'admin') return location.pathname.startsWith('/admin');
    return location.pathname === tab.path;
  };

  const handleTabPress = (tab) => {
    const targetPath = tab.path;
    if (isActive(tab)) {
      // Reset to root of that tab
      navigate(targetPath, { replace: true });
    } else {
      navigate(targetPath);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 safe-area-bottom md:hidden">
      <div className="flex items-center" style={{ minHeight: '56px' }}>
        {tabs.map(tab => {
          const active = isActive(tab);
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabPress(tab)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors touch-target ${
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              style={{ minHeight: '56px' }}
            >
              <Icon className={`h-5 w-5 ${active ? 'drop-shadow-sm' : ''}`} />
              <span className="text-[11px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}