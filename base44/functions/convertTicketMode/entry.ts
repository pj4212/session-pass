import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { Resend } from 'npm:resend@3.2.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

async function generateQrHash(ticketId, occurrenceId) {
  const salt = Deno.env.get("QR_SECRET_SALT");
  const data = new TextEncoder().encode(ticketId + occurrenceId + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12);
}

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(datetimeStr) {
  if (!datetimeStr) return '';
  const d = new Date(datetimeStr);
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const BRAND = {
  headerBg: '#0f172a',
  accentColor: '#818cf8',
  buttonBg: '#6366f1',
  headingColor: '#0f172a',
  cardBg: '#f8fafc',
  cardBorder: '#e2e8f0',
  footerBg: '#f8fafc',
  footerBorder: '#e2e8f0',
  bodyBg: '#f1f5f9',
};

function buildConversionEmailHtml(ticket, occurrence, newMode, qrHash, joinUrl) {
  const eventDate = formatEventDate(occurrence.event_date);
  const startTime = formatTime(occurrence.start_datetime);
  const endTime = formatTime(occurrence.end_datetime);
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || '';
  const isNowOnline = newMode === 'online';
  const modeLabel = isNowOnline ? 'Online' : 'In-Person';
  const modeBadgeBg = isNowOnline ? '#eef2ff' : '#f0fdf4';
  const modeBadgeColor = isNowOnline ? '#4338ca' : '#166534';

  let accessBlock = '';
  if (isNowOnline && (joinUrl || occurrence.zoom_link)) {
    let joinBtnHtml = '';
    if (joinUrl) {
      joinBtnHtml = `
        <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.4;">You've been automatically registered. Use the link below to join the webinar directly:</p>
        <a href="${joinUrl}" style="display:inline-block;background:${BRAND.buttonBg};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;margin-bottom:12px;">Join Webinar →</a>`;
    }
    let regBtnHtml = '';
    if (occurrence.zoom_link) {
      regBtnHtml = `
        <p style="margin:${joinUrl ? '12px' : '0'} 0 8px;font-size:13px;color:#64748b;line-height:1.4;">${joinUrl ? 'You can also register via Zoom to receive their confirmation email:' : 'Click the button below to register for the webinar and receive your Zoom link:'}</p>
        <a href="${occurrence.zoom_link}" style="display:inline-block;background:${joinUrl ? '#e2e8f0' : BRAND.buttonBg};color:${joinUrl ? '#334155' : '#ffffff'};text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">Register via Zoom →</a>`;
    }
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:8px;padding:20px;border:1px solid #c7d2fe;">
          <tr><td>
            <h3 style="margin:0 0 8px;font-size:15px;color:#4338ca;">🖥 Join Online</h3>
            ${joinBtnHtml}
            ${regBtnHtml}
          </td></tr>
        </table>
      </td></tr>`;
  } else if (isNowOnline) {
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:8px;padding:20px;border:1px solid #c7d2fe;">
          <tr><td>
            <h3 style="margin:0 0 4px;font-size:15px;color:#4338ca;">🖥 Online Event</h3>
            <p style="margin:0;font-size:13px;color:#64748b;">The webinar link will be sent to you before the event.</p>
          </td></tr>
        </table>
      </td></tr>`;
  } else {
    const venueText = occurrence.venue_details || occurrence.venue_name || 'Venue details will be provided closer to the event.';
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:20px;border:1px solid #bbf7d0;">
          <tr><td>
            <h3 style="margin:0 0 4px;font-size:15px;color:#166534;">📍 In-Person Venue</h3>
            <p style="margin:0;font-size:14px;color:#334155;">${venueText}</p>
            ${occurrence.venue_link ? `<p style="margin:8px 0 0;"><a href="${occurrence.venue_link}" style="color:${BRAND.buttonBg};font-size:13px;">View venue location →</a></p>` : ''}
            ${occurrence.parking_link ? `<p style="margin:4px 0 0;"><a href="${occurrence.parking_link}" style="color:${BRAND.buttonBg};font-size:13px;">Parking information →</a></p>` : ''}
          </td></tr>
        </table>
      </td></tr>`;
  }

  let qrBlock = '';
  if (!isNowOnline && qrHash) {
    const qrPayload = JSON.stringify({ t: ticket.id, e: ticket.occurrence_id, h: qrHash });
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;
    qrBlock = `
      <tr><td style="padding:0 40px 32px;text-align:center;">
        <h3 style="margin:0 0 12px;font-size:15px;color:${BRAND.headingColor};text-transform:uppercase;letter-spacing:0.5px;">Your Check-In QR Code</h3>
        <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;">Present this at the door for fast entry.</p>
        <img src="${qrCodeUrl}" alt="QR Code" width="200" height="200" style="border:1px solid ${BRAND.cardBorder};border-radius:8px;padding:8px;background:#fff;" />
      </td></tr>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BRAND.bodyBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bodyBg};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.08);">

        <tr><td style="background:${BRAND.headerBg};padding:32px 40px;text-align:center;">
          <p style="margin:0 0 16px;font-size:14px;color:${BRAND.accentColor};font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">Session Pass</p>
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">Ticket Updated</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:14px;">You've been converted to ${modeLabel}</p>
        </td></tr>

        <tr><td style="padding:32px 40px 16px;">
          <p style="margin:0;font-size:16px;color:#334155;">Hi <strong>${ticket.attendee_first_name}</strong>,</p>
          <p style="margin:8px 0 0;font-size:14px;color:#64748b;line-height:1.5;">Your ticket for the upcoming event has been changed to <strong>${modeLabel}</strong> attendance. Here are your updated details:</p>
        </td></tr>

        <tr><td style="padding:8px 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cardBg};border-radius:8px;border:1px solid ${BRAND.cardBorder};">
            <tr><td style="padding:20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:110px;">Event</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;font-weight:600;">${occurrence.name}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Date</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;">${eventDate}</td>
                </tr>
                ${timeStr ? `<tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Time</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;">${timeStr} (${occurrence.timezone || 'AEST'})</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Attendance</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;">
                    <span style="display:inline-block;background:${modeBadgeBg};color:${modeBadgeColor};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${modeLabel}</span>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        ${accessBlock}
        ${qrBlock}

        <tr><td style="background:${BRAND.footerBg};padding:24px 40px;border-top:1px solid ${BRAND.footerBorder};text-align:center;">
          <p style="margin:0 0 4px;font-size:13px;color:${BRAND.accentColor};font-weight:600;">Session Pass</p>
          <p style="margin:0;font-size:12px;color:#94a3b8;">This is an automated email. Please do not reply directly.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ticket_id, target_ticket_type_id, target_occurrence_id } = await req.json();

    if (!ticket_id || !target_ticket_type_id) {
      return Response.json({ error: 'ticket_id and target_ticket_type_id are required' }, { status: 400 });
    }

    // Load ticket
    const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: ticket_id });
    if (!tickets.length) {
      return Response.json({ error: 'Ticket not found' }, { status: 404 });
    }
    const ticket = tickets[0];

    if (ticket.ticket_status !== 'active') {
      return Response.json({ error: 'Only active tickets can be converted' }, { status: 400 });
    }

    // Load target ticket type
    const targetTTs = await base44.asServiceRole.entities.TicketType.filter({ id: target_ticket_type_id });
    if (!targetTTs.length) {
      return Response.json({ error: 'Target ticket type not found' }, { status: 404 });
    }
    const targetTT = targetTTs[0];
    const newMode = targetTT.attendance_mode;

    // Determine the occurrence to use
    const occurrenceId = target_occurrence_id || ticket.occurrence_id;

    // Load occurrence
    const occs = await base44.asServiceRole.entities.EventOccurrence.filter({ id: occurrenceId });
    if (!occs.length) {
      return Response.json({ error: 'Occurrence not found' }, { status: 404 });
    }
    const occurrence = occs[0];

    // Check capacity for in-person
    if (newMode === 'in_person' && targetTT.capacity_limit != null) {
      if ((targetTT.quantity_sold || 0) >= targetTT.capacity_limit) {
        return Response.json({ error: `No capacity remaining for "${targetTT.name}"` }, { status: 400 });
      }
    }

    // Decrement old ticket type quantity_sold
    const oldTTs = await base44.asServiceRole.entities.TicketType.filter({ id: ticket.ticket_type_id });
    if (oldTTs.length && (oldTTs[0].quantity_sold || 0) > 0) {
      await base44.asServiceRole.entities.TicketType.update(oldTTs[0].id, {
        quantity_sold: (oldTTs[0].quantity_sold || 0) - 1
      });
    }

    // Increment new ticket type quantity_sold
    await base44.asServiceRole.entities.TicketType.update(targetTT.id, {
      quantity_sold: (targetTT.quantity_sold || 0) + 1
    });

    // Generate QR hash for in-person
    let qrHash = ticket.qr_code_hash;
    if (newMode === 'in_person') {
      qrHash = await generateQrHash(ticket.id, occurrenceId);
    }

    // Update ticket
    const updateData = {
      attendance_mode: newMode,
      ticket_type_id: target_ticket_type_id,
      qr_code_hash: qrHash,
    };
    if (target_occurrence_id) {
      updateData.occurrence_id = target_occurrence_id;
    }
    await base44.asServiceRole.entities.Ticket.update(ticket.id, updateData);

    // If converting to online, register with Zoom webinar
    let joinUrl = null;
    if (newMode === 'online' && occurrence.zoom_meeting_id) {
      try {
        const zoomRes = await base44.asServiceRole.functions.invoke('registerZoomAttendee', {
          tickets: [{
            id: ticket.id,
            attendance_mode: 'online',
            attendee_first_name: ticket.attendee_first_name,
            attendee_last_name: ticket.attendee_last_name,
            attendee_email: ticket.attendee_email
          }],
          occurrence_id: occurrenceId
        });
        const zoomData = zoomRes?.data || zoomRes;
        if (zoomData?.registrations?.[0]?.join_url) {
          joinUrl = zoomData.registrations[0].join_url;
        }
        console.log(`Zoom registration for converted ticket: joinUrl=${joinUrl}`);
      } catch (err) {
        console.error('Zoom registration during conversion failed (non-blocking):', err.message);
      }
    }

    // Send email
    const html = buildConversionEmailHtml(
      { ...ticket, ...updateData },
      occurrence,
      newMode,
      newMode === 'in_person' ? qrHash : null,
      joinUrl
    );

    const modeLabel = newMode === 'online' ? 'Online' : 'In-Person';
    await resend.emails.send({
      from: 'Session Pass <noreply@session-pass.com>',
      to: ticket.attendee_email,
      subject: `Your Ticket Has Been Changed to ${modeLabel} — ${occurrence.name}`,
      html: html
    });

    console.log(`Ticket ${ticket.id} converted to ${newMode} for ${ticket.attendee_email}`);

    return Response.json({
      success: true,
      new_mode: newMode,
      ticket_id: ticket.id,
      new_ticket_type_id: target_ticket_type_id,
      qr_code_hash: qrHash,
    });
  } catch (error) {
    console.error("convertTicketMode error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});