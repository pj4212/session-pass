import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { Resend } from 'npm:resend@3.2.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

// Retry wrapper with exponential backoff for any retryable operation (DB, email, API)
async function withRetry(fn, label = 'operation', maxRetries = 8) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err?.message || '';
      const status = err?.statusCode || err?.status || 0;
      const isRateLimit = status === 429 || msg.includes('Rate limit') || msg.includes('rate');
      const isServerError = status >= 500;
      const isRetryable = isRateLimit || isServerError || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';

      if (!isRetryable || attempt === maxRetries) {
        console.error(`${label} failed after ${attempt} attempts:`, msg);
        throw err;
      }

      // Exponential backoff: 2s, 4s, 8s, 16s, 32s, capped at 60s + jitter
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 60000) + Math.random() * 1000;
      console.warn(`${label} attempt ${attempt} failed (${msg}), retrying in ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Backwards-compatible alias for email sending
const sendWithRetry = (fn, maxRetries) => withRetry(fn, 'email', maxRetries);

async function generateQrHash(ticketId, occurrenceId) {
  const salt = Deno.env.get("QR_SECRET_SALT");
  const data = new TextEncoder().encode(ticketId + occurrenceId + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12);
}

function generateOrderNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `UV-${date}-${rand}`;
}

// ── Shared email brand constants ──
const BRAND = {
  headerBg: '#0f172a',
  accentColor: '#818cf8',
  buttonBg: '#6366f1',
  buttonHover: '#4f46e5',
  headingColor: '#0f172a',
  cardBg: '#f8fafc',
  cardBorder: '#e2e8f0',
  tableBorder: '#e2e8f0',
  tableHeaderBg: '#f1f5f9',
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { buyer, attendees, occurrence_id, origin_url, skip_emails, send_all_to_buyer } = body;

    // Load occurrence
    const occurrences = await withRetry(
      () => base44.asServiceRole.entities.EventOccurrence.filter({ id: occurrence_id }),
      'load occurrence'
    );
    if (!occurrences.length) {
      return Response.json({ error: "Event not found" }, { status: 404 });
    }
    const occurrence = occurrences[0];

    // Check event is published and sales open
    if (occurrence.status !== 'published' || !occurrence.is_published) {
      return Response.json({ error: "Event is not available for booking" }, { status: 400 });
    }

    const now = new Date().toISOString();
    if (occurrence.sales_open_date && now < occurrence.sales_open_date) {
      return Response.json({ error: "Sales have not opened yet" }, { status: 400 });
    }
    if (occurrence.sales_close_date && now > occurrence.sales_close_date) {
      return Response.json({ error: "Sales have closed" }, { status: 400 });
    }

    // Load ticket types for this occurrence
    const allTicketTypes = await withRetry(
      () => base44.asServiceRole.entities.TicketType.filter({ occurrence_id: occurrence.id }),
      'load ticket types'
    );
    const ticketTypeMap = {};
    for (const tt of allTicketTypes) {
      ticketTypeMap[tt.id] = tt;
    }

    // Validate attendees
    for (const att of attendees) {
      if (!att.first_name || !att.last_name || !att.email || !att.ticket_type_id) {
        return Response.json({ error: "All attendee fields are required" }, { status: 400 });
      }
      const tt = ticketTypeMap[att.ticket_type_id];
      if (!tt) {
        return Response.json({ error: `Invalid ticket type: ${att.ticket_type_id}` }, { status: 400 });
      }
    }

    // Check capacity for in_person tickets
    const inPersonCounts = {};
    for (const att of attendees) {
      const tt = ticketTypeMap[att.ticket_type_id];
      if (tt.attendance_mode === 'in_person') {
        inPersonCounts[tt.id] = (inPersonCounts[tt.id] || 0) + 1;
      }
    }
    for (const [ttId, count] of Object.entries(inPersonCounts)) {
      const tt = ticketTypeMap[ttId];
      if (tt.capacity_limit != null && (tt.quantity_sold || 0) + count > tt.capacity_limit) {
        return Response.json({ 
          error: `Not enough capacity for "${tt.name}". Only ${tt.capacity_limit - (tt.quantity_sold || 0)} spots remaining.` 
        }, { status: 400 });
      }
    }

    // Calculate total
    let totalAmount = 0;
    for (const att of attendees) {
      const tt = ticketTypeMap[att.ticket_type_id];
      totalAmount += tt.price || 0;
    }

    const orderNumber = generateOrderNumber();

    // Create order
    const order = await withRetry(
      () => base44.asServiceRole.entities.Order.create({
        order_number: orderNumber,
        buyer_name: `${buyer.first_name} ${buyer.last_name}`,
        buyer_email: buyer.email,
        buyer_phone: buyer.phone || '',
        occurrence_id: occurrence.id,
        total_amount: totalAmount,
        payment_status: totalAmount === 0 ? 'free' : 'completed',
        order_status: 'confirmed',
        send_all_to_buyer: !!send_all_to_buyer
      }),
      'create order'
    );

    // Create tickets in parallel batches for speed
    const tickets = [];
    const BATCH_SIZE = 4;
    for (let i = 0; i < attendees.length; i += BATCH_SIZE) {
      const batch = attendees.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (att) => {
        const tt = ticketTypeMap[att.ticket_type_id];
        const ticket = await withRetry(
          () => base44.asServiceRole.entities.Ticket.create({
            workspace_id: occurrence.workspace_id || '',
            order_id: order.id,
            occurrence_id: occurrence.id,
            ticket_type_id: att.ticket_type_id,
            attendance_mode: tt.attendance_mode,
            attendee_first_name: att.first_name,
            attendee_last_name: att.last_name,
            attendee_email: att.email.toLowerCase(),
            upline_mentor_id: att.upline_mentor_id || '',
            platinum_leader_id: att.platinum_leader_id || '',
            qr_code_hash: 'temp',
            ticket_status: 'active',
            custom_answers: att.custom_answers || ''
          }),
          `create free ticket for ${att.email}`
        );
        // Generate QR hash and update ticket (must happen after create to get ticket.id)
        const qrHash = await generateQrHash(ticket.id, occurrence.id);
        await withRetry(
          () => base44.asServiceRole.entities.Ticket.update(ticket.id, { qr_code_hash: qrHash }),
          `update QR hash for ${att.email}`
        );
        ticket.qr_code_hash = qrHash;
        return ticket;
      }));
      tickets.push(...batchResults);
    }

    // Batch quantity_sold updates — one update per ticket type instead of per ticket
    const qtyCounts = {};
    for (const att of attendees) {
      qtyCounts[att.ticket_type_id] = (qtyCounts[att.ticket_type_id] || 0) + 1;
    }
    await Promise.all(Object.entries(qtyCounts).map(([ttId, count]) => {
      const tt = ticketTypeMap[ttId];
      return withRetry(
        () => base44.asServiceRole.entities.TicketType.update(ttId, {
          quantity_sold: (tt.quantity_sold || 0) + count
        }),
        `update quantity_sold for ${tt.name}`
      );
    }));

    // Register online attendees with Zoom webinar
    let zoomJoinUrls = {};
    let zoomFallbackTickets = new Set();
    const onlineTickets = tickets.filter(t => t.attendance_mode === 'online');
    const hasZoomWebinar = occurrence.zoom_meeting_id || (occurrence.zoom_link && /\/register\/WN_|\/w\/\d+/.test(occurrence.zoom_link));
    if (onlineTickets.length > 0 && hasZoomWebinar) {
      try {
        const zoomRes = await base44.asServiceRole.functions.invoke('registerZoomAttendee', {
          tickets: onlineTickets.map(t => ({
            id: t.id,
            attendance_mode: t.attendance_mode,
            attendee_first_name: t.attendee_first_name,
            attendee_last_name: t.attendee_last_name,
            attendee_email: t.attendee_email,
            platinum_leader_id: t.platinum_leader_id || ''
          })),
          occurrence_id: occurrence.id
        });
        const zoomData = zoomRes?.data || zoomRes;
        if (zoomData?.registrations) {
          for (const reg of zoomData.registrations) {
            if (reg.join_url) {
              zoomJoinUrls[reg.ticket_id] = reg.join_url;
              if (reg.registration_link_fallback) {
                zoomFallbackTickets.add(reg.ticket_id);
              }
            }
          }
        }
        console.log(`Zoom registration complete: ${Object.keys(zoomJoinUrls).length} join URLs obtained (${zoomFallbackTickets.size} fallbacks)`);
      } catch (err) {
        console.error('Zoom registration failed (non-blocking):', err.message);
      }
    }

    // Send emails with controlled concurrency to avoid rate limits
    if (!skip_emails) {
      if (send_all_to_buyer) {
        // Only 2 emails — send in parallel
        await Promise.all([
          sendOrderReceiptEmail(base44, order, occurrence, tickets, ticketTypeMap)
            .catch(err => console.error(`Failed to send order receipt to ${order.buyer_email}:`, err.message)),
          sendCombinedTicketsEmail(order, occurrence, tickets, ticketTypeMap, zoomJoinUrls, zoomFallbackTickets)
            .catch(err => console.error(`Failed to send combined tickets email to ${order.buyer_email}:`, err.message))
        ]);
      } else {
        // Send order receipt first
        await sendOrderReceiptEmail(base44, order, occurrence, tickets, ticketTypeMap)
          .catch(err => console.error(`Failed to send order receipt to ${order.buyer_email}:`, err.message));
        // Send individual ticket emails in batches of 5 to avoid rate limits
        const EMAIL_BATCH = 5;
        for (let i = 0; i < tickets.length; i += EMAIL_BATCH) {
        const batch = tickets.slice(i, i + EMAIL_BATCH);
        await Promise.all(batch.map(ticket =>
          sendTicketEmail(base44, ticket, occurrence, ticketTypeMap[ticket.ticket_type_id], zoomJoinUrls[ticket.id], zoomFallbackTickets.has(ticket.id))
            .catch(err => console.error(`Failed to send ticket email to ${ticket.attendee_email}:`, err.message))
        ));
        }
      }
    }

    return Response.json({ 
      order_number: orderNumber
    });
  } catch (error) {
    console.error("createCheckout error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

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

function buildOrderEmailHtml(order, occurrence, tickets, ticketTypeMap) {
  const eventDate = formatEventDate(occurrence.event_date);
  const startTime = formatTime(occurrence.start_datetime, occurrence.timezone);
  const endTime = formatTime(occurrence.end_datetime, occurrence.timezone);
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || '';
  const totalText = order.total_amount > 0 ? `$${order.total_amount.toFixed(2)} AUD` : 'Free';
  const orderUrl = `https://session-pass.com/order/${order.order_number}`;

  const ticketRows = tickets.map(t => {
    const tt = ticketTypeMap[t.ticket_type_id];
    const mode = t.attendance_mode === 'online' ? 'Online' : 'In-Person';
    const price = tt?.price > 0 ? `$${tt.price.toFixed(2)}` : 'Free';
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.tableBorder};font-size:14px;color:#334155;">${t.attendee_first_name} ${t.attendee_last_name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.tableBorder};font-size:14px;color:#334155;">${tt?.name || 'Ticket'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.tableBorder};font-size:14px;color:#64748b;">${mode}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND.tableBorder};font-size:14px;color:#334155;text-align:right;">${price}</td>
      </tr>`;
  }).join('');

  let venueBlock = '';
  if (occurrence.venue_details) {
    venueBlock = `
      <tr>
        <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:100px;">Venue</td>
        <td style="padding:6px 0;font-size:14px;color:#334155;">${occurrence.venue_details}</td>
      </tr>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BRAND.bodyBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bodyBg};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.08);">
        
        ${brandHeader('Booking Confirmed ✓', `Order #${order.order_number}`)}

        <tr><td style="padding:32px 40px 16px;">
          <p style="margin:0;font-size:16px;color:#334155;">Hi <strong>${order.buyer_name}</strong>,</p>
          <p style="margin:8px 0 0;font-size:14px;color:#64748b;line-height:1.5;">Thank you for your booking. Here are your details:</p>
        </td></tr>

        <tr><td style="padding:8px 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cardBg};border-radius:8px;padding:20px;border:1px solid ${BRAND.cardBorder};">
            <tr><td>
              <h2 style="margin:0 0 12px;font-size:18px;color:${BRAND.headingColor};">${occurrence.name}</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:100px;">Date</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;font-weight:600;">${eventDate}</td>
                </tr>
                ${timeStr ? `<tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Time</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;">${timeStr} (${occurrence.timezone || 'AEST'})</td>
                </tr>` : ''}
                ${venueBlock}
              </table>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 40px 24px;">
          <h3 style="margin:0 0 12px;font-size:15px;color:${BRAND.headingColor};text-transform:uppercase;letter-spacing:0.5px;">Your Tickets</h3>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.tableBorder};border-radius:8px;overflow:hidden;">
            <tr style="background:${BRAND.tableHeaderBg};">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Attendee</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Type</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Mode</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Price</th>
            </tr>
            ${ticketRows}
            <tr style="background:${BRAND.cardBg};">
              <td colspan="3" style="padding:12px;font-size:14px;font-weight:700;color:${BRAND.headingColor};">Total</td>
              <td style="padding:12px;font-size:14px;font-weight:700;color:${BRAND.headingColor};text-align:right;">${totalText}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 40px 32px;text-align:center;">
          <a href="${orderUrl}" style="display:inline-block;background:${BRAND.buttonBg};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">View Your Tickets</a>
        </td></tr>

        <tr><td style="padding:0 40px 24px;">
          <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">Each attendee will receive a separate email with their individual ticket and QR code for check-in.</p>
        </td></tr>

        ${brandFooter()}

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildTicketEmailHtml(ticket, occurrence, ticketType, joinUrl, isRegistrationFallback = false) {
  const eventDate = formatEventDate(occurrence.event_date);
  const startTime = formatTime(occurrence.start_datetime, occurrence.timezone);
  const endTime = formatTime(occurrence.end_datetime, occurrence.timezone);
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || '';
  const isOnline = ticket.attendance_mode === 'online';
  const mode = isOnline ? 'Online' : 'In-Person';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(ticket.qr_code_hash)}`;
  const registrationLink = occurrence.zoom_link || '';

  let accessBlock = '';
  if (isOnline && joinUrl && !isRegistrationFallback) {
    const joinBtnHtml = `
        <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.4;">You've been registered for the webinar. Use the link below to join:</p>
        <a href="${joinUrl}" style="display:inline-block;background:${BRAND.buttonBg};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;margin-bottom:12px;">Join Webinar →</a>`;
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:8px;padding:20px;border:1px solid #c7d2fe;">
          <tr><td>
            <h3 style="margin:0 0 8px;font-size:15px;color:#4338ca;">🖥 Join Online</h3>
            ${joinBtnHtml}
          </td></tr>
        </table>
      </td></tr>`;
  } else if (isOnline && (isRegistrationFallback || registrationLink)) {
    const regLink = joinUrl || registrationLink;
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:8px;padding:20px;border:1px solid #fde68a;">
          <tr><td>
            <h3 style="margin:0 0 8px;font-size:15px;color:#92400e;">🖥 Register for Webinar</h3>
            <p style="margin:0 0 12px;font-size:13px;color:#64748b;line-height:1.4;">Please register using the link below to get your personal join link for the session.</p>
            <a href="${regLink}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Register for Webinar →</a>
          </td></tr>
        </table>
      </td></tr>`;
  } else if (isOnline) {
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:8px;padding:20px;border:1px solid #c7d2fe;">
          <tr><td>
            <h3 style="margin:0 0 4px;font-size:15px;color:#4338ca;">🖥 Online Event</h3>
            <p style="margin:0;font-size:13px;color:#64748b;">Your webinar join link will be emailed to you before the event.</p>
          </td></tr>
        </table>
      </td></tr>`;
  } else {
    let venueText = occurrence.venue_details || 'Venue details will be provided closer to the event.';
    accessBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:20px;border:1px solid #bbf7d0;">
          <tr><td>
            <h3 style="margin:0 0 4px;font-size:15px;color:#166534;">📍 In-Person Venue</h3>
            <p style="margin:0;font-size:14px;color:#334155;">${venueText}</p>
          </td></tr>
        </table>
      </td></tr>`;
  }

  let qrBlock = '';
  if (!isOnline) {
    qrBlock = `
      <tr><td style="padding:0 40px 32px;text-align:center;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:2px solid ${BRAND.cardBorder};padding:24px;">
          <tr><td style="text-align:center;">
            <img src="${qrCodeUrl}" alt="QR Code" width="280" height="280" style="display:block;margin:0 auto;" />
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Scan at door for entry</p>
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
        
        ${brandHeader('Your Ticket', occurrence.name)}

        <tr><td style="padding:32px 40px 16px;">
          <p style="margin:0;font-size:16px;color:#334155;">Hi <strong>${ticket.attendee_first_name}</strong>,</p>
          <p style="margin:8px 0 0;font-size:14px;color:#64748b;line-height:1.5;">Here's your ticket for the upcoming event.</p>
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
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Ticket Type</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;">${ticketType?.name || 'General'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Attendance</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;">
                    <span style="display:inline-block;background:${isOnline ? '#eef2ff;color:#4338ca' : '#f0fdf4;color:#166534'};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${mode}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Reference</td>
                  <td style="padding:6px 0;font-size:13px;color:#cbd5e1;font-family:monospace;">${ticket.id}</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        ${accessBlock}
        ${qrBlock}

        ${brandFooter()}

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendOrderReceiptEmail(base44, order, occurrence, tickets, ticketTypeMap) {
  const html = buildOrderEmailHtml(order, occurrence, tickets, ticketTypeMap);

  await sendWithRetry(() => resend.emails.send({
    from: 'Session Pass <noreply@session-pass.com>',
    to: order.buyer_email,
    subject: `Booking Confirmed — ${occurrence.name} | Order #${order.order_number}`,
    html: html
  }));
  console.log(`Order receipt email sent to ${order.buyer_email} for order ${order.order_number}`);
}

async function sendTicketEmail(base44, ticket, occurrence, ticketType, joinUrl, isRegistrationFallback = false) {
  const isOnline = ticket.attendance_mode === 'online';
  const html = buildTicketEmailHtml(ticket, occurrence, ticketType, joinUrl, isRegistrationFallback);

  await sendWithRetry(() => resend.emails.send({
    from: 'Session Pass <noreply@session-pass.com>',
    to: ticket.attendee_email,
    subject: `Your ${isOnline ? 'Online' : 'In-Person'} Ticket — ${occurrence.name}`,
    html: html
  }));
  console.log(`Ticket email sent to ${ticket.attendee_email} for ticket ${ticket.id}`);
}

function buildCombinedTicketsEmailHtml(order, occurrence, tickets, ticketTypeMap, zoomJoinUrls = {}, zoomFallbackTicketIds = new Set()) {
  const eventDate = formatEventDate(occurrence.event_date);
  const startTime = formatTime(occurrence.start_datetime, occurrence.timezone);
  const endTime = formatTime(occurrence.end_datetime, occurrence.timezone);
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || '';

  let venueBlock = '';
  if (occurrence.venue_details) {
    venueBlock = `
      <tr>
        <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:100px;">Venue</td>
        <td style="padding:6px 0;font-size:14px;color:#334155;">${occurrence.venue_details}</td>
      </tr>`;
  }

  const hasOnlineTickets = tickets.some(t => t.attendance_mode === 'online');
  const hasInPersonTickets = tickets.some(t => t.attendance_mode !== 'online');
  const hasJoinUrls = Object.keys(zoomJoinUrls).length > 0;
  const registrationLink = occurrence.zoom_link || '';

  const allFallbacks = hasJoinUrls && zoomFallbackTicketIds.size > 0 && tickets.filter(t => t.attendance_mode === 'online').every(t => zoomFallbackTicketIds.has(t.id));

  let zoomBlock = '';
  if (hasOnlineTickets && hasJoinUrls && !allFallbacks) {
    const joinHtml = `<p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.4;">Your online attendees have been registered. Each ticket below includes a direct join link.</p>`;
    zoomBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:8px;padding:20px;border:1px solid #c7d2fe;">
          <tr><td>
            <h3 style="margin:0 0 8px;font-size:15px;color:#4338ca;">\ud83d\udda5 Join Online</h3>
            ${joinHtml}
          </td></tr>
        </table>
      </td></tr>`;
  } else if (hasOnlineTickets && (allFallbacks || registrationLink)) {
    const regLink = registrationLink;
    zoomBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:8px;padding:20px;border:1px solid #fde68a;">
          <tr><td>
            <h3 style="margin:0 0 8px;font-size:15px;color:#92400e;">\ud83d\udda5 Register for Webinar</h3>
            <p style="margin:0 0 12px;font-size:13px;color:#64748b;line-height:1.4;">Please register using the link below to get your personal join link.</p>
            ${regLink ? `<a href="${regLink}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Register for Webinar \u2192</a>` : ''}
          </td></tr>
        </table>
      </td></tr>`;
  } else if (hasOnlineTickets) {
    zoomBlock = `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:8px;padding:20px;border:1px solid #c7d2fe;">
          <tr><td>
            <h3 style="margin:0 0 4px;font-size:15px;color:#4338ca;">\ud83d\udda5 Online Event</h3>
            <p style="margin:0;font-size:13px;color:#64748b;">Your webinar join link will be emailed before the event.</p>
          </td></tr>
        </table>
      </td></tr>`;
  }

  if (hasInPersonTickets && occurrence.venue_details) {
    zoomBlock += `
      <tr><td style="padding:0 40px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;padding:20px;border:1px solid #bbf7d0;">
          <tr><td>
            <h3 style="margin:0 0 4px;font-size:15px;color:#166534;">📍 In-Person Venue</h3>
            <p style="margin:0;font-size:14px;color:#334155;">${occurrence.venue_details}</p>
          </td></tr>
        </table>
      </td></tr>`;
  }

  // Build a ticket card for each ticket
  const ticketBlocks = tickets.map((ticket, idx) => {
    const tt = ticketTypeMap[ticket.ticket_type_id];
    const isOnline = ticket.attendance_mode === 'online';
    const mode = isOnline ? 'Online' : 'In-Person';
    const modeBg = isOnline ? '#eef2ff;color:#4338ca' : '#f0fdf4;color:#166534';
    const ticketJoinUrl = zoomJoinUrls[ticket.id];

    const isFallback = zoomFallbackTicketIds.has(ticket.id);
    let joinHtml = '';
    if (isOnline && ticketJoinUrl && !isFallback) {
      joinHtml = `
        <div style="margin-top:12px;">
          <a href="${ticketJoinUrl}" style="display:inline-block;background:${BRAND.buttonBg};color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">Join Webinar →</a>
        </div>`;
    } else if (isOnline && (isFallback || registrationLink)) {
      const regLink = ticketJoinUrl || registrationLink;
      joinHtml = `
        <div style="margin-top:12px;">
          <a href="${regLink}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">Register for Webinar →</a>
        </div>`;
    }

    let qrHtml = '';
    if (!isOnline) {
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(ticket.qr_code_hash)}`;
      qrHtml = `
        <div style="text-align:center;margin-top:16px;padding:20px;background:#ffffff;border-radius:12px;border:2px solid ${BRAND.cardBorder};">
          <img src="${qrCodeUrl}" alt="QR Code" width="240" height="240" style="display:block;margin:0 auto;" />
          <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Scan at door for entry</p>
        </div>`;
    }

    return `
      <tr><td style="padding:0 40px ${idx < tickets.length - 1 ? '16px' : '24px'};">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cardBg};border-radius:8px;border:1px solid ${BRAND.cardBorder};">
          <tr><td style="padding:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <h3 style="margin:0;font-size:16px;color:${BRAND.headingColor};">Ticket ${idx + 1}: ${ticket.attendee_first_name} ${ticket.attendee_last_name}</h3>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;color:#94a3b8;font-size:13px;width:110px;">Type</td>
                <td style="padding:4px 0;font-size:14px;color:#334155;">${tt?.name || 'General'}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#94a3b8;font-size:13px;">Attendance</td>
                <td style="padding:4px 0;font-size:14px;color:#334155;"><span style="display:inline-block;background:${modeBg};padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${mode}</span></td>
              </tr>
            </table>
            ${joinHtml}
            ${qrHtml}
          </td></tr>
        </table>
      </td></tr>`;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${BRAND.bodyBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bodyBg};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.08);">
        
        ${brandHeader('All Your Tickets', occurrence.name)}

        <tr><td style="padding:32px 40px 16px;">
          <p style="margin:0;font-size:16px;color:#334155;">Hi <strong>${order.buyer_name}</strong>,</p>
          <p style="margin:8px 0 0;font-size:14px;color:#64748b;line-height:1.5;">Here are all ${tickets.length} ticket${tickets.length > 1 ? 's' : ''} for the upcoming event.</p>
        </td></tr>

        <tr><td style="padding:8px 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cardBg};border-radius:8px;padding:20px;border:1px solid ${BRAND.cardBorder};">
            <tr><td>
              <h2 style="margin:0 0 12px;font-size:18px;color:${BRAND.headingColor};">${occurrence.name}</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;width:100px;">Date</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;font-weight:600;">${eventDate}</td>
                </tr>
                ${timeStr ? `<tr>
                  <td style="padding:6px 0;color:#94a3b8;font-size:13px;">Time</td>
                  <td style="padding:6px 0;font-size:14px;color:#334155;">${timeStr} (${occurrence.timezone || 'AEST'})</td>
                </tr>` : ''}
                ${venueBlock}
              </table>
            </td></tr>
          </table>
        </td></tr>

        ${zoomBlock}

        <tr><td style="padding:0 40px 12px;">
          <h3 style="margin:0;font-size:15px;color:${BRAND.headingColor};text-transform:uppercase;letter-spacing:0.5px;">Your Tickets</h3>
          ${hasInPersonTickets ? '<p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">Present each QR code at the door for check-in.</p>' : ''}
        </td></tr>

        ${ticketBlocks}

        ${brandFooter()}

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendCombinedTicketsEmail(order, occurrence, tickets, ticketTypeMap, zoomJoinUrls = {}, zoomFallbackTicketIds = new Set()) {
  const html = buildCombinedTicketsEmailHtml(order, occurrence, tickets, ticketTypeMap, zoomJoinUrls, zoomFallbackTicketIds);

  await sendWithRetry(() => resend.emails.send({
    from: 'Session Pass <noreply@session-pass.com>',
    to: order.buyer_email,
    subject: `Your ${tickets.length} Ticket${tickets.length > 1 ? 's' : ''} — ${occurrence.name}`,
    html: html
  }));
  console.log(`Combined tickets email sent to ${order.buyer_email} for order ${order.order_number}`);
}