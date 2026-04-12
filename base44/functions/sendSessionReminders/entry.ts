import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { Resend } from 'npm:resend@3.2.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

// Retry wrapper with exponential backoff
async function sendWithRetry(fn, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err?.statusCode === 429 || err?.statusCode >= 500 || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';
      if (!isRetryable || attempt === maxRetries) {
        console.error(`sendWithRetry failed after ${attempt} attempts:`, err.message);
        throw err;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 500, 30000);
      console.warn(`Retry attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ── Shared email brand constants ──
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

function brandHeader(title, subtitle) {
  return `
    <tr><td style="background:${BRAND.headerBg};padding:32px 40px;text-align:center;">
      <p style="margin:0 0 16px;font-size:14px;color:${BRAND.accentColor};font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">Session Pass</p>
      <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${title}</h1>
      ${subtitle ? `<p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:14px;">${subtitle}</p>` : ''}
    </td></tr>`;
}

function brandFooter() {
  return `
    <tr><td style="background:${BRAND.footerBg};padding:24px 40px;border-top:1px solid ${BRAND.footerBorder};text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:${BRAND.accentColor};font-weight:600;">Session Pass</p>
      <p style="margin:0;font-size:12px;color:#94a3b8;">This is an automated email. Please do not reply directly.</p>
    </td></tr>`;
}

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(datetimeStr, timezone) {
  if (!datetimeStr) return '';
  // If no timezone suffix, the value is stored in the event's local timezone — extract directly
  if (!/Z|[+-]\d{2}:\d{2}$/.test(datetimeStr) && datetimeStr.includes('T')) {
    const timePart = datetimeStr.split('T')[1];
    const [hStr, mStr] = timePart.split(':');
    let h = Number(hStr);
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${mStr} ${ampm}`;
  }
  const d = new Date(datetimeStr);
  const opts = { hour: 'numeric', minute: '2-digit', hour12: true };
  if (timezone) opts.timeZone = timezone;
  return d.toLocaleTimeString('en-AU', opts);
}

function buildReminderEmailHtml(ticket, occurrence, reminderType) {
  const eventDate = formatEventDate(occurrence.event_date);
  const startTime = formatTime(occurrence.start_datetime, occurrence.timezone);
  const endTime = formatTime(occurrence.end_datetime, occurrence.timezone);
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || '';
  const isOnline = ticket.attendance_mode === 'online';
  
  const isOneHour = reminderType === '1hour';
  const timeLabel = isOneHour ? '1 hour' : '5 minutes';
  const title = isOneHour ? '⏰ Starting in 1 Hour' : '🔴 Starting in 5 Minutes!';
  const subtitle = isOnline
    ? (isOneHour ? 'Your online session is about to begin' : 'Your session is about to start — join now!')
    : (isOneHour ? 'Your session is about to begin' : 'Your session is about to start!');
  const bodyText = isOnline
    ? `Your online session starts in <strong>${timeLabel}</strong>. ${isOneHour ? 'Make sure you\'re ready to join on time.' : 'Click the button below to join now.'}`
    : `Your in-person session starts in <strong>${timeLabel}</strong>. ${isOneHour ? 'Make sure you have your QR code ready for check-in.' : 'Head to the venue now — present your QR code at the door for fast entry.'}`;
  
  const urgencyColor = isOneHour ? '#4338ca' : '#dc2626';
  const urgencyBg = isOneHour ? '#eef2ff' : '#fef2f2';
  const urgencyBorder = isOneHour ? '#c7d2fe' : '#fecaca';

  let accessBlock = '';
  
  if (isOnline) {
    // Online: show Zoom join link or fallback
    const zoomLink = ticket.zoom_join_url || occurrence.zoom_link || '';
    if (zoomLink) {
      const buttonText = isOneHour ? 'Get Ready to Join →' : 'Join Session Now →';
      accessBlock = `
        <tr><td style="padding:0 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${urgencyBg};border-radius:8px;padding:24px;border:1px solid ${urgencyBorder};">
            <tr><td style="text-align:center;">
              <h3 style="margin:0 0 12px;font-size:18px;color:${urgencyColor};">🖥 ${isOneHour ? 'Get Ready to Join' : 'Join Now!'}</h3>
              <p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.5;">${isOneHour ? 'Use the link below to join the webinar when it starts.' : 'The session is about to start. Click below to join immediately.'}</p>
              <a href="${zoomLink}" style="display:inline-block;background:${isOneHour ? BRAND.buttonBg : '#dc2626'};color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px;">${buttonText}</a>
            </td></tr>
          </table>
        </td></tr>`;
    } else {
      accessBlock = `
        <tr><td style="padding:0 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${urgencyBg};border-radius:8px;padding:20px;border:1px solid ${urgencyBorder};">
            <tr><td>
              <h3 style="margin:0 0 4px;font-size:15px;color:${urgencyColor};">🖥 Online Event</h3>
              <p style="margin:0;font-size:13px;color:#64748b;">Please check your inbox for the Zoom join link from your original ticket email.</p>
            </td></tr>
          </table>
        </td></tr>`;
    }
  } else {
    // In-person: show venue + QR code
    const venueText = occurrence.venue_details || occurrence.venue_name || 'Check your ticket email for venue details.';
    const venueLink = occurrence.venue_link;
    const parkingLink = occurrence.parking_link;

    let venueLinksHtml = '';
    if (venueLink) {
      venueLinksHtml += `<a href="${venueLink}" style="display:inline-block;background:${BRAND.buttonBg};color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;margin-right:8px;">Get Directions →</a>`;
    }
    if (parkingLink) {
      venueLinksHtml += `<a href="${parkingLink}" style="display:inline-block;background:#64748b;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">Parking Info</a>`;
    }

    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:20px;border:1px solid #bbf7d0;">
          <tr><td>
            <h3 style="margin:0 0 8px;font-size:15px;color:#166534;">📍 Venue</h3>
            <p style="margin:0 0 ${venueLinksHtml ? '12px' : '0'};font-size:14px;color:#334155;">${venueText}</p>
            ${venueLinksHtml ? `<div>${venueLinksHtml}</div>` : ''}
          </td></tr>
        </table>
      </td></tr>`;

    // Add QR code block
    if (ticket.qr_code_hash && ticket.qr_code_hash !== 'pending' && ticket.qr_code_hash !== 'temp') {
      const qrPayload = JSON.stringify({ t: ticket.id, e: ticket.occurrence_id || occurrence.id, h: ticket.qr_code_hash });
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;
      accessBlock += `
        <tr><td style="padding:0 40px 24px;text-align:center;">
          <h3 style="margin:0 0 8px;font-size:15px;color:${BRAND.headingColor};text-transform:uppercase;letter-spacing:0.5px;">Your Check-In QR Code</h3>
          <p style="margin:0 0 16px;font-size:13px;color:#94a3b8;">Show this at the door for fast entry.</p>
          <img src="${qrCodeUrl}" alt="QR Code" width="200" height="200" style="border:1px solid ${BRAND.cardBorder};border-radius:8px;padding:8px;background:#fff;" />
        </td></tr>`;
    }
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BRAND.bodyBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bodyBg};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.08);">
        
        ${brandHeader(title, occurrence.name)}

        <tr><td style="padding:32px 40px 16px;">
          <p style="margin:0;font-size:16px;color:#334155;">Hi <strong>${ticket.attendee_first_name}</strong>,</p>
          <p style="margin:12px 0 0;font-size:14px;color:#64748b;line-height:1.6;">${bodyText}</p>
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
              </table>
            </td></tr>
          </table>
        </td></tr>

        ${accessBlock}

        <tr><td style="padding:0 40px 24px;">
          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;text-align:center;">If you can no longer attend, no action is needed. We hope to see you there!</p>
        </td></tr>

        ${brandFooter()}

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Export the HTML builder for test emails
// The main handler runs as a scheduled job
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Check if this is a test email request (from sendTestEmail)
    let body = {};
    try {
      body = await req.json();
    } catch (_) { /* empty body from scheduler */ }

    // If called with test_mode, just build and send a preview email
    if (body.test_mode) {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { recipient_email, reminder_type, attendance_mode } = body;
      const testMode = attendance_mode || 'online';
      const mockOccurrence = {
        name: 'Test Event — Saturday Session',
        event_date: '2026-04-18',
        start_datetime: '2026-04-18T09:00:00+10:00',
        end_datetime: '2026-04-18T11:00:00+10:00',
        timezone: 'Australia/Brisbane',
        zoom_link: testMode === 'online' ? 'https://zoom.us/webinar/register/test-link' : '',
        event_mode: testMode === 'online' ? 'online_stream' : 'in_person',
        venue_details: testMode === 'in_person' ? '123 Example Street, Brisbane QLD 4000' : '',
        venue_link: testMode === 'in_person' ? 'https://maps.google.com' : '',
        parking_link: testMode === 'in_person' ? 'https://maps.google.com/parking' : '',
      };
      const mockTicket = {
        id: 'test-ticket-id',
        attendee_first_name: 'Test',
        attendee_last_name: 'Attendee',
        attendee_email: recipient_email,
        attendance_mode: testMode,
        occurrence_id: 'test-occ-id',
        qr_code_hash: testMode === 'in_person' ? 'abc123def456' : '',
        zoom_join_url: testMode === 'online' ? 'https://zoom.us/j/test-join' : '',
      };
      const html = buildReminderEmailHtml(mockTicket, mockOccurrence, reminder_type);
      const label = reminder_type === '1hour' ? '1-Hour' : '5-Minute';
      const modeLabel = testMode === 'online' ? 'Online' : 'In-Person';
      const result = await resend.emails.send({
        from: 'Session Pass <noreply@session-pass.com>',
        to: recipient_email,
        subject: `[TEST] ${label} ${modeLabel} Reminder — ${mockOccurrence.name}`,
        html
      });
      return Response.json({ success: true, sent: [{ type: `${label} ${modeLabel} Reminder`, id: result.data?.id }] });
    }

    // ── Scheduled job: find sessions starting soon and send reminders ──
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    
    // Get all published events for today
    const allOccurrences = await base44.asServiceRole.entities.EventOccurrence.filter({
      event_date: todayStr,
      is_published: true,
      status: 'published'
    });

    if (!allOccurrences.length) {
      console.log('No published sessions today, skipping reminders.');
      return Response.json({ sent: 0 });
    }

    let totalSent = 0;

    for (const occ of allOccurrences) {
      const startTime = new Date(occ.start_datetime);
      const minsUntilStart = (startTime - now) / (60 * 1000);

      // Determine which reminders to send (5-min window tolerance for scheduler)
      const reminders = [];
      if (minsUntilStart >= 57 && minsUntilStart <= 63) {
        reminders.push('1hour');
      }
      if (minsUntilStart >= 2 && minsUntilStart <= 8) {
        reminders.push('5min');
      }

      if (!reminders.length) continue;

      // Get all active tickets for this occurrence (both online and in-person)
      const tickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id: occ.id,
        ticket_status: 'active'
      });

      if (!tickets.length) {
        console.log(`No active tickets for ${occ.name}, skipping.`);
        continue;
      }

      // Group tickets by email so we send one email per unique attendee
      // If someone has multiple tickets, use the first one for the greeting
      const ticketsByEmail = {};
      for (const ticket of tickets) {
        const email = ticket.attendee_email.toLowerCase();
        if (!ticketsByEmail[email]) ticketsByEmail[email] = [];
        ticketsByEmail[email].push(ticket);
      }

      const uniqueEmails = Object.keys(ticketsByEmail);
      console.log(`Sending ${reminders.join(', ')} reminders for "${occ.name}" to ${uniqueEmails.length} attendees (${tickets.length} tickets).`);

      for (const reminderType of reminders) {
        const label = reminderType === '1hour' ? '1-Hour' : '5-Minute';
        
        // Send in batches of 10 to avoid overwhelming Resend
        const batchSize = 10;
        for (let i = 0; i < uniqueEmails.length; i += batchSize) {
          const batch = uniqueEmails.slice(i, i + batchSize);
          const promises = batch.map(email => {
            const emailTickets = ticketsByEmail[email];
            // Use the first ticket for the email (contains attendee name + mode)
            const primaryTicket = emailTickets[0];
            const html = buildReminderEmailHtml(primaryTicket, occ, reminderType);
            const modeLabel = primaryTicket.attendance_mode === 'online' ? 'Online' : 'In-Person';
            return sendWithRetry(() => resend.emails.send({
              from: 'Session Pass <noreply@session-pass.com>',
              to: email,
              subject: `${label} Reminder — ${occ.name}`,
              html
            }))
            .then(() => {
              totalSent++;
              console.log(`✓ ${label} ${modeLabel} reminder sent to ${email}`);
            })
            .catch(err => {
              console.error(`✗ Failed ${label} reminder to ${email}:`, err.message);
            });
          });
          await Promise.all(promises);
          
          // Small delay between batches to respect rate limits
          if (i + batchSize < uniqueEmails.length) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    }

    console.log(`Session reminder job complete. Total emails sent: ${totalSent}`);
    return Response.json({ sent: totalSent });
  } catch (error) {
    console.error("sendSessionReminders error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});