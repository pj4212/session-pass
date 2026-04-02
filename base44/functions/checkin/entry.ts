import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, ticket_id, occurrence_id, qr_hash } = body;

    if (action === 'checkin') {
      // Fetch ticket
      let ticket;
      try {
        const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: ticket_id });
        if (!tickets.length) {
          return Response.json({ status: 'error', reason: 'Ticket not found' });
        }
        ticket = tickets[0];
      } catch (e) {
        console.error('Ticket lookup failed:', e.message);
        return Response.json({ status: 'error', reason: 'Ticket not found' });
      }

      // Validate QR hash if provided
      if (qr_hash && ticket.qr_code_hash !== qr_hash) {
        return Response.json({ status: 'error', reason: 'Invalid ticket' });
      }

      // Check occurrence match and date
      let crossEventWarning = null;
      if (occurrence_id && ticket.occurrence_id !== occurrence_id) {
        // Ticket is for a different event — check if it's at least today's date
        let ticketEvent = null;
        try {
          const evts = await base44.asServiceRole.entities.EventOccurrence.filter({ id: ticket.occurrence_id });
          if (evts.length) ticketEvent = evts[0];
        } catch (e) { /* ignore */ }

        const today = new Date().toISOString().slice(0, 10);
        const ticketDate = ticketEvent?.event_date || '';

        if (ticketDate !== today) {
          const eventName = ticketEvent?.name || 'Unknown event';
          return Response.json({ 
            status: 'error', 
            reason: `Wrong date — ticket is for ${eventName} on ${ticketDate || 'unknown date'}`,
            ticket
          });
        }

        // Same date but different event — allow with warning
        crossEventWarning = ticketEvent?.name || 'a different event';
      }

      // Check ticket status
      if (ticket.ticket_status === 'cancelled') {
        return Response.json({ status: 'error', reason: 'Ticket cancelled' });
      }
      if (ticket.ticket_status === 'refunded') {
        return Response.json({ status: 'error', reason: 'Ticket refunded' });
      }

      // Check if already checked in (atomic guard)
      if (ticket.check_in_status === 'checked_in') {
        return Response.json({ 
          status: 'warning', 
          reason: `Already checked in at ${ticket.checked_in_at || 'unknown time'}`,
          ticket
        });
      }

      // Perform check-in
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.Ticket.update(ticket.id, {
        check_in_status: 'checked_in',
        checked_in_at: now,
        checked_in_by: user.id
      });

      // Write CheckInLog
      await base44.asServiceRole.entities.CheckInLog.create({
        ticket_id: ticket.id,
        occurrence_id: ticket.occurrence_id,
        action: 'check_in',
        performed_by: user.id
      });

      // Build warnings list
      const warnings = [];
      if (crossEventWarning) {
        warnings.push(`Different event: ${crossEventWarning}`);
      }
      if (ticket.attendance_mode === 'online') {
        warnings.push('Online ticket — not for in-person entry');
      }

      if (warnings.length > 0) {
        return Response.json({ 
          status: 'warning_checked_in',
          reason: warnings.join(' | '),
          ticket: { ...ticket, check_in_status: 'checked_in', checked_in_at: now }
        });
      }

      return Response.json({ 
        status: 'success',
        ticket: { ...ticket, check_in_status: 'checked_in', checked_in_at: now }
      });
    }

    if (action === 'undo_checkin') {
      const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: ticket_id });
      if (!tickets.length) {
        return Response.json({ status: 'error', reason: 'Invalid ticket' });
      }
      const ticket = tickets[0];

      if (ticket.check_in_status !== 'checked_in') {
        return Response.json({ status: 'warning', reason: 'Not checked in' });
      }

      await base44.asServiceRole.entities.Ticket.update(ticket.id, {
        check_in_status: 'not_checked_in',
        checked_in_at: '',
        checked_in_by: ''
      });

      await base44.asServiceRole.entities.CheckInLog.create({
        ticket_id: ticket.id,
        occurrence_id: ticket.occurrence_id,
        action: 'undo_check_in',
        performed_by: user.id
      });

      return Response.json({ 
        status: 'success',
        ticket: { ...ticket, check_in_status: 'not_checked_in', checked_in_at: '', checked_in_by: '' }
      });
    }

    if (action === 'poll') {
      // Return all tickets for this occurrence with their check-in status
      // Frontend handles delta comparison
      const tickets = await base44.asServiceRole.entities.Ticket.filter({ 
        occurrence_id,
        ticket_status: 'active'
      });
      const slim = tickets.map(t => ({
        id: t.id,
        check_in_status: t.check_in_status,
        checked_in_at: t.checked_in_at || ''
      }));
      return Response.json({ status: 'success', tickets: slim });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error("checkin error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});