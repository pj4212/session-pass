import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.14.0';
import { Resend } from 'npm:resend@3.2.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

async function generateQrHash(ticketId, occurrenceId) {
  const salt = Deno.env.get("QR_SECRET_SALT");
  const data = new TextEncoder().encode(ticketId + occurrenceId + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12);
}

// ── Shared email brand constants ──
const BRAND = {
  headerBg: '#0f172a',
  accentColor: '#818cf8',
  buttonBg: '#6366f1',
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
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    let event;
    if (webhookSecret && signature) {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body);
    }

    console.log("Stripe webhook event:", event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      const orderNumber = session.metadata?.order_number;

      if (!orderId) {
        console.error("No order_id in session metadata");
        return Response.json({ received: true });
      }

      const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
      if (!orders.length) {
        console.error("Order not found:", orderId);
        return Response.json({ received: true });
      }

      const order = orders[0];

      if (order.payment_status === 'completed') {
        console.log("Order already completed, skipping:", orderNumber);
        return Response.json({ received: true });
      }

      await base44.asServiceRole.entities.Order.update(order.id, {
        payment_status: 'completed',
        stripe_payment_intent_id: session.payment_intent || ''
      });

      const occurrences = await base44.asServiceRole.entities.EventOccurrence.filter({ id: order.occurrence_id });
      const occurrence = occurrences[0];

      const tickets = await base44.asServiceRole.entities.Ticket.filter({ order_id: order.id });
      
      const ticketTypes = await base44.asServiceRole.entities.TicketType.filter({ occurrence_id: order.occurrence_id });
      const ticketTypeMap = {};
      for (const tt of ticketTypes) {
        ticketTypeMap[tt.id] = tt;
      }

      const quantityUpdates = {};
      for (const ticket of tickets) {
        const qrHash = await generateQrHash(ticket.id, ticket.occurrence_id);
        await base44.asServiceRole.entities.Ticket.update(ticket.id, { qr_code_hash: qrHash });
        ticket.qr_code_hash = qrHash;

        if (!quantityUpdates[ticket.ticket_type_id]) {
          quantityUpdates[ticket.ticket_type_id] = 0;
        }
        quantityUpdates[ticket.ticket_type_id]++;
      }

      for (const [ttId, count] of Object.entries(quantityUpdates)) {
        const tt = ticketTypeMap[ttId];
        if (tt) {
          await base44.asServiceRole.entities.TicketType.update(ttId, {
            quantity_sold: (tt.quantity_sold || 0) + count
          });
        }
      }

      if (occurrence) {
        await sendOrderReceiptEmail(base44, order, occurrence, tickets, ticketTypeMap);
        for (const ticket of tickets) {
          await sendTicketEmail(base44, ticket, occurrence, ticketTypeMap[ticket.ticket_type_id]);
        }
      }

      console.log("Order completed successfully:", orderNumber);
    }

    if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      if (orderId) {
        const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
        if (orders.length && orders[0].payment_status === 'pending') {
          await base44.asServiceRole.entities.Order.update(orders[0].id, {
            payment_status: 'failed'
          });
          const pendingTickets = await base44.asServiceRole.entities.Ticket.filter({ order_id: orderId });
          for (const t of pendingTickets) {
            await base44.asServiceRole.entities.Ticket.delete(t.id);
          }
          console.log("Order payment failed, cleaned up:", orderId);
        }
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return Response.json({ error: error.message }, { status: 400 });
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
    const venueText = occurrence.venue_details || 'Venue details will be provided closer to the event.';
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

  await resend.emails.send({
    from: 'Session Pass <noreply@session-pass.com>',
    to: order.buyer_email,
    subject: `Booking Confirmed — ${occurrence.name} | Order #${order.order_number}`,
    html: html
  });
}

async function sendTicketEmail(base44, ticket, occurrence, ticketType) {
  const isOnline = ticket.attendance_mode === 'online';
  const html = buildTicketEmailHtml(ticket, occurrence, ticketType);

  await resend.emails.send({
    from: 'Session Pass <noreply@session-pass.com>',
    to: ticket.attendee_email,
    subject: `Your ${isOnline ? 'Online' : 'In-Person'} Ticket — ${occurrence.name}`,
    html: html
  });
}