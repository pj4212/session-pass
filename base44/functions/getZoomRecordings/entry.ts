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

    const accessToken = await getZoomAccessToken();

    // Get recordings for the specific webinar
    const res = await fetch(`https://api.zoom.us/v2/meetings/${webinar_id}/recordings`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    if (res.status === 404) {
      // No recordings found
      return Response.json({ recordings: [], message: "No recordings found for this webinar." });
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("Zoom recordings error:", res.status, errText);
      throw new Error(`Failed to get recordings: ${res.status}`);
    }

    const data = await res.json();
    const recordings = (data.recording_files || []).map(r => ({
      id: r.id,
      type: r.recording_type,
      file_type: r.file_type,
      file_size: r.file_size,
      play_url: r.play_url,
      download_url: r.download_url,
      status: r.status,
      recording_start: r.recording_start,
      recording_end: r.recording_end,
    }));

    return Response.json({
      recordings,
      share_url: data.share_url || null,
      password: data.password || null,
      total_size: data.total_size || 0
    });
  } catch (error) {
    console.error("getZoomRecordings error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});