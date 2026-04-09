import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

// Register a single attendee for a Zoom webinar
// Returns { registrant_id, join_url, topic } or null if registration fails
async function registerAttendee(accessToken, webinarId, firstName, lastName, email) {
  const res = await fetch(`https://api.zoom.us/v2/webinars/${webinarId}/registrants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      email: email
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Zoom registrant error for ${email}: ${res.status} ${errText}`);
    return null;
  }

  const data = await res.json();
  console.log(`Zoom registrant created for ${email}: registrant_id=${data.registrant_id}, join_url=${data.join_url}`);
  return {
    registrant_id: data.registrant_id,
    join_url: data.join_url,
    topic: data.topic
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { tickets, occurrence_id } = await req.json();

    if (!tickets || !tickets.length || !occurrence_id) {
      return Response.json({ error: 'tickets array and occurrence_id are required' }, { status: 400 });
    }

    // Load occurrence to get zoom_meeting_id
    const occs = await base44.asServiceRole.entities.EventOccurrence.filter({ id: occurrence_id });
    if (!occs.length) {
      return Response.json({ error: 'Occurrence not found' }, { status: 404 });
    }
    const occurrence = occs[0];

    // Determine webinar ID for Zoom API registration
    // For manual webinars, prefer the WN_ token from the registration URL (it's the correct API identifier)
    // The numeric meeting ID shown in Zoom UI often doesn't work with the registrants API
    let webinarId = '';
    if (occurrence.zoom_link) {
      const wnMatch = occurrence.zoom_link.match(/\/register\/(WN_[A-Za-z0-9_-]+)/);
      if (wnMatch) webinarId = wnMatch[1];
    }
    if (!webinarId && occurrence.zoom_meeting_id) {
      webinarId = occurrence.zoom_meeting_id.replace(/\s/g, '');
    }
    if (!webinarId && occurrence.zoom_link) {
      const numericMatch = occurrence.zoom_link.match(/\/w\/(\d+)/);
      if (numericMatch) webinarId = numericMatch[1];
    }
    if (!webinarId) {
      console.log(`No Zoom webinar ID for occurrence ${occurrence_id}, skipping registration`);
      return Response.json({ success: true, registrations: [], skipped: true, reason: 'no_webinar_id' });
    }
    console.log(`Using webinar ID: ${webinarId} for occurrence ${occurrence_id}`);
    const accessToken = await getZoomAccessToken();

    // For manual webinars, strip custom registration questions that would block our API registration
    if (occurrence.zoom_webinar_mode === 'manual') {
      try {
        const stripRes = await fetch(`https://api.zoom.us/v2/webinars/${webinarId}/registrants/questions`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            questions: [{ field_name: 'last_name', required: true }],
            custom_questions: []
          })
        });
        if (!stripRes.ok) {
          console.warn('Failed to strip custom questions:', stripRes.status, await stripRes.text());
        } else {
          console.log('Stripped custom registration questions for manual webinar');
        }
      } catch (e) {
        console.warn('Error stripping custom questions (non-blocking):', e.message);
      }
    }

    // Only register online tickets
    const onlineTickets = tickets.filter(t => t.attendance_mode === 'online');
    if (!onlineTickets.length) {
      return Response.json({ success: true, registrations: [], skipped: true, reason: 'no_online_tickets' });
    }

    const results = [];
    for (const ticket of onlineTickets) {
      const result = await registerAttendee(
        accessToken,
        webinarId,
        ticket.attendee_first_name,
        ticket.attendee_last_name,
        ticket.attendee_email
      );

      if (result) {
        // Save the join URL on the ticket entity
        try {
          await base44.asServiceRole.entities.Ticket.update(ticket.id, {
            zoom_join_url: result.join_url
          });
        } catch (err) {
          console.error(`Failed to save zoom_join_url on ticket ${ticket.id}:`, err.message);
        }

        results.push({
          ticket_id: ticket.id,
          email: ticket.attendee_email,
          join_url: result.join_url,
          registrant_id: result.registrant_id
        });
      } else {
        results.push({
          ticket_id: ticket.id,
          email: ticket.attendee_email,
          join_url: null,
          error: 'registration_failed'
        });
      }
    }

    console.log(`Registered ${results.filter(r => r.join_url).length}/${onlineTickets.length} attendees for webinar ${webinarId}`);

    return Response.json({ success: true, registrations: results });
  } catch (error) {
    console.error("registerZoomAttendee error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});