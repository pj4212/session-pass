import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import JSZip from 'npm:jszip@3.10.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    console.log('Starting full data export...');

    // Fetch all data in parallel
    const [
      series,
      occurrences,
      ticketTypes,
      tickets,
      orders,
      locations,
      venues,
      platinumLeaders,
      uplineMentors,
      eventTemplates,
      scannerAssignments,
      users,
      workspaces
    ] = await Promise.all([
      base44.asServiceRole.entities.EventSeries.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.EventOccurrence.filter({}, '-created_date', 1000),
      base44.asServiceRole.entities.TicketType.filter({}, '-created_date', 1000),
      base44.asServiceRole.entities.Ticket.filter({}, '-created_date', 5000),
      base44.asServiceRole.entities.Order.filter({}, '-created_date', 5000),
      base44.asServiceRole.entities.Location.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.Venue.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.PlatinumLeader.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.UplineMentor.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.EventTemplate.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.ScannerAssignment.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.User.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.Workspace.filter({}, '-created_date', 500)
    ]);

    console.log(`Fetched: ${series.length} series, ${occurrences.length} occurrences, ${tickets.length} tickets, ${orders.length} orders, ${users.length} users`);

    // Swap roles: admin → super_admin, super_admin → admin (for the new system)
    const mappedUsers = users.map(u => ({
      ...u,
      original_role: u.role,
      role: u.role === 'admin' ? 'super_admin' : u.role === 'super_admin' ? 'admin' : u.role
    }));

    // Build the zip
    const zip = new JSZip();

    // Metadata
    zip.file('_export_meta.json', JSON.stringify({
      exported_at: new Date().toISOString(),
      exported_by: user.email,
      source_app: 'session-pass',
      counts: {
        event_series: series.length,
        event_occurrences: occurrences.length,
        ticket_types: ticketTypes.length,
        tickets: tickets.length,
        orders: orders.length,
        locations: locations.length,
        venues: venues.length,
        platinum_leaders: platinumLeaders.length,
        upline_mentors: uplineMentors.length,
        event_templates: eventTemplates.length,
        scanner_assignments: scannerAssignments.length,
        users: mappedUsers.length,
        workspaces: workspaces.length
      },
      role_mapping_note: 'Roles have been swapped: original admin → super_admin, original super_admin → admin. Original role preserved in original_role field.'
    }, null, 2));

    // Each entity type gets its own file
    zip.file('event_series.json', JSON.stringify(series, null, 2));
    zip.file('event_occurrences.json', JSON.stringify(occurrences, null, 2));
    zip.file('ticket_types.json', JSON.stringify(ticketTypes, null, 2));
    zip.file('tickets.json', JSON.stringify(tickets, null, 2));
    zip.file('orders.json', JSON.stringify(orders, null, 2));
    zip.file('locations.json', JSON.stringify(locations, null, 2));
    zip.file('venues.json', JSON.stringify(venues, null, 2));
    zip.file('platinum_leaders.json', JSON.stringify(platinumLeaders, null, 2));
    zip.file('upline_mentors.json', JSON.stringify(uplineMentors, null, 2));
    zip.file('event_templates.json', JSON.stringify(eventTemplates, null, 2));
    zip.file('scanner_assignments.json', JSON.stringify(scannerAssignments, null, 2));
    zip.file('users.json', JSON.stringify(mappedUsers, null, 2));
    zip.file('workspaces.json', JSON.stringify(workspaces, null, 2));

    // Generate zip as arraybuffer
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    console.log(`Export complete. Zip size: ${(zipBuffer.byteLength / 1024).toFixed(1)} KB`);

    return new Response(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=session-pass-export-${new Date().toISOString().slice(0, 10)}.zip`
      }
    });
  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});