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
    console.error("Zoom token error:", errText);
    throw new Error(`Failed to get Zoom access token: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin', 'event_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { action, panelists, zoom_link } = body;
    // Prefer WN_ token from zoom_link for manual webinars, fallback to numeric ID
    let webinar_id = '';
    if (zoom_link) {
      const wnMatch = zoom_link.match(/\/register\/(WN_[A-Za-z0-9_-]+)/);
      if (wnMatch) webinar_id = wnMatch[1];
    }
    if (!webinar_id && body.webinar_id) {
      webinar_id = body.webinar_id.replace(/\s/g, '');
    }

    if (!webinar_id) {
      return Response.json({ error: "webinar_id is required" }, { status: 400 });
    }

    const accessToken = await getZoomAccessToken();

    if (action === 'list') {
      const res = await fetch(`https://api.zoom.us/v2/webinars/${webinar_id}/panelists`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("List panelists error:", res.status, errText);
        throw new Error(`Failed to list panelists: ${res.status}`);
      }
      const data = await res.json();
      return Response.json({ panelists: data.panelists || [] });
    }

    if (action === 'add') {
      if (!panelists || !panelists.length) {
        return Response.json({ error: "panelists array is required" }, { status: 400 });
      }
      // panelists: [{name, email}]
      const res = await fetch(`https://api.zoom.us/v2/webinars/${webinar_id}/panelists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({ panelists })
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("Add panelists error:", res.status, errText);
        throw new Error(`Failed to add panelists: ${res.status} ${errText}`);
      }
      console.log(`Added ${panelists.length} panelist(s) to webinar ${webinar_id}`);
      return Response.json({ success: true, added: panelists.length });
    }

    if (action === 'remove') {
      const { panelist_id } = await req.json().catch(() => ({}));
      if (!panelists?.[0]?.id) {
        return Response.json({ error: "panelists[0].id is required for removal" }, { status: 400 });
      }
      const pid = panelists[0].id;
      const res = await fetch(`https://api.zoom.us/v2/webinars/${webinar_id}/panelists/${pid}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("Remove panelist error:", res.status, errText);
        throw new Error(`Failed to remove panelist: ${res.status}`);
      }
      console.log(`Removed panelist ${pid} from webinar ${webinar_id}`);
      return Response.json({ success: true, removed: pid });
    }

    return Response.json({ error: "Invalid action. Use: list, add, remove" }, { status: 400 });
  } catch (error) {
    console.error("manageZoomPanelists error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});