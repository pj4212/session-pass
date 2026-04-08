import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { Resend } from 'npm:resend@3.2.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

async function logRateLimit(base44, label, error, attempt) {
    if (base44) {
        try {
            await base44.asServiceRole.entities.RateLimitLog.create({
                operation_label: label,
                error_message: error.message || 'Unknown error',
                status_code: error.statusCode || error.status || null,
                attempt: attempt,
            });
        } catch (logErr) {
            console.error(`Failed to log rate limit event for ${label}:`, logErr.message);
        }
    }
}
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ticket_id, target_ticket_type_id, target_occurrence_id } = await req.json();

    if (!ticket_id || !target_ticket_type_id) {
      return Response.json({ error: 'ticket_id and target_ticket_type_id are required' }, { status: 400 });
    }

    // Load ticket
    const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: ticket_id });
    if (!tickets.length) {
      return Response.json({ error: 'Ticket not found' }, { status: 404 });
    }
    const ticket = tickets[0];

    if (ticket.ticket_status !== 'active') {
      return Response.json({ error: 'Only active tickets can be converted' }, { status: 400 });
    }

    // Load target ticket type
    const targetTTs = await base44.asServiceRole.entities.TicketType.filter({ id: target_ticket_type_id });
    if (!targetTTs.length) {
      return Response.json({ error: 'Target ticket type not found' }, { status: 404 });
    }
    const targetTT = targetTTs[0];
    const newMode = targetTT.attendance_mode;

    // Determine the occurrence to use
    const occurrenceId = target_occurrence_id || ticket.occurrence_id;

    // Load occurrence
    const occs = await base44.asServiceRole.entities.EventOccurrence.filter({ id: occurrenceId });
    if (!occs.length) {
      return Response.json({ error: 'Occurrence not found' }, { status: 404 });
    }
    const occurrence = occs[0];

    // Check capacity for in-person
    if (newMode === 'in_person' && targetTT.capacity_limit != null) {
      if ((targetTT.quantity_sold || 0) >= targetTT.capacity_limit) {
        return Response.json({ error: `No capacity remaining for "${targetTT.name}"` }, { status: 400 });
      }
    }

    // Decrement old ticket type quantity_sold
    const oldTTs = await base44.asServiceRole.entities.TicketType.filter({ id: ticket.ticket_type_id });
    if (oldTTs.length && (oldTTs[0].quantity_sold || 0) > 0) {
      await base44.asServiceRole.entities.TicketType.update(oldTTs[0].id, {
        quantity_sold: (oldTTs[0].quantity_sold || 0) - 1
      });
    }

    // Increment new ticket type quantity_sold
    await base44.asServiceRole.entities.TicketType.update(targetTT.id, {
      quantity_sold: (targetTT.quantity_sold || 0) + 1
    });

    // Generate QR hash for in-person
    let qrHash = ticket.qr_code_hash;
    if (newMode === 'in_person') {
      qrHash = await generateQrHash(ticket.id, occurrenceId);
    }

    // Update ticket
    const updateData = {
      attendance_mode: newMode,
      ticket_type_id: target_ticket_type_id,
      qr_code_hash: qrHash,
    };
    if (target_occurrence_id) {
      updateData.occurrence_id = target_occurrence_id;
    }
    await base44.asServiceRole.entities.Ticket.update(ticket.id, updateData);

    // If converting to online, register with Zoom webinar
    let joinUrl = null;
    if (newMode === 'online' && occurrence.zoom_meeting_id) {
      try {
        const zoomRes = await base44.asServiceRole.functions.invoke('registerZoomAttendee', {
          tickets: [{
            id: ticket.id,
            attendance_mode: 'online',
            attendee_first_name: ticket.attendee_first_name,
            attendee_last_name: ticket.attendee_last_name,
            attendee_email: ticket.attendee_email
          }],
          occurrence_id: occurrenceId
        });
        const zoomData = zoomRes?.data || zoomRes;
        if (zoomData?.registrations?.[0]?.join_url) {
          joinUrl = zoomData.registrations[0].join_url;
        }
        console.log(`Zoom registration for converted ticket: joinUrl=${joinUrl}`);
      } catch (err) {
        console.error('Zoom registration during conversion failed (non-blocking):', err.message);
      }
    }

    // Send email
    const html = buildConversionEmailHtml(
      { ...ticket, ...updateData },
      occurrence,
      newMode,
      newMode === 'in_person' ? qrHash : null,
      joinUrl
    );

    const modeLabel = newMode === 'online' ? 'Online' : 'In-Person';
    await resend.emails.send({
      from: 'Session Pass <noreply@session-pass.com>',
      to: ticket.attendee_email,
      subject: `Your Ticket Has Been Changed to ${modeLabel} — ${occurrence.name}`,
      html: html
    });

    console.log(`Ticket ${ticket.id} converted to ${newMode} for ${ticket.attendee_email}`);

    return Response.json({
      success: true,
      new_mode: newMode,
      ticket_id: ticket.id,
      new_ticket_type_id: target_ticket_type_id,
      qr_code_hash: qrHash,
    });
  } catch (error) {
    console.error("convertTicketMode error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});