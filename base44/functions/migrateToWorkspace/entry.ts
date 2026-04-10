import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { workspace_id } = body;
    
    if (!workspace_id) {
      return Response.json({ error: 'workspace_id is required' }, { status: 400 });
    }

    // Verify workspace exists
    const workspaces = await base44.asServiceRole.entities.Workspace.filter({ id: workspace_id });
    if (!workspaces.length) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const entityNames = [
      'EventOccurrence', 'EventTemplate', 'EventSeries', 'Location', 'Venue',
      'Ticket', 'TicketType', 'Order', 'UplineMentor', 'PlatinumLeader',
      'ScannerAssignment', 'CheckInLog'
    ];

    const results = {};

    for (const entityName of entityNames) {
      // Fetch all records without a workspace_id
      const records = await base44.asServiceRole.entities[entityName].filter({});
      const toUpdate = records.filter(r => !r.workspace_id);
      
      let updated = 0;
      for (const record of toUpdate) {
        await base44.asServiceRole.entities[entityName].update(record.id, { workspace_id });
        updated++;
      }
      results[entityName] = { total: records.length, migrated: updated };
    }

    // Also update all users to have access to this workspace
    const users = await base44.asServiceRole.entities.User.filter({});
    let usersUpdated = 0;
    for (const u of users) {
      const existingIds = u.workspace_ids || [];
      if (!existingIds.includes(workspace_id)) {
        await base44.asServiceRole.entities.User.update(u.id, {
          workspace_ids: [...existingIds, workspace_id],
          active_workspace_id: u.active_workspace_id || workspace_id
        });
        usersUpdated++;
      }
    }
    results.User = { total: users.length, migrated: usersUpdated };

    return Response.json({ success: true, workspace_id, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});