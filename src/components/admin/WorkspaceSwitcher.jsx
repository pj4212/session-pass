import { useState } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';

export default function WorkspaceSwitcher({ workspaces, activeWorkspace, onSwitch, collapsed }) {
  const [open, setOpen] = useState(false);

  if (!workspaces.length) return null;
  
  if (collapsed) {
    return (
      <div className="px-2 py-2 flex justify-center" title={activeWorkspace?.name || 'Workspace'}>
        <Building2 className="h-5 w-5 text-primary" />
      </div>
    );
  }

  // If only one workspace, just show the name
  if (workspaces.length === 1) {
    return (
      <div className="px-3 py-2 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{activeWorkspace?.name}</span>
      </div>
    );
  }

  // Inline dropdown (no portal) — works reliably inside mobile sidebar overlay
  return (
    <div className="px-2 py-2 relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-sm text-foreground hover:bg-sidebar-accent/80 transition-colors"
      >
        <Building2 className="h-4 w-4 text-primary shrink-0" />
        <span className="truncate flex-1 text-left">{activeWorkspace?.name || 'Select workspace'}</span>
        <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-2 right-2 top-full mt-1 z-[100] rounded-md border border-sidebar-border bg-popover shadow-lg py-1 max-h-48 overflow-y-auto">
          {workspaces.map(ws => (
            <button
              key={ws.id}
              type="button"
              onClick={() => { onSwitch(ws.id); setOpen(false); }}
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors ${
                ws.id === activeWorkspace?.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <span className="flex-1 truncate">{ws.name}</span>
              {ws.id === activeWorkspace?.id && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}