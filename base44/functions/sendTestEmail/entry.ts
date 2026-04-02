import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { Resend } from 'npm:resend@3.2.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

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

function buildOrderEmailHtml(order, occurrence, tickets, ticketTypeMap) {
  const eventDate = formatEventDate(occurrence.event_date);
  const startTime = formatTime(occurrence.start_datetime);
  const endTime = formatTime(occurrence.end_datetime);
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || '';
  const totalText = order.total_amount > 0 ? `$${order.total_amount.toFixed(2)} AUD` : 'Free';
  const orderUrl = `https://session-pass.com/order/${order.order_number}`;

  const ticketRows = tickets.map(t => {
    const tt = ticketTypeMap[t.ticket_type_id];
    const mode = t.attendance_mode === 'online' ? 'Online' : 'In-Person';
    const price = tt?.price > 0 ? `$${tt.price.toFixed(2)}` : 'Free';
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${t.attendee_first_name} ${t.attendee_last_name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;">${tt?.name || 'Ticket'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#555;">${mode}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#333;text-align:right;">${price}</td>
      </tr>`;
  }).join('');

  let venueBlock = '';
  if (occurrence.venue_details) {
    venueBlock = `
      <tr>
        <td style="padding:6px 0;color:#888;font-size:13px;width:100px;">Venue</td>
        <td style="padding:6px 0;font-size:14px;color:#333;">${occurrence.venue_details}</td>
      </tr>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#1a1a2e;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Booking Confirmed ✓</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:14px;">Order #${order.order_number}</p>
        </td></tr>
        <tr><td style="padding:32px 40px 16px;">
          <p style="margin:0;font-size:16px;color:#333;">Hi <strong>${order.buyer_name}</strong>,</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.5;">Thank you for your booking. Here are your details:</p>
        </td></tr>
        <tr><td style="padding:8px 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fc;border-radius:8px;padding:20px;border:1px solid #e8eaf0;">
            <tr><td>
              <h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">${occurrence.name}</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;color:#888;font-size:13px;width:100px;">Date</td>
                  <td style="padding:6px 0;font-size:14px;color:#333;font-weight:600;">${eventDate}</td>
                </tr>
                ${timeStr ? `<tr>
                  <td style="padding:6px 0;color:#888;font-size:13px;">Time</td>
                  <td style="padding:6px 0;font-size:14px;color:#333;">${timeStr} (${occurrence.timezone || 'AEST'})</td>
                </tr>` : ''}
                ${venueBlock}
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 40px 24px;">
          <h3 style="margin:0 0 12px;font-size:15px;color:#1a1a2e;text-transform:uppercase;letter-spacing:0.5px;">Your Tickets</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8eaf0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f0f1f5;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Attendee</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Type</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Mode</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Price</th>
            </tr>
            ${ticketRows}
            <tr style="background:#f8f9fc;">
              <td colspan="3" style="padding:12px;font-size:14px;font-weight:700;color:#1a1a2e;">Total</td>
              <td style="padding:12px;font-size:14px;font-weight:700;color:#1a1a2e;text-align:right;">${totalText}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 40px 32px;text-align:center;">
          <a href="${orderUrl}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">View Your Tickets</a>
        </td></tr>
        <tr><td style="padding:0 40px 24px;">
          <p style="margin:0;font-size:13px;color:#888;line-height:1.5;">Each attendee will receive a separate email with their individual ticket and QR code for check-in.</p>
        </td></tr>
        <tr><td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8eaf0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#aaa;">This is an automated confirmation email. Please do not reply directly.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildTicketEmailHtml(ticket, occurrence, ticketType) {
  const eventDate = formatEventDate(occurrence.event_date);
  const startTime = formatTime(occurrence.start_datetime);
  const endTime = formatTime(occurrence.end_datetime);
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || '';
  const isOnline = ticket.attendance_mode === 'online';
  const mode = isOnline ? 'Online' : 'In-Person';
  const qrPayload = JSON.stringify({ t: ticket.id, e: ticket.occurrence_id, h: ticket.qr_code_hash });
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;

  let accessBlock = '';
  if (isOnline && occurrence.zoom_link) {
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef6ff;border-radius:8px;padding:20px;border:1px solid #c5ddf8;">
          <tr><td>
            <h3 style="margin:0 0 8px;font-size:15px;color:#1a5da6;">🖥 Join Online</h3>
            <p style="margin:0 0 12px;font-size:13px;color:#555;line-height:1.4;">Click the button below to register for the webinar and receive your unique Zoom link.</p>
            <a href="${occurrence.zoom_link}" style="display:inline-block;background:#1a5da6;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Register for Webinar →</a>
          </td></tr>
        </table>
      </td></tr>`;
  } else if (isOnline) {
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef6ff;border-radius:8px;padding:20px;border:1px solid #c5ddf8;">
          <tr><td>
            <h3 style="margin:0 0 4px;font-size:15px;color:#1a5da6;">🖥 Online Event</h3>
            <p style="margin:0;font-size:13px;color:#555;">The webinar link will be sent to you before the event.</p>
          </td></tr>
        </table>
      </td></tr>`;
  } else {
    const venueText = occurrence.venue_details || 'Venue details will be provided closer to the event.';
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf0;border-radius:8px;padding:20px;border:1px solid #c5e8c5;">
          <tr><td>
            <h3 style="margin:0 0 4px;font-size:15px;color:#2d7a2d;">📍 In-Person Venue</h3>
            <p style="margin:0;font-size:14px;color:#333;">${venueText}</p>
          </td></tr>
        </table>
      </td></tr>`;
  }

  let qrBlock = '';
  if (!isOnline) {
    qrBlock = `
      <tr><td style="padding:0 40px 32px;text-align:center;">
        <h3 style="margin:0 0 12px;font-size:15px;color:#1a1a2e;text-transform:uppercase;letter-spacing:0.5px;">Your Check-In QR Code</h3>
        <p style="margin:0 0 16px;font-size:13px;color:#888;">Present this at the door for fast entry.</p>
        <img src="${qrCodeUrl}" alt="QR Code" width="200" height="200" style="border:1px solid #e8eaf0;border-radius:8px;padding:8px;background:#fff;" />
      </td></tr>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#1a1a2e;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Your Ticket</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:14px;">${occurrence.name}</p>
        </td></tr>
        <tr><td style="padding:32px 40px 16px;">
          <p style="margin:0;font-size:16px;color:#333;">Hi <strong>${ticket.attendee_first_name}</strong>,</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;line-height:1.5;">Here's your ticket for the upcoming event.</p>
        </td></tr>
        <tr><td style="padding:8px 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fc;border-radius:8px;border:1px solid #e8eaf0;">
            <tr><td style="padding:20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;color:#888;font-size:13px;width:110px;">Event</td>
                  <td style="padding:6px 0;font-size:14px;color:#333;font-weight:600;">${occurrence.name}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#888;font-size:13px;">Date</td>
                  <td style="padding:6px 0;font-size:14px;color:#333;">${eventDate}</td>
                </tr>
                ${timeStr ? `<tr>
                  <td style="padding:6px 0;color:#888;font-size:13px;">Time</td>
                  <td style="padding:6px 0;font-size:14px;color:#333;">${timeStr} (${occurrence.timezone || 'AEST'})</td>
                </tr>` : ''}
                <tr>
                  <td style="padding:6px 0;color:#888;font-size:13px;">Ticket Type</td>
                  <td style="padding:6px 0;font-size:14px;color:#333;">${ticketType?.name || 'General'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#888;font-size:13px;">Attendance</td>
                  <td style="padding:6px 0;font-size:14px;color:#333;">
                    <span style="display:inline-block;background:${isOnline ? '#eef6ff;color:#1a5da6' : '#f0faf0;color:#2d7a2d'};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${mode}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#888;font-size:13px;">Reference</td>
                  <td style="padding:6px 0;font-size:13px;color:#aaa;font-family:monospace;">${ticket.id}</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        ${accessBlock}
        ${qrBlock}
        <tr><td style="background:#f8f9fc;padding:24px 40px;border-top:1px solid #e8eaf0;text-align:center;">
          <p style="margin:0;font-size:12px;color:#aaa;">This is an automated email. Please do not reply directly.</p>
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
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { email_type, attendance_mode, recipient_email } = await req.json();

    // Build mock data
    const mockOccurrence = {
      name: 'Test Event — Saturday Session',
      event_date: '2026-04-18',
      start_datetime: '2026-04-18T09:00:00+10:00',
      end_datetime: '2026-04-18T11:00:00+10:00',
      timezone: 'Australia/Brisbane',
      venue_details: '123 Main Street, Brisbane QLD 4000',
      zoom_link: attendance_mode === 'online' ? 'https://zoom.us/webinar/register/test-link' : '',
      event_mode: attendance_mode === 'online' ? 'online_stream' : 'in_person'
    };

    const mockOrder = {
      order_number: 'UV-20260418-TEST',
      buyer_name: 'Test Buyer',
      buyer_email: recipient_email,
      total_amount: attendance_mode === 'online' ? 0 : 25.00
    };

    const mockTicketType = {
      id: 'tt-test-001',
      name: attendance_mode === 'online' ? 'Online Stream' : 'General Admission',
      price: attendance_mode === 'online' ? 0 : 25.00,
      attendance_mode: attendance_mode
    };

    const mockTicket = {
      id: 'ticket-test-001',
      occurrence_id: 'occ-test-001',
      ticket_type_id: 'tt-test-001',
      attendance_mode: attendance_mode,
      attendee_first_name: 'Test',
      attendee_last_name: 'Attendee',
      attendee_email: recipient_email,
      qr_code_hash: 'abc123test456'
    };

    const ticketTypeMap = { 'tt-test-001': mockTicketType };
    const sentEmails = [];

    if (email_type === 'order' || email_type === 'both') {
      const html = buildOrderEmailHtml(mockOrder, mockOccurrence, [mockTicket], ticketTypeMap);
      const result = await resend.emails.send({
        from: 'Session Pass <noreply@session-pass.com>',
        to: recipient_email,
        subject: `[TEST] Booking Confirmed — ${mockOccurrence.name} | Order #${mockOrder.order_number}`,
        html: html
      });
      sentEmails.push({ type: 'Order Receipt', id: result.data?.id });
    }

    if (email_type === 'ticket' || email_type === 'both') {
      const html = buildTicketEmailHtml(mockTicket, mockOccurrence, mockTicketType);
      const modeLabel = attendance_mode === 'online' ? 'Online' : 'In-Person';
      const result = await resend.emails.send({
        from: 'Session Pass <noreply@session-pass.com>',
        to: recipient_email,
        subject: `[TEST] Your ${modeLabel} Ticket — ${mockOccurrence.name}`,
        html: html
      });
      sentEmails.push({ type: `${modeLabel} Ticket`, id: result.data?.id });
    }

    return Response.json({ success: true, sent: sentEmails });
  } catch (error) {
    console.error("sendTestEmail error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});