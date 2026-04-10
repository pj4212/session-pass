import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const BATCH_SIZE = 5;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 3000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const statusCode = error?.response?.status || error?.status || error?.statusCode || 0;
      const isRateLimit = statusCode === 429 || /rate.?limit/i.test(error.message);

      if (isRateLimit && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`Rate limited on "${label}" (attempt ${attempt}), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (attempt >= MAX_RETRIES) {
        console.error(`Failed "${label}" after ${MAX_RETRIES} attempts: ${error.message}`);
        return { _failed: true, error: error.message, label };
      }

      await sleep(BASE_DELAY_MS);
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { workspace_id, entity_name } = body;

    if (!workspace_id) {
      return Response.json({ error: 'workspace_id is required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // Verify workspace exists
    const workspaces = await svc.entities.Workspace.filter({ id: workspace_id });
    if (!workspaces.length) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // If entity_name specified, only process that one entity
    // Otherwise process all in sequence (may time out for large datasets)
    const allEntityNames = [
      'EventOccurrence', 'EventTemplate', 'EventSeries', 'Location', 'Venue',
      'Ticket', 'TicketType', 'Order', 'UplineMentor', 'PlatinumLeader',
      'ScannerAssignment', 'CheckInLog'
    ];

    const entityNames = entity_name ? [entity_name] : allEntityNames;
    const results = {};
    let totalMigrated = 0;
    let totalFailed = 0;

    for (const eName of entityNames) {
      console.log(`Processing ${eName}...`);

      const allRecords = await withRetry(
        () => svc.entities[eName].filter({}),
        `${eName}.filter`
      );

      if (allRecords?._failed) {
        results[eName] = { error: `Failed to fetch: ${allRecords.error}` };
        continue;
      }

      const toUpdate = allRecords.filter(r => !r.workspace_id);

      if (toUpdate.length === 0) {
        results[eName] = { total: allRecords.length, migrated: 0, failed: 0, skipped: allRecords.length };
        console.log(`${eName}: nothing to migrate (${allRecords.length} already assigned)`);
        continue;
      }

      let migrated = 0;
      let failed = 0;
      const errors = [];

      for (let i = 0; i < toUpdate.length; i++) {
        const record = toUpdate[i];
        const label = `${eName}.update(${record.id})`;
        const result = await withRetry(
          () => svc.entities[eName].update(record.id, { workspace_id }),
          label
        );

        if (result?._failed) {
          failed++;
          errors.push(result);
        } else {
          migrated++;
        }

        // Pause every BATCH_SIZE records to avoid rate limits
        if ((i + 1) % BATCH_SIZE === 0 && i + 1 < toUpdate.length) {
          console.log(`${eName}: ${i + 1}/${toUpdate.length} processed, pausing...`);
          await sleep(2000);
        }
      }

      results[eName] = {
        total: allRecords.length,
        needed_migration: toUpdate.length,
        migrated,
        failed,
        errors: errors.length > 0 ? errors : undefined
      };

      totalMigrated += migrated;
      totalFailed += failed;

      console.log(`${eName}: ${migrated} migrated, ${failed} failed out of ${toUpdate.length}`);
    }

    // Only update users if not doing a single entity run, or if entity_name is 'User'
    if (!entity_name || entity_name === 'User') {
      console.log('Processing Users...');
      const users = await withRetry(() => svc.entities.User.filter({}), 'User.filter');
      let usersUpdated = 0;
      let usersFailed = 0;

      if (!users?._failed) {
        for (let i = 0; i < users.length; i++) {
          const u = users[i];
          const existingIds = u.workspace_ids || [];
          if (!existingIds.includes(workspace_id)) {
            const result = await withRetry(
              () => svc.entities.User.update(u.id, {
                workspace_ids: [...existingIds, workspace_id],
                active_workspace_id: u.active_workspace_id || workspace_id
              }),
              `User.update(${u.id})`
            );
            if (result?._failed) {
              usersFailed++;
            } else {
              usersUpdated++;
            }

            if ((i + 1) % BATCH_SIZE === 0) await sleep(2000);
          }
        }
      }

      results.User = {
        total: users?._failed ? 0 : users.length,
        migrated: usersUpdated,
        failed: usersFailed
      };

      totalMigrated += usersUpdated;
      totalFailed += usersFailed;
    }

    const summary = {
      success: totalFailed === 0,
      workspace_id,
      total_migrated: totalMigrated,
      total_failed: totalFailed,
      results
    };

    console.log('Migration complete:', JSON.stringify(summary, null, 2));

    return Response.json(summary);
  } catch (error) {
    console.error('Migration error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});