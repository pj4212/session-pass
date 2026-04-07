import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Get Zoom Server-to-Server OAuth access token
async function getZoomAccessToken() {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom credentials not configured.");
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const tokenRes = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`
    },
    body: `grant_type=account_credentials&account_id=${accountId}`
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to get Zoom access token: ${tokenRes.status} ${errText}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function createZoomWebinarForSession(occurrence) {
  const accessToken = await getZoomAccessToken();

  const startTime = occurrence.start_datetime || `${occurrence.event_date}T09:00:00`;
  const startDt = new Date(startTime);
  const endDt = occurrence.end_datetime ? new Date(occurrence.end_datetime) : null;
  const eventDurationMins = endDt ? Math.round((endDt - startDt) / 60000) : 60;
  const durationMins = Math.max(120, eventDurationMins + 60);

  const eventTz = occurrence.timezone || "Australia/Brisbane";
  const localStartStr = startDt.toLocaleString('sv-SE', { timeZone: eventTz }).replace(' ', 'T');

  const webinarPayload = {
    topic: occurrence.name,
    type: 5,
    start_time: localStartStr,
    duration: durationMins,
    timezone: eventTz,
    agenda: occurrence.description || `Webinar for ${occurrence.name}`,
    settings: {
      approval_type: 0,
      registration_type: 1,
      host_video: true,
      panelists_video: true,
      registrants_email_notification: false,
      registrants_confirmation_email: false,
      show_share_button: false,
      allow_multiple_devices: true,
      on_demand: false,
      question_and_answer: {
        enable: true,
        allow_submit_questions: true,
        allow_anonymous_questions: false
      }
    }
  };

  const createRes = await fetch("https://api.zoom.us/v2/users/me/webinars", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify(webinarPayload)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create Zoom webinar: ${createRes.status} ${errText}`);
  }

  const webinar = await createRes.json();

  // Simplify registration questions
  await fetch(`https://api.zoom.us/v2/webinars/${webinar.id}/registrants/questions`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      questions: [{ field_name: "last_name", required: true }],
      custom_questions: []
    })
  });

  return {
    registration_url: webinar.registration_url,
    webinar_id: String(webinar.id)
  };
}

// Date helpers
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localDate(dateStr) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function getMonday(dateStr) {
  const d = localDate(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return toLocalDateStr(monday);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    const todayStr = toLocalDateStr(now);

    // Look 3 weeks ahead
    const threeWeeksOut = new Date(now);
    threeWeeksOut.setDate(threeWeeksOut.getDate() + 21);
    const threeWeeksStr = toLocalDateStr(threeWeeksOut);

    // Load all events and ticket types
    const [allEvents, allTicketTypes] = await Promise.all([
      base44.asServiceRole.entities.EventOccurrence.filter({}),
      base44.asServiceRole.entities.TicketType.filter({})
    ]);

    // Group events by series
    const bySeries = {};
    for (const ev of allEvents) {
      if (ev.series_id && ev.recurrence_pattern) {
        if (!bySeries[ev.series_id]) bySeries[ev.series_id] = [];
        bySeries[ev.series_id].push(ev);
      }
    }

    // Group ticket types by occurrence
    const ttByOccurrence = {};
    for (const tt of allTicketTypes) {
      if (!ttByOccurrence[tt.occurrence_id]) ttByOccurrence[tt.occurrence_id] = [];
      ttByOccurrence[tt.occurrence_id].push(tt);
    }

    // Build set of existing event dates+names for dedup
    const existingKeys = new Set();
    for (const ev of allEvents) {
      existingKeys.add(`${ev.name}__${ev.event_date?.slice(0, 10)}`);
    }

    // Determine fortnightly reference weeks
    function getRefMonday(events, pattern) {
      const matching = events.filter(e => e.recurrence_pattern === pattern);
      if (!matching.length) return null;
      return localDate(getMonday(matching[0].event_date));
    }

    let createdCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const [seriesId, seriesEvents] of Object.entries(bySeries)) {
      const refAMonday = getRefMonday(seriesEvents, 'fortnightly_A');
      const refBMonday = getRefMonday(seriesEvents, 'fortnightly_B');

      function isWeekA(mondayDate) {
        if (refAMonday) return Math.round((mondayDate - refAMonday) / (7 * 86400000)) % 2 === 0;
        if (refBMonday) return Math.round((mondayDate - refBMonday) / (7 * 86400000)) % 2 !== 0;
        return true;
      }

      // Build templates from existing events (deduplicate by dayOfWeek+name)
      function buildTemplates(list) {
        const seen = new Set();
        return list.filter(s => {
          const key = `${localDate(s.event_date).getDay()}-${s.name}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).map(s => ({
          dayOfWeek: localDate(s.event_date).getDay(),
          source: s,
        }));
      }

      const weeklySessions = seriesEvents.filter(s => s.recurrence_pattern === 'weekly');
      const fortnightlyA = seriesEvents.filter(s => s.recurrence_pattern === 'fortnightly_A');
      const fortnightlyB = seriesEvents.filter(s => s.recurrence_pattern === 'fortnightly_B');

      const weeklyT = buildTemplates(weeklySessions);
      const aT = buildTemplates(fortnightlyA);
      const bT = buildTemplates(fortnightlyB);

      // Iterate over weeks from today to 3 weeks out
      const startMonday = localDate(getMonday(todayStr));
      const current = new Date(startMonday);
      const endDate = new Date(threeWeeksOut);

      while (current <= endDate) {
        const mondayStr = toLocalDateStr(current);
        const weekIsA = isWeekA(current);
        const fortnightlyTemplates = weekIsA ? aT : bT;
        const allTemplates = [...weeklyT, ...fortnightlyTemplates];

        for (const tmpl of allTemplates) {
          const targetDay = tmpl.dayOfWeek;
          const mondayDate = localDate(mondayStr);
          const dayOffset = targetDay === 0 ? 6 : targetDay - 1;
          const sessionDate = new Date(mondayDate);
          sessionDate.setDate(sessionDate.getDate() + dayOffset);
          const dateStr = toLocalDateStr(sessionDate);

          // Skip past dates
          if (dateStr < todayStr) {
            current.setDate(current.getDate() + 7);
            continue;
          }

          // Skip if already exists
          const key = `${tmpl.source.name}__${dateStr}`;
          if (existingKeys.has(key)) {
            continue;
          }

          // Compute start/end times based on source
          const origStart = new Date(tmpl.source.start_datetime);
          const origEnd = new Date(tmpl.source.end_datetime);
          const newStart = new Date(sessionDate);
          newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
          const newEnd = new Date(sessionDate);
          newEnd.setHours(origEnd.getHours(), origEnd.getMinutes(), 0, 0);

          // Compute sales close (1 hour after end)
          const salesClose = new Date(newEnd.getTime() + 60 * 60 * 1000).toISOString();

          const isOnline = tmpl.source.event_mode === 'online_stream';
          const isHybrid = tmpl.source.event_mode === 'hybrid';

          const newData = {
            template_id: tmpl.source.template_id || '',
            series_id: tmpl.source.series_id || '',
            name: tmpl.source.name,
            slug: tmpl.source.slug + '-' + dateStr,
            description: tmpl.source.description || '',
            event_date: dateStr,
            start_datetime: newStart.toISOString(),
            end_datetime: newEnd.toISOString(),
            timezone: tmpl.source.timezone || 'Australia/Brisbane',
            event_mode: tmpl.source.event_mode,
            recurrence_pattern: tmpl.source.recurrence_pattern || '',
            location_id: tmpl.source.location_id || '',
            venue_id: '', // Always blank for new sessions
            venue_name: '',
            venue_link: '',
            parking_link: '',
            venue_details: '',
            venue_confirmed: false,
            zoom_webinar_mode: tmpl.source.zoom_webinar_mode || 'auto',
            is_published: false,
            status: 'draft',
            sales_close_date: salesClose,
          };

          console.log(`Creating session: ${newData.name} on ${dateStr}`);
          const created = await base44.asServiceRole.entities.EventOccurrence.create(newData);
          existingKeys.add(key);

          // Copy ticket types from source
          const sourceTTs = ttByOccurrence[tmpl.source.id] || [];
          for (const tt of sourceTTs) {
            await base44.asServiceRole.entities.TicketType.create({
              occurrence_id: created.id,
              name: tt.name,
              attendance_mode: tt.attendance_mode,
              ticket_category: tt.ticket_category || '',
              price: tt.price,
              requires_payment: tt.requires_payment,
              capacity_limit: tt.capacity_limit,
              is_active: tt.is_active,
              sort_order: tt.sort_order,
              description: tt.description || '',
              quantity_sold: 0,
            });
          }

          // For online/hybrid events with auto mode, create Zoom webinar immediately
          if ((isOnline || isHybrid) && (newData.zoom_webinar_mode === 'auto')) {
            try {
              console.log(`Creating Zoom webinar for: ${newData.name} (${dateStr})`);
              const zoom = await createZoomWebinarForSession(created);
              await base44.asServiceRole.entities.EventOccurrence.update(created.id, {
                zoom_link: zoom.registration_url,
                zoom_meeting_id: zoom.webinar_id,
              });
              console.log(`Zoom webinar created for ${newData.name}: ${zoom.registration_url}`);
              results.push({ name: newData.name, date: dateStr, action: 'created_with_zoom', zoom_url: zoom.registration_url });
            } catch (zoomErr) {
              console.error(`Failed to create Zoom webinar for ${newData.name}:`, zoomErr.message);
              results.push({ name: newData.name, date: dateStr, action: 'created_without_zoom', error: zoomErr.message });
            }
          } else {
            results.push({ name: newData.name, date: dateStr, action: 'created_draft' });
          }

          createdCount++;
        }

        current.setDate(current.getDate() + 7);
      }
    }

    console.log(`Auto-create complete: ${createdCount} sessions created, ${skippedCount} skipped`);
    return Response.json({ created: createdCount, skipped: skippedCount, results });
  } catch (error) {
    console.error("autoCreateSessions error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});