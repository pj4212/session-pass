import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Authenticate via shared API key (passed as Bearer token or ?api_key= query param)
function authenticateRequest(req) {
  const expectedKey = Deno.env.get("DATA_SYNC_API_KEY");
  if (!expectedKey) throw new Error("DATA_SYNC_API_KEY not configured");

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    if (authHeader.slice(7) === expectedKey) return true;
  }

  const url = new URL(req.url);
  if (url.searchParams.get("api_key") === expectedKey) return true;

  return false;
}

// Get Monday of a given date string (YYYY-MM-DD)
function getMonday(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  const fy = date.getFullYear();
  const fm = String(date.getMonth() + 1).padStart(2, '0');
  const fd = String(date.getDate()).padStart(2, '0');
  return `${fy}-${fm}-${fd}`;
}

Deno.serve(async (req) => {
  // CORS headers for cross-origin calls
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type"
      }
    });
  }

  try {
    if (!authenticateRequest(req)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    // Parse optional filters from query params
    const url = new URL(req.url);
    const seriesFilter = url.searchParams.get("series_id"); // optional: filter by series
    const weekFilter = url.searchParams.get("week"); // optional: filter by week (YYYY-MM-DD monday)
    const sinceFilter = url.searchParams.get("since"); // optional: only tickets updated since (ISO datetime)

    // Load all reference data in parallel
    const [allSeries, allOccurrences, allMentors, allLeaders] = await Promise.all([
      base44.asServiceRole.entities.EventSeries.filter({}),
      base44.asServiceRole.entities.EventOccurrence.filter({}),
      base44.asServiceRole.entities.UplineMentor.filter({}),
      base44.asServiceRole.entities.PlatinumLeader.filter({})
    ]);

    // Build lookup maps
    const seriesMap = {};
    for (const s of allSeries) seriesMap[s.id] = s.name;

    const occurrenceMap = {};
    for (const o of allOccurrences) occurrenceMap[o.id] = o;

    const mentorMap = {};
    for (const m of allMentors) mentorMap[m.id] = m.name;

    const leaderMap = {};
    for (const l of allLeaders) leaderMap[l.id] = l.name;

    // Load ticket types
    const allTicketTypes = await base44.asServiceRole.entities.TicketType.filter({});
    const ticketTypeMap = {};
    for (const tt of allTicketTypes) ticketTypeMap[tt.id] = tt;

    // Load active tickets (optionally filtered by updated_date)
    let tickets;
    if (sinceFilter) {
      tickets = await base44.asServiceRole.entities.Ticket.filter({ ticket_status: 'active' });
      tickets = tickets.filter(t => t.updated_date >= sinceFilter);
    } else {
      tickets = await base44.asServiceRole.entities.Ticket.filter({ ticket_status: 'active' });
    }

    // Filter by series if specified
    let relevantOccurrenceIds = null;
    if (seriesFilter) {
      relevantOccurrenceIds = new Set(
        allOccurrences.filter(o => o.series_id === seriesFilter).map(o => o.id)
      );
    }

    // Organize tickets by week
    const weekMap = {};

    for (const ticket of tickets) {
      if (relevantOccurrenceIds && !relevantOccurrenceIds.has(ticket.occurrence_id)) continue;

      const occurrence = occurrenceMap[ticket.occurrence_id];
      if (!occurrence) continue;

      const monday = getMonday(occurrence.event_date);
      if (weekFilter && monday !== weekFilter) continue;

      if (!weekMap[monday]) {
        weekMap[monday] = {
          week_starting: monday,
          tickets: []
        };
      }

      const tt = ticketTypeMap[ticket.ticket_type_id];

      weekMap[monday].tickets.push({
        ticket_id: ticket.id,
        attendee_first_name: ticket.attendee_first_name,
        attendee_last_name: ticket.attendee_last_name,
        attendee_email: ticket.attendee_email,
        attendance_mode: ticket.attendance_mode,
        ticket_type: tt?.name || '',
        ticket_category: tt?.ticket_category || '',
        check_in_status: ticket.check_in_status,
        event_name: occurrence.name,
        event_date: occurrence.event_date,
        series_id: occurrence.series_id || '',
        series_name: seriesMap[occurrence.series_id] || '',
        upline_mentor: mentorMap[ticket.upline_mentor_id] || '',
        upline_mentor_id: ticket.upline_mentor_id || '',
        platinum_leader: leaderMap[ticket.platinum_leader_id] || '',
        platinum_leader_id: ticket.platinum_leader_id || '',
        created_date: ticket.created_date,
        updated_date: ticket.updated_date
      });
    }

    // Sort weeks chronologically and tickets by event date then name
    const weeks = Object.values(weekMap)
      .sort((a, b) => a.week_starting.localeCompare(b.week_starting));

    for (const week of weeks) {
      week.tickets.sort((a, b) => {
        if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
        return a.attendee_last_name.localeCompare(b.attendee_last_name);
      });
      week.ticket_count = week.tickets.length;
      week.candidate_count = week.tickets.filter(t => t.ticket_category === 'candidate').length;
      week.business_owner_count = week.tickets.filter(t => t.ticket_category === 'business_owner').length;
    }

    // Also return available series for filtering
    const seriesList = allSeries.map(s => ({ id: s.id, name: s.name }));

    return Response.json({
      generated_at: new Date().toISOString(),
      total_tickets: weeks.reduce((sum, w) => sum + w.ticket_count, 0),
      series: seriesList,
      weeks
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      }
    });
  } catch (error) {
    console.error("dataSyncApi error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});