import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, label, base44Service) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const statusCode = error?.response?.status || error?.status || 0;
      const isRateLimit = statusCode === 429 || /rate.?limit/i.test(error.message);

      // Log the failure
      try {
        await base44Service.entities.RateLimitLog.create({
          operation_label: label,
          error_message: error.message || String(error),
          status_code: statusCode,
          attempt
        });
      } catch (_) { /* don't fail on logging failure */ }

      if (isRateLimit && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`Rate limited on "${label}" (attempt ${attempt}), retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }

      if (attempt >= MAX_RETRIES) {
        console.error(`Failed "${label}" after ${MAX_RETRIES} attempts: ${error.message}`);
        return { _failed: true, error: error.message, label };
      }

      // Non-rate-limit error on non-final attempt — still retry
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
    }
  }
}

async function processBatch(records, entityName, workspace_id, base44Service) {
  const results = { migrated: 0, failed: 0, errors: [] };

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    for (const record of batch) {
      const label = `${entityName}.update(${record.id})`;
      const result = await withRetry(
        () => base44Service.entities[entityName].update(record.id, { workspace_id }),
        label,
        base44Service
      );

      if (result?._failed) {
        results.failed++;
        results.errors.push(result);
      } else {
        results.migrated++;
      }
    }

    // Small pause between batches to avoid rate limits
    if (i + BATCH_SIZE < records.length) {
      await sleep(500);
    }
  }

  return results;
}

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

    const svc = base44.asServiceRole;

    // Verify workspace exists
    const workspaces = await svc.entities.Workspace.filter({ id: workspace_id });
    if (!workspaces.length) {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const entityNames = [
      'EventOccurrence', 'EventTemplate', 'EventSeries', 'Location', 'Venue',
      'Ticket', 'TicketType', 'Order', 'UplineMentor', 'PlatinumLeader',
      'ScannerAssignment', 'CheckInLog'
    ];

    const results = {};
    let totalMigrated = 0;
    let totalFailed = 0;

    for (const entityName of entityNames) {
      console.log(`Processing ${entityName}...`);

      const allRecords = await withRetry(
        () => svc.entities[entityName].filter({}),
        `${entityName}.filter`,
        svc
      );

      if (allRecords?._failed) {
        results[entityName] = { error: `Failed to fetch: ${allRecords.error}` };
        continue;
      }

      const toUpdate = allRecords.filter(r => !r.workspace_id);

      if (toUpdate.length === 0) {
        results[entityName] = { total: allRecords.length, migrated: 0, failed: 0, skipped: allRecords.length };
        console.log(`${entityName}: nothing to migrate (${allRecords.length} already assigned)`);
        continue;
      }

      const batchResult = await processBatch(toUpdate, entityName, workspace_id, svc);
      results[entityName] = {
        total: allRecords.length,
        needed_migration: toUpdate.length,
        migrated: batchResult.migrated,
        failed: batchResult.failed,
        errors: batchResult.errors.length > 0 ? batchResult.errors : undefined
      };

      totalMigrated += batchResult.migrated;
      totalFailed += batchResult.failed;

      console.log(`${entityName}: ${batchResult.migrated} migrated, ${batchResult.failed} failed out of ${toUpdate.length}`);
    }

    // Update users
    console.log('Processing Users...');
    const users = await withRetry(() => svc.entities.User.filter({}), 'User.filter', svc);
    let usersUpdated = 0;
    let usersFailed = 0;

    if (!users?._failed) {
      for (const u of users) {
        const existingIds = u.workspace_ids || [];
        if (!existingIds.includes(workspace_id)) {
          const result = await withRetry(
            () => svc.entities.User.update(u.id, {
              workspace_ids: [...existingIds, workspace_id],
              active_workspace_id: u.active_workspace_id || workspace_id
            }),
            `User.update(${u.id})`,
            svc
          );
          if (result?._failed) {
            usersFailed++;
          } else {
            usersUpdated++;
          }
        }
      }
    }

    results.User = {
      total: users?._failed ? 0 : users.length,
      migrated: usersUpdated,
      failed: usersFailed
    };

    const summary = {
      success: totalFailed === 0 && usersFailed === 0,
      workspace_id,
      total_migrated: totalMigrated + usersUpdated,
      total_failed: totalFailed + usersFailed,
      results
    };

    console.log('Migration complete:', JSON.stringify(summary, null, 2));

    return Response.json(summary);
  } catch (error) {
    console.error('Migration error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});