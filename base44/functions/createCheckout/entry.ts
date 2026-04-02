import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.14.0';
import { Resend } from 'npm:resend@3.2.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

// Retry wrapper with exponential backoff for email sending
async function sendWithRetry(fn, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const isRateLimit = err?.statusCode === 429 || err?.message?.includes('rate');
      const isServerError = err?.statusCode >= 500;
      const isRetryable = isRateLimit || isServerError || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET';
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`sendWithRetry failed after ${attempt} attempts:`, err.message);
        throw err;
      }
      
      const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 500, 30000);
      console.warn(`sendWithRetry attempt ${attempt} failed (${err.message}), retrying in ${Math.round(delay)}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

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
    const { buyer, attendees, occurrence_id, origin_url } = body;

    // Load occurrence
    const occurrences = await base44.asServiceRole.entities.EventOccurrence.filter({ id: occurrence_id });
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
    const allTicketTypes = await base44.asServiceRole.entities.TicketType.filter({ occurrence_id: occurrence.id });
    const ticketTypeMap = {};
    for (const tt of allTicketTypes) {
      ticketTypeMap[tt.id] = tt;
    }

    // Validate attendees and check duplicates
    const emailModeSet = new Set();
    for (const att of attendees) {
      if (!att.first_name || !att.last_name || !att.email || !att.ticket_type_id) {
        return Response.json({ error: "All attendee fields are required" }, { status: 400 });
      }
      const tt = ticketTypeMap[att.ticket_type_id];
      if (!tt) {
        return Response.json({ error: `Invalid ticket type: ${att.ticket_type_id}` }, { status: 400 });
      }

      // Check within-order duplicates
      const key = `${att.email.toLowerCase()}_${tt.attendance_mode}`;
      if (emailModeSet.has(key)) {
        return Response.json({ 
          error: `Each attendee can only have one ${tt.attendance_mode === 'online' ? 'online' : 'in-person'} ticket. Duplicate: ${att.email}` 
        }, { status: 400 });
      }
      emailModeSet.add(key);
    }

    // Check existing active tickets for each attendee
    for (const att of attendees) {
      const tt = ticketTypeMap[att.ticket_type_id];
      const existingTickets = await base44.asServiceRole.entities.Ticket.filter({
        occurrence_id: occurrence.id,
        attendee_email: att.email.toLowerCase(),
        attendance_mode: tt.attendance_mode,
        ticket_status: 'active'
      });
      if (existingTickets.length > 0) {
        return Response.json({ 
          error: `${att.email} already has an active ${tt.attendance_mode === 'online' ? 'online' : 'in-person'} ticket for this event.` 
        }, { status: 400 });
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
    const isFree = totalAmount === 0;

    // Create order
    const order = await base44.asServiceRole.entities.Order.create({
      order_number: orderNumber,
      buyer_name: `${buyer.first_name} ${buyer.last_name}`,
      buyer_email: buyer.email,
      buyer_phone: buyer.phone || '',
      occurrence_id: occurrence.id,
      total_amount: totalAmount,
      payment_status: isFree ? 'free' : 'pending',
      order_status: 'confirmed'
    });

    if (!isFree) {
      for (const att of attendees) {
        const tt = ticketTypeMap[att.ticket_type_id];
        const tempHash = 'pending';
        await base44.asServiceRole.entities.Ticket.create({
          order_id: order.id,
          occurrence_id: occurrence.id,
          ticket_type_id: att.ticket_type_id,
          attendance_mode: tt.attendance_mode,
          attendee_first_name: att.first_name,
          attendee_last_name: att.last_name,
          attendee_email: att.email.toLowerCase(),
          upline_mentor_id: att.upline_mentor_id || '',
          platinum_leader_id: att.platinum_leader_id || '',
          qr_code_hash: tempHash,
          ticket_status: 'active'
        });
      }

      // Create Stripe Checkout session
      const lineItems = [];
      const ticketsByType = {};
      for (const att of attendees) {
        const tt = ticketTypeMap[att.ticket_type_id];
        if (tt.price > 0) {
          if (!ticketsByType[tt.id]) {
            ticketsByType[tt.id] = { tt, count: 0 };
          }
          ticketsByType[tt.id].count++;
        }
      }

      for (const { tt, count } of Object.values(ticketsByType)) {
        lineItems.push({
          price_data: {
            currency: 'aud',
            product_data: { name: `${tt.name} (${tt.attendance_mode === 'online' ? 'Online' : 'In-Person'})` },
            unit_amount: Math.round(tt.price * 100)
          },
          quantity: count
        });
      }

      const baseUrl = origin_url || 'https://session-pass.com';
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        success_url: `${baseUrl}/order/${orderNumber}?payment=success`,
        cancel_url: `${baseUrl}/event/${occurrence.slug}?payment=cancelled`,
        customer_email: buyer.email,
        metadata: {
          order_id: order.id,
          order_number: orderNumber,
          base44_app_id: Deno.env.get("BASE44_APP_ID")
        }
      });

      await base44.asServiceRole.entities.Order.update(order.id, {
        stripe_checkout_session_id: session.id
      });

      return Response.json({ 
        checkout_url: session.url,
        order_number: orderNumber,
        payment_required: true
      });
    }

    // FREE ORDER — create tickets immediately
    const tickets = [];
    for (const att of attendees) {
      const tt = ticketTypeMap[att.ticket_type_id];
      const ticket = await base44.asServiceRole.entities.Ticket.create({
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
        ticket_status: 'active'
      });

      const qrHash = await generateQrHash(ticket.id, occurrence.id);
      await base44.asServiceRole.entities.Ticket.update(ticket.id, { qr_code_hash: qrHash });
      ticket.qr_code_hash = qrHash;
      tickets.push(ticket);

      await base44.asServiceRole.entities.TicketType.update(tt.id, {
        quantity_sold: (tt.quantity_sold || 0) + 1
      });
    }

    // Send emails with retry — fire all in parallel for speed, but with individual retry protection
    const emailPromises = [
      sendOrderReceiptEmail(base44, order, occurrence, tickets, ticketTypeMap)
        .catch(err => console.error(`Failed to send order receipt to ${order.buyer_email}:`, err.message)),
      ...tickets.map(ticket =>
        sendTicketEmail(base44, ticket, occurrence, ticketTypeMap[ticket.ticket_type_id])
          .catch(err => console.error(`Failed to send ticket email to ${ticket.attendee_email}:`, err.message))
      )
    ];
    await Promise.all(emailPromises);

    return Response.json({ 
      order_number: orderNumber,
      payment_required: false 
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
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border-radius:8px;padding:20px;border:1px solid #c7d2fe;">
          <tr><td>
            <h3 style="margin:0 0 8px;font-size:15px;color:#4338ca;">🖥 Join Online</h3>
            <p style="margin:0 0 12px;font-size:13px;color:#64748b;line-height:1.4;">Click the button below to register for the webinar and receive your unique Zoom link.</p>
            <a href="${occurrence.zoom_link}" style="display:inline-block;background:${BRAND.buttonBg};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;">Register for Webinar →</a>
          </td></tr>
        </table>
      </td></tr>`;
  } else if (isOnline) {
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

async function sendTicketEmail(base44, ticket, occurrence, ticketType) {
  const isOnline = ticket.attendance_mode === 'online';
  const html = buildTicketEmailHtml(ticket, occurrence, ticketType);

  await sendWithRetry(() => resend.emails.send({
    from: 'Session Pass <noreply@session-pass.com>',
    to: ticket.attendee_email,
    subject: `Your ${isOnline ? 'Online' : 'In-Person'} Ticket — ${occurrence.name}`,
    html: html
  }));
  console.log(`Ticket email sent to ${ticket.attendee_email} for ticket ${ticket.id}`);
}