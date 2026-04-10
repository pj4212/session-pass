import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['super_admin', 'admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'list') {
      const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 500);
      const workspaces = await base44.asServiceRole.entities.Workspace.filter({ is_active: true });
      
      // Admin sees all users; super_admin/event_admin sees users in their workspace
      let users = allUsers;
      if (user.role !== 'admin') {
        const wsId = user.active_workspace_id;
        if (wsId) {
          users = allUsers.filter(u => (u.workspace_ids || []).includes(wsId));
        }
      }
      
      return Response.json({ users, workspaces });
    }

    if (action === 'update') {
      const { user_id, data } = body;
      if (!user_id || !data) {
        return Response.json({ error: 'Missing user_id or data' }, { status: 400 });
      }
      await base44.asServiceRole.entities.User.update(user_id, data);
      return Response.json({ status: 'success' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});