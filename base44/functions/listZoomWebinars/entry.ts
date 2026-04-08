import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

async function getZoomAccessToken() {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { webinar_id } = await req.json();
    const accessToken = await getZoomAccessToken();

    // If a specific webinar_id is provided, look it up
    if (webinar_id) {
      const res = await fetch(`https://api.zoom.us/v2/webinars/${webinar_id}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const data = await res.json();
      console.log(`Webinar lookup ${webinar_id}: ${res.status}`, JSON.stringify(data));
      return Response.json({ status: res.status, data });
    }

    // Otherwise list upcoming webinars
    const res = await fetch(`https://api.zoom.us/v2/users/me/webinars?page_size=20`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    const data = await res.json();
    console.log(`Found ${data.webinars?.length || 0} webinars`);
    return Response.json(data);
  } catch (error) {
    console.error("listZoomWebinars error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});