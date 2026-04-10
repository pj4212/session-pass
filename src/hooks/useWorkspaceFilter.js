import { useOutletContext } from 'react-router-dom';

/**
 * Returns the workspace filter object { workspace_id } from the admin layout context.
 * Use this in admin pages to filter entity queries by the active workspace.
 * Also returns the raw workspaceId and user for convenience.
 */
export default function useWorkspaceFilter() {
  const context = useOutletContext() || {};
  const { workspaceId, user, activeWorkspace } = context;
  
  // Filter object for entity queries — only include if workspaceId exists
  const wsFilter = workspaceId ? { workspace_id: workspaceId } : {};
  
  return { wsFilter, workspaceId, user, activeWorkspace };
}