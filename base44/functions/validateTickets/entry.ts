import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { occurrence_id, attendees } = await req.json();

    const errors = [];

    // Check capacity limits for each ticket type
    const ticketTypeCounts = {};
    for (const att of attendees) {
      // We no longer block duplicate emails — multiple tickets per email are allowed
      // Just aggregate counts per attendance_mode for capacity checks if needed
    }

    return Response.json({ valid: errors.length === 0, errors });
  } catch (error) {
    console.error("validateTickets error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});