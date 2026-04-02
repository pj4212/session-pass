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

function formatTime(datetimeStr) {
  if (!datetimeStr) return '';
  const d = new Date(datetimeStr);
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function buildReminderEmailHtml(ticket, occurrence, reminderType) {
  const eventDate = formatEventDate(occurrence.event_date);
  const startTime = formatTime(occurrence.start_datetime);
  const endTime = formatTime(occurrence.end_datetime);
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || '';
  
  const isOneHour = reminderType === '1hour';
  const title = isOneHour ? '⏰ Starting in 1 Hour' : '🔴 Starting in 5 Minutes!';
  const subtitle = isOneHour
    ? 'Your online session is about to begin'
    : 'Your session is about to start — join now!';
  const bodyText = isOneHour
    ? 'Your online session starts in <strong>1 hour</strong>. Make sure you\'re ready to join on time.'
    : 'Your session starts in just <strong>5 minutes</strong>! Click the button below to join now.';
  const buttonText = isOneHour ? 'Register for Webinar →' : 'Join Session Now →';
  const urgencyColor = isOneHour ? '#4338ca' : '#dc2626';
  const urgencyBg = isOneHour ? '#eef2ff' : '#fef2f2';
  const urgencyBorder = isOneHour ? '#c7d2fe' : '#fecaca';

  const zoomLink = occurrence.zoom_link || '';
  
  let joinBlock = '';
  if (zoomLink) {
    joinBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${urgencyBg};border-radius:8px;padding:24px;border:1px solid ${urgencyBorder};">
          <tr><td style="text-align:center;">
            <h3 style="margin:0 0 12px;font-size:18px;color:${urgencyColor};">🖥 ${isOneHour ? 'Get Ready to Join' : 'Join Now!'}</h3>
            <p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.5;">${isOneHour ? 'Click below to register for the webinar and receive your unique Zoom link.' : 'The session is about to start. Click below to join immediately.'}</p>
            <a href="${zoomLink}" style="display:inline-block;background:${isOneHour ? BRAND.buttonBg : '#dc2626'};color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px;">${buttonText}</a>
          </td></tr>
        </table>
      </td></tr>`;
  } else {
    joinBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${urgencyBg};border-radius:8px;padding:20px;border:1px solid ${urgencyBorder};">
          <tr><td>
            <h3 style="margin:0 0 4px;font-size:15px;color:${urgencyColor};">🖥 Online Event</h3>
            <p style="margin:0;font-size:13px;color:#64748b;">The webinar link will be available shortly. Please check your inbox for the Zoom registration link from your original ticket email.</p>
          </td></tr>
        </table>
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

        ${joinBlock}

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
      const { recipient_email, reminder_type } = body;
      const mockOccurrence = {
        name: 'Test Event — Saturday Session',
        event_date: '2026-04-18',
        start_datetime: '2026-04-18T09:00:00+10:00',
        end_datetime: '2026-04-18T11:00:00+10:00',
        timezone: 'Australia/Brisbane',
        zoom_link: 'https://zoom.us/webinar/register/test-link',
        event_mode: 'online_stream'
      };
      const mockTicket = {
        attendee_first_name: 'Test',
        attendee_last_name: 'Attendee',
        attendee_email: recipient_email,
        attendance_mode: 'online'
      };
      const html = buildReminderEmailHtml(mockTicket, mockOccurrence, reminder_type);
      const label = reminder_type === '1hour' ? '1-Hour' : '5-Minute';
      const result = await resend.emails.send({
        from: 'Session Pass <noreply@session-pass.com>',
        to: recipient_email,
        subject: `[TEST] ${label} Reminder — ${mockOccurrence.name}`,
        html
      });
      return Response.json({ success: true, sent: [{ type: `${label} Reminder`, id: result.data?.id }] });
    }

    // ── Scheduled job: find online sessions starting soon and send reminders ──
    const now = new Date();
    
    // Window: check for events starting between 57-63 min from now (1-hour reminder)
    // and between 3-7 min from now (5-minute reminder)
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const fiveMinFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    const todayStr = now.toISOString().slice(0, 10);
    
    // Get all published events for today that have online component
    const allOccurrences = await base44.asServiceRole.entities.EventOccurrence.filter({
      event_date: todayStr,
      is_published: true,
      status: 'published'
    });

    // Filter to online/hybrid events only
    const onlineOccurrences = allOccurrences.filter(o => 
      o.event_mode === 'online_stream' || o.event_mode === 'hybrid'
    );

    if (!onlineOccurrences.length) {
      console.log('No online sessions today, skipping reminders.');
      return Response.json({ sent: 0 });
    }

    let totalSent = 0;

    for (const occ of onlineOccurrences) {
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

      // Get all active online tickets for this occurrence
      const tickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id: occ.id,
        attendance_mode: 'online',
        ticket_status: 'active'
      });

      if (!tickets.length) {
        console.log(`No online tickets for ${occ.name}, skipping.`);
        continue;
      }

      console.log(`Sending ${reminders.join(', ')} reminders for "${occ.name}" to ${tickets.length} attendees.`);

      for (const reminderType of reminders) {
        const label = reminderType === '1hour' ? '1-Hour' : '5-Minute';
        
        // Send in batches of 10 to avoid overwhelming Resend
        const batchSize = 10;
        for (let i = 0; i < tickets.length; i += batchSize) {
          const batch = tickets.slice(i, i + batchSize);
          const promises = batch.map(ticket => {
            const html = buildReminderEmailHtml(ticket, occ, reminderType);
            return sendWithRetry(() => resend.emails.send({
              from: 'Session Pass <noreply@session-pass.com>',
              to: ticket.attendee_email,
              subject: `${label} Reminder — ${occ.name}`,
              html
            }))
            .then(() => {
              totalSent++;
              console.log(`✓ ${label} reminder sent to ${ticket.attendee_email}`);
            })
            .catch(err => {
              console.error(`✗ Failed ${label} reminder to ${ticket.attendee_email}:`, err.message);
            });
          });
          await Promise.all(promises);
          
          // Small delay between batches to respect rate limits
          if (i + batchSize < tickets.length) {
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