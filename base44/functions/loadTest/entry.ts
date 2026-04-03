import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Process items in batches with a delay between batches to avoid rate limits
async function batchProcess(items, batchSize, delayMs, fn) {
  let processed = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
    processed += batch.length;
    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }
  return processed;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { test_type, occurrence_id, concurrency } = body;
    const count = Math.min(concurrency || 15, 50);

    if (test_type === 'checkin') {
      // Get active tickets for this occurrence
      const allTickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id,
        ticket_status: 'active'
      });

      if (allTickets.length === 0) {
        return Response.json({ error: 'No active tickets found for this event. Create test tickets first.' }, { status: 400 });
      }

      // Reset all tickets to not_checked_in first (sequentially to avoid rate limits)
      console.log(`Resetting ${allTickets.length} tickets to not_checked_in...`);
      for (const t of allTickets) {
        if (t.check_in_status === 'checked_in') {
          await base44.asServiceRole.entities.Ticket.update(t.id, {
            check_in_status: 'not_checked_in',
            checked_in_at: '',
            checked_in_by: ''
          });
        }
      }

      // Pick up to `count` tickets to check in concurrently
      const testTickets = allTickets.slice(0, count);
      console.log(`Starting concurrent check-in test with ${testTickets.length} tickets (direct DB ops)...`);

      const now = new Date().toISOString();
      const startTime = Date.now();

      // Perform all check-ins concurrently — directly updating DB, no function-to-function calls
      const results = await Promise.allSettled(
        testTickets.map(async (ticket, idx) => {
          const t0 = Date.now();
          try {
            // Update ticket status
            await base44.asServiceRole.entities.Ticket.update(ticket.id, {
              check_in_status: 'checked_in',
              checked_in_at: now,
              checked_in_by: user.id
            });
            // Log the check-in
            await base44.asServiceRole.entities.CheckInLog.create({
              ticket_id: ticket.id,
              occurrence_id,
              action: 'check_in',
              performed_by: user.id
            });
            return {
              index: idx,
              ticket_id: ticket.id,
              status: 'success',
              reason: null,
              elapsed_ms: Date.now() - t0
            };
          } catch (err) {
            return {
              index: idx,
              ticket_id: ticket.id,
              status: 'error',
              reason: err.message,
              elapsed_ms: Date.now() - t0
            };
          }
        })
      );

      const totalElapsed = Date.now() - startTime;
      const details = results.map(r => r.status === 'fulfilled' ? r.value : { status: 'error', reason: r.reason?.message });
      const successes = details.filter(r => r.status === 'success');
      const errors = details.filter(r => r.status === 'error');

      const timings = details.filter(r => r.elapsed_ms).map(r => r.elapsed_ms);
      const avgTime = timings.length ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : 0;
      const maxTime = timings.length ? Math.max(...timings) : 0;
      const minTime = timings.length ? Math.min(...timings) : 0;

      // Verify actual DB state
      const verifyTickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id,
        ticket_status: 'active',
        check_in_status: 'checked_in'
      });

      console.log(`Check-in test complete: ${successes.length} success, ${errors.length} errors in ${totalElapsed}ms`);
      console.log(`DB shows ${verifyTickets.length} checked-in tickets (expected: ${successes.length})`);

      return Response.json({
        test_type: 'checkin',
        total_requests: testTickets.length,
        total_elapsed_ms: totalElapsed,
        summary: {
          successes: successes.length,
          warnings: 0,
          errors: errors.length,
          failures: 0,
        },
        timing: { avg_ms: avgTime, min_ms: minTime, max_ms: maxTime },
        db_verified_checkins: verifyTickets.length,
        expected_checkins: successes.length,
        integrity_ok: verifyTickets.length === successes.length,
        details
      });
    }

    if (test_type === 'checkout') {
      const occurrence = (await base44.asServiceRole.entities.EventOccurrence.filter({ id: occurrence_id }))[0];
      if (!occurrence) {
        return Response.json({ error: 'Event occurrence not found' }, { status: 404 });
      }

      const ticketTypes = await base44.asServiceRole.entities.TicketType.filter({ occurrence_id });
      const freeType = ticketTypes.find(tt => (tt.price || 0) === 0 && tt.is_active);
      if (!freeType) {
        return Response.json({ error: 'No free ticket type found for this event. Add a free ticket type first.' }, { status: 400 });
      }

      // Run checkout requests in waves of 8 to avoid rate limits
      const WAVE_SIZE = 8;
      const WAVE_DELAY_MS = 500;
      console.log(`Starting checkout test: ${count} requests in waves of ${WAVE_SIZE} for "${freeType.name}"...`);

      const startTime = Date.now();
      const allResults = [];

      for (let wave = 0; wave < count; wave += WAVE_SIZE) {
        const batchIndices = Array.from({ length: Math.min(WAVE_SIZE, count - wave) }, (_, i) => wave + i);
        const waveResults = await Promise.allSettled(
          batchIndices.map(idx => {
            const t0 = Date.now();
            return base44.functions.invoke('createCheckout', {
              buyer: {
                first_name: 'LoadTest',
                last_name: `User${idx}`,
                email: `loadtest${idx}@test.com`
              },
              attendees: [{
                first_name: 'LoadTest',
                last_name: `User${idx}`,
                email: `loadtest${idx}@test.com`,
                ticket_type_id: freeType.id
              }],
              occurrence_id
            }).then(res => ({
              index: idx,
              status: res.data?.order_number ? 'success' : 'error',
              order_number: res.data?.order_number || null,
              error: res.data?.error || null,
              elapsed_ms: Date.now() - t0
            })).catch(err => ({
              index: idx,
              status: 'error',
              error: err?.response?.data?.error || err.message,
              elapsed_ms: Date.now() - t0
            }));
          })
        );
        allResults.push(...waveResults);
        if (wave + WAVE_SIZE < count) {
          await sleep(WAVE_DELAY_MS);
        }
      }

      const totalElapsed = Date.now() - startTime;
      const fulfilled = allResults.map(r => r.status === 'fulfilled' ? r.value : { status: 'error', error: r.reason?.message });
      const successes = fulfilled.filter(r => r.status === 'success');
      const errors = fulfilled.filter(r => r.status === 'error');

      const timings = fulfilled.filter(r => r.elapsed_ms).map(r => r.elapsed_ms);
      const avgTime = timings.length ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : 0;
      const maxTime = timings.length ? Math.max(...timings) : 0;
      const minTime = timings.length ? Math.min(...timings) : 0;

      const testTickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id,
        ticket_status: 'active'
      });
      const loadTestTickets = testTickets.filter(t => t.attendee_email?.includes('loadtest') && t.attendee_email?.includes('@test.com'));

      console.log(`Checkout test complete: ${successes.length} success, ${errors.length} errors in ${totalElapsed}ms`);

      return Response.json({
        test_type: 'checkout',
        total_requests: count,
        total_elapsed_ms: totalElapsed,
        summary: {
          successes: successes.length,
          errors: errors.length,
        },
        timing: { avg_ms: avgTime, min_ms: minTime, max_ms: maxTime },
        db_test_tickets: loadTestTickets.length,
        details: fulfilled
      });
    }

    if (test_type === 'cleanup') {
      console.log('Cleaning up load test data...');
      
      // Fetch all tickets (up to 500 to be safe)
      const allTickets = await base44.asServiceRole.entities.Ticket.filter({ occurrence_id }, '-created_date', 500);
      const testTickets = allTickets.filter(t => t.attendee_email?.includes('loadtest') && t.attendee_email?.includes('@test.com'));
      
      const orderIds = [...new Set(testTickets.map(t => t.order_id).filter(Boolean))];

      console.log(`Found ${testTickets.length} test tickets and ${orderIds.length} test orders to clean up`);

      // Delete test tickets in batches of 5 with 300ms delay
      const ticketsDeleted = await batchProcess(testTickets, 5, 300, async (t) => {
        await base44.asServiceRole.entities.Ticket.delete(t.id);
      });

      // Delete test orders in batches of 5 with 300ms delay
      const ordersDeleted = await batchProcess(orderIds, 5, 300, async (orderId) => {
        await base44.asServiceRole.entities.Order.delete(orderId);
      });

      // Reset check-in statuses on remaining tickets in batches
      const remaining = allTickets.filter(t => !testTickets.some(tt => tt.id === t.id));
      const checkedIn = remaining.filter(t => t.check_in_status === 'checked_in');
      const resetCount = await batchProcess(checkedIn, 5, 300, async (t) => {
        await base44.asServiceRole.entities.Ticket.update(t.id, {
          check_in_status: 'not_checked_in',
          checked_in_at: '',
          checked_in_by: ''
        });
      });

      console.log(`Cleanup: ${ticketsDeleted} test tickets deleted, ${ordersDeleted} test orders deleted, ${resetCount} check-ins reset`);

      return Response.json({
        test_type: 'cleanup',
        tickets_deleted: ticketsDeleted,
        orders_deleted: ordersDeleted,
        checkins_reset: resetCount
      });
    }

    return Response.json({ error: 'Invalid test_type. Use: checkin, checkout, or cleanup' }, { status: 400 });
  } catch (error) {
    console.error('Load test error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});