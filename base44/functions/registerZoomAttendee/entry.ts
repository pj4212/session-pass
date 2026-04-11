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

// Fetch custom registration questions for a webinar so we know exact titles
async function getWebinarQuestions(accessToken, webinarId) {
  try {
    const res = await fetch(`https://api.zoom.us/v2/webinars/${webinarId}/registrants/questions`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      console.warn(`Failed to fetch webinar questions: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return data.custom_questions || [];
  } catch (e) {
    console.warn('Error fetching webinar questions:', e.message);
    return [];
  }
}

// Register a single attendee for a Zoom webinar with retry logic
// Returns { registrant_id, join_url, topic } or null if all attempts fail
async function registerAttendee(accessToken, webinarId, firstName, lastName, email, customAnswers, maxRetries = 3) {
  const body = {
    first_name: firstName,
    last_name: lastName,
    email: email
  };
  if (customAnswers && customAnswers.length > 0) {
    body.custom_questions = customAnswers;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(`https://api.zoom.us/v2/webinars/${webinarId}/registrants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`Zoom registrant created for ${email}: registrant_id=${data.registrant_id}, join_url=${data.join_url}`);
      return {
        registrant_id: data.registrant_id,
        join_url: data.join_url,
        topic: data.topic
      };
    }

    const errText = await res.text();
    const status = res.status;

    // Don't retry on client errors (400, 404, etc.) — only on 429 or 5xx
    if (status < 429 && status >= 400) {
      console.error(`Zoom registrant error for ${email} (non-retryable ${status}): ${errText}`);
      return null;
    }

    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) + Math.random() * 500;
      console.warn(`Zoom registration for ${email} attempt ${attempt} failed (${status}), retrying in ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    } else {
      console.error(`Zoom registrant error for ${email} after ${maxRetries} attempts: ${status} ${errText}`);
      return null;
    }
  }
  return null;
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
    // Prefer numeric meeting ID (works with Server-to-Server OAuth on the account that owns the webinar)
    // The WN_ token from registration URLs often fails with 404 via S2S OAuth
    let webinarId = '';
    if (occurrence.zoom_meeting_id) {
      webinarId = occurrence.zoom_meeting_id.replace(/\s/g, '');
    }
    if (!webinarId && occurrence.zoom_link) {
      const numericMatch = occurrence.zoom_link.match(/\/w\/(\d+)/);
      if (numericMatch) webinarId = numericMatch[1];
    }
    if (!webinarId && occurrence.zoom_link) {
      const wnMatch = occurrence.zoom_link.match(/\/register\/(WN_[A-Za-z0-9_-]+)/);
      if (wnMatch) webinarId = wnMatch[1];
    }
    console.log(`Using webinar ID: ${webinarId} for occurrence ${occurrence_id}`);
    const accessToken = await getZoomAccessToken();

    // Fetch custom questions for the webinar so we can answer them
    const customQuestions = await getWebinarQuestions(accessToken, webinarId);
    console.log(`Webinar has ${customQuestions.length} custom questions: ${customQuestions.map(q => q.title).join(', ')}`);

    // Load platinum leaders if any custom question might need them
    let platinumLeaderMap = {};
    if (customQuestions.length > 0) {
      try {
        const leaders = await base44.asServiceRole.entities.PlatinumLeader.filter({});
        for (const l of leaders) {
          platinumLeaderMap[l.id] = l.name;
        }
      } catch (e) {
        console.warn('Failed to load platinum leaders:', e.message);
      }
    }

    // Only register online tickets
    const onlineTickets = tickets.filter(t => t.attendance_mode === 'online');
    if (!onlineTickets.length) {
      return Response.json({ success: true, registrations: [], skipped: true, reason: 'no_online_tickets' });
    }

    const results = [];
    for (const ticket of onlineTickets) {
      // Build custom question answers from ticket data
      const customAnswers = [];
      for (const q of customQuestions) {
        const titleLower = (q.title || '').toLowerCase();
        if (titleLower.includes('platinum') || titleLower.includes('leader')) {
          const leaderName = platinumLeaderMap[ticket.platinum_leader_id] || '';
          if (leaderName) {
            customAnswers.push({ title: q.title, value: leaderName });
          }
        }
      }

      const result = await registerAttendee(
        accessToken,
        webinarId,
        ticket.attendee_first_name,
        ticket.attendee_last_name,
        ticket.attendee_email,
        customAnswers
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