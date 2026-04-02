import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { occurrence_id, attendees } = await req.json();

    const errors = [];

    for (const att of attendees) {
      const existingTickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id,
        attendee_email: att.email.toLowerCase(),
        attendance_mode: att.attendance_mode,
        ticket_status: 'active'
      });

      if (existingTickets.length > 0) {
        errors.push({
          email: att.email,
          attendance_mode: att.attendance_mode,
          message: `${att.email} already has an active ${att.attendance_mode === 'online' ? 'online' : 'in-person'} ticket for this event.`
        });
      }
    }

    return Response.json({ valid: errors.length === 0, errors });
  } catch (error) {
    console.error("validateTickets error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});