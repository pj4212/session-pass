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
    console.error("Zoom token error:", errText);
    throw new Error(`Failed to get Zoom access token: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data, old_data } = body;
    console.log(`onEventPublished triggered: ${event?.type} on ${event?.entity_id}`);

    // Only process updates where event is now published and has online/hybrid mode
    if (!data) {
      console.log("No data in payload, skipping.");
      return Response.json({ skipped: true, reason: "no data" });
    }

    const isNowPublished = data.status === 'published' || data.is_published === true;
    const wasPublished = old_data && (old_data.status === 'published' || old_data.is_published === true);
    
    if (!isNowPublished || wasPublished) {
      console.log("Event not newly published, skipping.");
      return Response.json({ skipped: true, reason: "not newly published" });
    }

    // Check if auto-create is enabled (default to auto if not set)
    const webinarMode = data.zoom_webinar_mode || 'auto';
    if (webinarMode !== 'auto') {
      console.log(`Webinar mode is "${webinarMode}", skipping auto-creation.`);
      return Response.json({ skipped: true, reason: `zoom_webinar_mode is ${webinarMode}` });
    }

    // Only create Zoom for online or hybrid events
    const mode = data.event_mode;
    if (mode !== 'online_stream' && mode !== 'hybrid') {
      console.log(`Event mode is "${mode}", no Zoom needed.`);
      return Response.json({ skipped: true, reason: `event_mode is ${mode}` });
    }

    // Skip if already has a Zoom link
    if (data.zoom_link) {
      console.log("Event already has a Zoom link, skipping.");
      return Response.json({ skipped: true, reason: "already has zoom_link" });
    }

    console.log(`Creating Zoom webinar for: ${data.name} (${data.event_date})`);

    const accessToken = await getZoomAccessToken();

    // Build webinar request
    const startTime = data.start_datetime || `${data.event_date}T09:00:00`;
    const startDt = new Date(startTime);
    const endDt = data.end_datetime ? new Date(data.end_datetime) : null;
    const eventDurationMins = endDt ? Math.round((endDt - startDt) / 60000) : 60;
    // Add 1 hour buffer, minimum 2 hours total
    const durationMins = Math.max(120, eventDurationMins + 60);
    console.log(`Event duration: ${eventDurationMins}min, Zoom webinar duration: ${durationMins}min`);

    const webinarPayload = {
      topic: data.name,
      type: 5, // Scheduled webinar
      start_time: startDt.toISOString().replace('.000Z', 'Z'),
      duration: durationMins,
      timezone: data.timezone || "Australia/Brisbane",
      agenda: data.description || `Webinar for ${data.name}`,
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

    console.log("Zoom webinar payload:", JSON.stringify(webinarPayload));

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
      console.error("Zoom create webinar error:", createRes.status, errText);
      throw new Error(`Failed to create Zoom webinar: ${createRes.status} ${errText}`);
    }

    const webinar = await createRes.json();
    console.log("Zoom webinar created:", webinar.id, "Registration URL:", webinar.registration_url);

    // Save the Zoom link back to the event occurrence
    await base44.asServiceRole.entities.EventOccurrence.update(event.entity_id, {
      zoom_link: webinar.registration_url,
      zoom_meeting_id: String(webinar.id)
    });

    console.log(`Zoom link saved to EventOccurrence ${event.entity_id}`);

    return Response.json({
      success: true,
      webinar_id: webinar.id,
      registration_url: webinar.registration_url
    });
  } catch (error) {
    console.error("onEventPublished error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});