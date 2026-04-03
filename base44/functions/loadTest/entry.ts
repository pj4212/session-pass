import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function generateQrHash(ticketId, occurrenceId) {
  const salt = Deno.env.get("QR_SECRET_SALT");
  const data = new TextEncoder().encode(ticketId + occurrenceId + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12);
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
    const count = Math.min(concurrency || 15, 50); // cap at 50

    if (test_type === 'checkin') {
      // Get active tickets for this occurrence
      const allTickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id,
        ticket_status: 'active'
      });

      if (allTickets.length === 0) {
        return Response.json({ error: 'No active tickets found for this event. Create test tickets first.' }, { status: 400 });
      }

      // Reset all tickets to not_checked_in first
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
      console.log(`Starting concurrent check-in test with ${testTickets.length} tickets...`);

      const startTime = Date.now();
      const results = await Promise.allSettled(
        testTickets.map(async (ticket, idx) => {
          const t0 = Date.now();
          const res = await base44.functions.invoke('checkin', {
            action: 'checkin',
            ticket_id: ticket.id,
            occurrence_id,
            qr_hash: ticket.qr_code_hash
          });
          const elapsed = Date.now() - t0;
          return { 
            index: idx, 
            ticket_id: ticket.id, 
            status: res.data?.status, 
            reason: res.data?.reason || null,
            elapsed_ms: elapsed 
          };
        })
      );

      const totalElapsed = Date.now() - startTime;
      const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success');
      const warnings = results.filter(r => r.status === 'fulfilled' && (r.value.status === 'warning' || r.value.status === 'warning_checked_in'));
      const errors = results.filter(r => r.status === 'fulfilled' && r.value.status === 'error');
      const failures = results.filter(r => r.status === 'rejected');

      const timings = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.elapsed_ms);
      const avgTime = timings.length ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : 0;
      const maxTime = timings.length ? Math.max(...timings) : 0;
      const minTime = timings.length ? Math.min(...timings) : 0;

      // Verify actual DB state — check for double check-ins
      const verifyTickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id,
        ticket_status: 'active',
        check_in_status: 'checked_in'
      });

      console.log(`Check-in test complete: ${successes.length} success, ${warnings.length} warnings, ${errors.length} errors, ${failures.length} failures`);
      console.log(`DB shows ${verifyTickets.length} checked-in tickets (expected: ${successes.length})`);

      return Response.json({
        test_type: 'checkin',
        total_requests: testTickets.length,
        total_elapsed_ms: totalElapsed,
        summary: {
          successes: successes.length,
          warnings: warnings.length,
          errors: errors.length,
          failures: failures.length,
        },
        timing: { avg_ms: avgTime, min_ms: minTime, max_ms: maxTime },
        db_verified_checkins: verifyTickets.length,
        expected_checkins: successes.length,
        integrity_ok: verifyTickets.length === successes.length,
        details: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message })
      });
    }

    if (test_type === 'checkout') {
      // Create N concurrent free-ticket checkout requests
      const occurrence = (await base44.asServiceRole.entities.EventOccurrence.filter({ id: occurrence_id }))[0];
      if (!occurrence) {
        return Response.json({ error: 'Event occurrence not found' }, { status: 404 });
      }

      // Find a free ticket type
      const ticketTypes = await base44.asServiceRole.entities.TicketType.filter({ occurrence_id });
      const freeType = ticketTypes.find(tt => (tt.price || 0) === 0 && tt.is_active);
      if (!freeType) {
        return Response.json({ error: 'No free ticket type found for this event. Add a free ticket type first.' }, { status: 400 });
      }

      console.log(`Starting concurrent checkout test with ${count} requests for free ticket type "${freeType.name}"...`);

      const startTime = Date.now();
      const results = await Promise.allSettled(
        Array.from({ length: count }, (_, idx) => {
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
            status: res.status < 400 ? 'success' : 'error',
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

      const totalElapsed = Date.now() - startTime;
      const fulfilled = results.map(r => r.status === 'fulfilled' ? r.value : { status: 'error', error: r.reason?.message });
      const successes = fulfilled.filter(r => r.status === 'success');
      const errors = fulfilled.filter(r => r.status === 'error');

      const timings = fulfilled.filter(r => r.elapsed_ms).map(r => r.elapsed_ms);
      const avgTime = timings.length ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : 0;
      const maxTime = timings.length ? Math.max(...timings) : 0;
      const minTime = timings.length ? Math.min(...timings) : 0;

      // Verify DB — count tickets created for test emails
      const testTickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id,
        ticket_status: 'active'
      });
      const loadTestTickets = testTickets.filter(t => t.attendee_email?.includes('loadtest') && t.attendee_email?.includes('@test.com'));

      console.log(`Checkout test complete: ${successes.length} success, ${errors.length} errors`);
      console.log(`DB shows ${loadTestTickets.length} test tickets created`);

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
      // Remove all loadtest tickets and orders
      console.log('Cleaning up load test data...');
      
      const allTickets = await base44.asServiceRole.entities.Ticket.filter({ occurrence_id });
      const testTickets = allTickets.filter(t => t.attendee_email?.includes('loadtest') && t.attendee_email?.includes('@test.com'));
      
      const orderIds = new Set(testTickets.map(t => t.order_id));
      
      let ticketsDeleted = 0;
      for (const t of testTickets) {
        await base44.asServiceRole.entities.Ticket.delete(t.id);
        ticketsDeleted++;
      }

      let ordersDeleted = 0;
      for (const orderId of orderIds) {
        await base44.asServiceRole.entities.Order.delete(orderId);
        ordersDeleted++;
      }

      // Reset check-in statuses on remaining tickets
      const remaining = allTickets.filter(t => !testTickets.includes(t));
      let resetCount = 0;
      for (const t of remaining) {
        if (t.check_in_status === 'checked_in') {
          await base44.asServiceRole.entities.Ticket.update(t.id, {
            check_in_status: 'not_checked_in',
            checked_in_at: '',
            checked_in_by: ''
          });
          resetCount++;
        }
      }

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