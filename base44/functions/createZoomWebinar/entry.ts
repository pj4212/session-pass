import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Get Zoom Server-to-Server OAuth access token
async function getZoomAccessToken() {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom credentials not configured. Please set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET in your app secrets.");
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
    throw new Error(`Failed to get Zoom access token: ${tokenRes.status} ${errText}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['super_admin', 'event_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { occurrence_id } = await req.json();

    if (!occurrence_id) {
      return Response.json({ error: "occurrence_id is required" }, { status: 400 });
    }

    // Load the event occurrence
    const occurrences = await base44.asServiceRole.entities.EventOccurrence.filter({ id: occurrence_id });
    if (!occurrences.length) {
      return Response.json({ error: "Event occurrence not found" }, { status: 404 });
    }
    const occurrence = occurrences[0];

    console.log(`Creating Zoom webinar for: ${occurrence.name} (${occurrence.event_date})`);

    // Get access token
    const accessToken = await getZoomAccessToken();

    // Build webinar request
    const startTime = occurrence.start_datetime || `${occurrence.event_date}T09:00:00`;
    const startDt = new Date(startTime);
    const endDt = occurrence.end_datetime ? new Date(occurrence.end_datetime) : null;
    const eventDurationMins = endDt ? Math.round((endDt - startDt) / 60000) : 60;
    // Add 1 hour buffer, minimum 2 hours total
    const durationMins = Math.max(120, eventDurationMins + 60);

    // Convert UTC start time to local time in event's timezone for Zoom
    const eventTz = occurrence.timezone || "Australia/Brisbane";
    const localStartStr = startDt.toLocaleString('sv-SE', { timeZone: eventTz }).replace(' ', 'T');
    console.log(`UTC start: ${startDt.toISOString()}, Local start (${eventTz}): ${localStartStr}`);
    console.log(`Event duration: ${eventDurationMins}min, Zoom webinar duration: ${durationMins}min`);

    const webinarPayload = {
      topic: occurrence.name,
      type: 5, // Scheduled webinar
      start_time: localStartStr,
      duration: durationMins,
      timezone: eventTz,
      agenda: occurrence.description || `Webinar for ${occurrence.name}`,
      password: '',
      settings: {
        approval_type: 0, // Automatically approve registrants
        registration_type: 1, // Register once, attend one time
        host_video: true,
        panelists_video: true,
        registrants_email_notification: false, // We handle our own emails
        registrants_confirmation_email: false,
        show_share_button: false,
        allow_multiple_devices: true,
        on_demand: false,
        meeting_authentication: false,
        question_and_answer: {
          enable: true,
          allow_submit_questions: true,
          allow_anonymous_questions: false
        }
      }
    };

    console.log("Zoom webinar payload:", JSON.stringify(webinarPayload));

    // Create webinar via Zoom API (use "me" for the authenticated user)
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

    // Strip registration questions down to just first name, last name, email
    const questionsRes = await fetch(`https://api.zoom.us/v2/webinars/${webinar.id}/registrants/questions`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        questions: [
          { field_name: "last_name", required: true },
        ],
        custom_questions: []
      })
    });
    if (!questionsRes.ok) {
      console.warn("Failed to update registration questions:", questionsRes.status, await questionsRes.text());
    } else {
      console.log("Registration questions simplified to name + email only.");
    }

    // Save the registration URL and webinar ID back to the event occurrence
    await base44.asServiceRole.entities.EventOccurrence.update(occurrence_id, {
      zoom_link: webinar.registration_url,
      zoom_meeting_id: String(webinar.id)
    });

    return Response.json({
      success: true,
      webinar_id: webinar.id,
      registration_url: webinar.registration_url,
      join_url: webinar.join_url,
      start_url: webinar.start_url
    });
  } catch (error) {
    console.error("createZoomWebinar error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});