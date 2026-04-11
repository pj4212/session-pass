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
    throw new Error(`Zoom token error: ${tokenRes.status} ${errText}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

// Fetch all pages of webinar participants from Zoom Reports API
async function fetchAllParticipants(accessToken, webinarId) {
  const allParticipants = [];
  let nextPageToken = '';

  do {
    const url = new URL(`https://api.zoom.us/v2/report/webinars/${webinarId}/participants`);
    url.searchParams.set('page_size', '300');
    url.searchParams.set('include_fields', 'registrant_id');
    if (nextPageToken) {
      url.searchParams.set('next_page_token', nextPageToken);
    }

    const res = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    if (res.status === 404) {
      console.log(`No participant report found for webinar ${webinarId} (may be too old or not yet available)`);
      return [];
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Zoom participants report error for URL ${url.toString()}: ${res.status} ${errText}`);
      throw new Error(`Failed to get participant report: ${res.status} - ${errText}`);
    }

    const data = await res.json();
    const participants = data.participants || [];
    allParticipants.push(...participants);
    nextPageToken = data.next_page_token || '';
  } while (nextPageToken);

  return allParticipants;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin' && user?.role !== 'super_admin' && user?.role !== 'event_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { webinar_id } = await req.json();
    if (!webinar_id) {
      return Response.json({ error: "webinar_id is required" }, { status: 400 });
    }

    // Strip spaces from webinar ID (e.g. "858 2930 7941" -> "85829307941")
    const cleanId = webinar_id.replace(/\s/g, '');
    const accessToken = await getZoomAccessToken();

    const rawParticipants = await fetchAllParticipants(accessToken, cleanId);
    console.log(`Fetched ${rawParticipants.length} raw participant records for webinar ${cleanId}`);

    // Deduplicate by email — a person may join/leave multiple times
    // Aggregate total duration and track first join / last leave
    const byEmail = {};
    for (const p of rawParticipants) {
      const email = (p.user_email || '').toLowerCase().trim();
      const key = email || p.user_id || p.id; // fallback for anonymous users

      if (!byEmail[key]) {
        byEmail[key] = {
          email: email,
          name: p.name || '',
          total_duration_seconds: 0,
          join_time: p.join_time,
          leave_time: p.leave_time,
          registrant_id: p.registrant_id || '',
          sessions: 0
        };
      }

      byEmail[key].total_duration_seconds += (p.duration || 0);
      byEmail[key].sessions += 1;

      // Track earliest join and latest leave
      if (p.join_time && (!byEmail[key].join_time || p.join_time < byEmail[key].join_time)) {
        byEmail[key].join_time = p.join_time;
      }
      if (p.leave_time && (!byEmail[key].leave_time || p.leave_time > byEmail[key].leave_time)) {
        byEmail[key].leave_time = p.leave_time;
      }

      // Keep the most descriptive name
      if (p.name && p.name.length > (byEmail[key].name || '').length) {
        byEmail[key].name = p.name;
      }
    }

    const participants = Object.values(byEmail).sort((a, b) =>
      (b.total_duration_seconds || 0) - (a.total_duration_seconds || 0)
    );

    return Response.json({
      participants,
      total_unique: participants.length,
      total_raw_records: rawParticipants.length
    });
  } catch (error) {
    console.error("getZoomAttendance error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});