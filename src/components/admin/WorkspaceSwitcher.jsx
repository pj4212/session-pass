import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export default function WorkspaceSwitcher({ workspaces, activeWorkspace, onSwitch, collapsed }) {
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

  return (
    <div className="px-2 py-2">
      <Select value={activeWorkspace?.id || ''} onValueChange={onSwitch}>
        <SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border text-sm">
          <div className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 text-primary shrink-0" />
            <SelectValue placeholder="Select workspace" />
          </div>
        </SelectTrigger>
        <SelectContent className="z-[60]">
          {workspaces.map(ws => (
            <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}