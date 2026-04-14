import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch all entity data in parallel
  const [
    workspaces,
    eventSeries,
    eventTemplates,
    eventOccurrences,
    ticketTypes,
    tickets,
    orders,
    locations,
    venues,
    platinumLeaders,
    uplineMentors,
    scannerAssignments,
    checkInLogs
  ] = await Promise.all([
    base44.asServiceRole.entities.Workspace.filter({}, '-created_date', 1000),
    base44.asServiceRole.entities.EventSeries.filter({}, '-created_date', 1000),
    base44.asServiceRole.entities.EventTemplate.filter({}, '-created_date', 1000),
    base44.asServiceRole.entities.EventOccurrence.filter({}, '-created_date', 1000),
    base44.asServiceRole.entities.TicketType.filter({}, '-created_date', 5000),
    base44.asServiceRole.entities.Ticket.filter({}, '-created_date', 5000),
    base44.asServiceRole.entities.Order.filter({}, '-created_date', 5000),
    base44.asServiceRole.entities.Location.filter({}, '-created_date', 1000),
    base44.asServiceRole.entities.Venue.filter({}, '-created_date', 1000),
    base44.asServiceRole.entities.PlatinumLeader.filter({}, '-created_date', 1000),
    base44.asServiceRole.entities.UplineMentor.filter({}, '-created_date', 1000),
    base44.asServiceRole.entities.ScannerAssignment.filter({}, '-created_date', 1000),
    base44.asServiceRole.entities.CheckInLog.filter({}, '-created_date', 5000),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    exported_by: user.email,
    entities: {
      workspaces,
      event_series: eventSeries,
      event_templates: eventTemplates,
      event_occurrences: eventOccurrences,
      ticket_types: ticketTypes,
      tickets,
      orders,
      locations,
      venues,
      platinum_leaders: platinumLeaders,
      upline_mentors: uplineMentors,
      scanner_assignments: scannerAssignments,
      check_in_logs: checkInLogs,
    },
    counts: {
      workspaces: workspaces.length,
      event_series: eventSeries.length,
      event_templates: eventTemplates.length,
      event_occurrences: eventOccurrences.length,
      ticket_types: ticketTypes.length,
      tickets: tickets.length,
      orders: orders.length,
      locations: locations.length,
      venues: venues.length,
      platinum_leaders: platinumLeaders.length,
      upline_mentors: uplineMentors.length,
      scanner_assignments: scannerAssignments.length,
      check_in_logs: checkInLogs.length,
    }
  };

  const jsonString = JSON.stringify(exportData, null, 2);

  return new Response(jsonString, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename=session_pass_full_export.json'
    }
  });
});