import { Link, useLocation } from 'react-router-dom';
import { Home, BarChart3, ScanLine, ClipboardList } from 'lucide-react';

const tabs = [
  { id: 'home', label: 'Home', icon: Home, path: '/scanner' },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, pathSuffix: '/dashboard' },
  { id: 'scan', label: 'Scanner', icon: ScanLine, pathSuffix: '/scan' },
  { id: 'list', label: 'Door List', icon: ClipboardList, pathSuffix: '/list' },
];

export default function ScannerBottomNav({ occurrenceId }) {
  const location = useLocation();

  const getPath = (tab) => {
    if (tab.id === 'home') return '/scanner';
    if (!occurrenceId) return '/scanner';
    return `/scanner/${occurrenceId}${tab.pathSuffix}`;
  };

  const isActive = (tab) => {
    const path = location.pathname;
    if (tab.id === 'home') return path === '/scanner';
    if (!occurrenceId) return false;
    return path === `/scanner/${occurrenceId}${tab.pathSuffix}`;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t z-40 safe-area-bottom">
      <div className="flex items-center h-16">
        {tabs.map(tab => {
          const active = isActive(tab);
          const disabled = tab.id !== 'home' && !occurrenceId;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              to={disabled ? '/scanner' : getPath(tab)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 h-full transition-colors ${
                active ? 'text-primary' : disabled ? 'text-muted-foreground/40 pointer-events-none' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}