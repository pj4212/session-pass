import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Simple module-level cache so all components share the same workspace state
let _activeWorkspace = null;
let _workspaces = [];
let _listeners = new Set();

function notify() {
  _listeners.forEach(fn => fn());
}

export default function useWorkspace() {
  const [workspaces, setWorkspaces] = useState(_workspaces);
  const [activeWorkspace, setActiveWorkspace] = useState(_activeWorkspace);
  const [loading, setLoading] = useState(!_activeWorkspace);

  useEffect(() => {
    const listener = () => {
      setWorkspaces([..._workspaces]);
      setActiveWorkspace(_activeWorkspace);
    };
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  }, []);

  const loadWorkspaces = useCallback(async (user) => {
    setLoading(true);
    const allWs = await base44.entities.Workspace.filter({ is_active: true });
    
    // Filter to workspaces the user has access to (admins see all)
    const userWsIds = user?.workspace_ids || [];
    const accessible = user?.role === 'admin' 
      ? allWs 
      : allWs.filter(w => userWsIds.includes(w.id));
    
    _workspaces = accessible;
    
    // Determine active workspace
    const savedId = user?.active_workspace_id;
    const found = accessible.find(w => w.id === savedId);
    _activeWorkspace = found || accessible[0] || null;
    
    setWorkspaces(accessible);
    setActiveWorkspace(_activeWorkspace);
    setLoading(false);
    notify();
  }, []);

  const switchWorkspace = useCallback(async (workspaceId) => {
    const ws = _workspaces.find(w => w.id === workspaceId);
    if (!ws) return;
    _activeWorkspace = ws;
    setActiveWorkspace(ws);
    notify();
    // Persist preference on user
    await base44.auth.updateMe({ active_workspace_id: workspaceId });
  }, []);

  return {
    workspaces,
    activeWorkspace,
    workspaceId: activeWorkspace?.id || null,
    loading,
    loadWorkspaces,
    switchWorkspace,
  };
}