import { useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart3, ScanLine, ClipboardList } from 'lucide-react';

const tabs = [
  { id: 'home', label: 'Home', icon: Home, path: '/scanner' },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, pathSuffix: '/dashboard' },
  { id: 'scan', label: 'Scanner', icon: ScanLine, pathSuffix: '/scan' },
  { id: 'list', label: 'Door List', icon: ClipboardList, pathSuffix: '/list' },
];

export default function ScannerBottomNav({ occurrenceId }) {
  const location = useLocation();
  const navigate = useNavigate();

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

  const handleTabPress = (tab, e) => {
    e.preventDefault();
    const disabled = tab.id !== 'home' && !occurrenceId;
    if (disabled) return;
    const targetPath = getPath(tab);
    // If already on this tab, reset to root of that tab
    if (isActive(tab)) {
      navigate(targetPath, { replace: true });
    } else {
      navigate(targetPath);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 safe-area-bottom">
      <div className="flex items-center" style={{ minHeight: '56px' }}>
        {tabs.map(tab => {
          const active = isActive(tab);
          const disabled = tab.id !== 'home' && !occurrenceId;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={(e) => handleTabPress(tab, e)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors touch-target ${
                active 
                  ? 'text-primary' 
                  : disabled 
                    ? 'text-muted-foreground/30 pointer-events-none' 
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