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

// Find registrant ID by email by listing all registrants for the webinar
async function findRegistrantByEmail(accessToken, webinarId, email) {
  const lowerEmail = email.toLowerCase();
  let nextPageToken = '';
  
  do {
    const url = `https://api.zoom.us/v2/webinars/${webinarId}/registrants?page_size=300${nextPageToken ? `&next_page_token=${nextPageToken}` : ''}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      console.error(`Failed to list registrants: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const match = (data.registrants || []).find(r => r.email.toLowerCase() === lowerEmail);
    if (match) return match.id;
    
    nextPageToken = data.next_page_token || '';
  } while (nextPageToken);

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ticket_id, occurrence_id } = await req.json();
    if (!ticket_id || !occurrence_id) {
      return Response.json({ error: 'ticket_id and occurrence_id are required' }, { status: 400 });
    }

    // Load occurrence
    const occs = await base44.asServiceRole.entities.EventOccurrence.filter({ id: occurrence_id });
    if (!occs.length) {
      return Response.json({ error: 'Occurrence not found' }, { status: 404 });
    }
    const occurrence = occs[0];

    // Determine webinar ID
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

    if (!webinarId) {
      return Response.json({ success: true, skipped: true, reason: 'no_webinar_id' });
    }

    // Load ticket to get email
    const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: ticket_id });
    if (!tickets.length) {
      return Response.json({ error: 'Ticket not found' }, { status: 404 });
    }
    const ticket = tickets[0];

    if (ticket.attendance_mode !== 'online') {
      return Response.json({ success: true, skipped: true, reason: 'not_online_ticket' });
    }

    const accessToken = await getZoomAccessToken();

    // Find the registrant by email
    const registrantId = await findRegistrantByEmail(accessToken, webinarId, ticket.attendee_email);
    if (!registrantId) {
      console.warn(`No Zoom registrant found for ${ticket.attendee_email} on webinar ${webinarId}`);
      return Response.json({ success: true, skipped: true, reason: 'registrant_not_found' });
    }

    // Delete the registrant using PUT with action=cancel
    const deleteRes = await fetch(`https://api.zoom.us/v2/webinars/${webinarId}/registrants/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        action: 'cancel',
        registrants: [{ id: registrantId }]
      })
    });

    if (!deleteRes.ok) {
      const errText = await deleteRes.text();
      console.error(`Failed to cancel Zoom registrant ${registrantId}: ${deleteRes.status} ${errText}`);
      return Response.json({ success: false, error: `Zoom API error: ${deleteRes.status}` }, { status: 500 });
    }

    console.log(`Successfully cancelled Zoom registration for ${ticket.attendee_email} (registrant ${registrantId}) on webinar ${webinarId}`);
    return Response.json({ success: true, registrant_id: registrantId });

  } catch (error) {
    console.error("deregisterZoomAttendee error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});