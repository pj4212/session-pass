import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.14.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

async function generateQrHash(ticketId, occurrenceId) {
  const salt = Deno.env.get("QR_SECRET_SALT");
  const data = new TextEncoder().encode(ticketId + occurrenceId + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12);
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

      // Look up the order
      const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
      if (!orders.length) {
        console.error("Order not found:", orderId);
        return Response.json({ received: true });
      }

      const order = orders[0];

      // Idempotency check
      if (order.payment_status === 'completed') {
        console.log("Order already completed, skipping:", orderNumber);
        return Response.json({ received: true });
      }

      // Update order payment status
      await base44.asServiceRole.entities.Order.update(order.id, {
        payment_status: 'completed',
        stripe_payment_intent_id: session.payment_intent || ''
      });

      // Get occurrence
      const occurrences = await base44.asServiceRole.entities.EventOccurrence.filter({ id: order.occurrence_id });
      const occurrence = occurrences[0];

      // Get tickets for this order (created during checkout with 'pending' hash)
      const tickets = await base44.asServiceRole.entities.Ticket.filter({ order_id: order.id });
      
      // Get ticket types
      const ticketTypes = await base44.asServiceRole.entities.TicketType.filter({ occurrence_id: order.occurrence_id });
      const ticketTypeMap = {};
      for (const tt of ticketTypes) {
        ticketTypeMap[tt.id] = tt;
      }

      // Generate QR codes and update quantity sold
      const quantityUpdates = {};
      for (const ticket of tickets) {
        const qrHash = await generateQrHash(ticket.id, ticket.occurrence_id);
        await base44.asServiceRole.entities.Ticket.update(ticket.id, { qr_code_hash: qrHash });
        ticket.qr_code_hash = qrHash;

        // Track quantity updates
        if (!quantityUpdates[ticket.ticket_type_id]) {
          quantityUpdates[ticket.ticket_type_id] = 0;
        }
        quantityUpdates[ticket.ticket_type_id]++;
      }

      // Update quantity sold on each ticket type
      for (const [ttId, count] of Object.entries(quantityUpdates)) {
        const tt = ticketTypeMap[ttId];
        if (tt) {
          await base44.asServiceRole.entities.TicketType.update(ttId, {
            quantity_sold: (tt.quantity_sold || 0) + count
          });
        }
      }

      // Send emails
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
          // Delete pending tickets
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

async function sendOrderReceiptEmail(base44, order, occurrence, tickets, ticketTypeMap) {
  const ticketSummary = tickets.map(t => {
    const tt = ticketTypeMap[t.ticket_type_id];
    return `- ${t.attendee_first_name} ${t.attendee_last_name}: ${tt?.name || 'Ticket'} (${t.attendance_mode === 'online' ? 'Online' : 'In-Person'})`;
  }).join('\n');

  const totalText = order.total_amount > 0 ? `$${order.total_amount.toFixed(2)} AUD` : 'Free';

  await base44.asServiceRole.integrations.Core.SendEmail({
    to: order.buyer_email,
    subject: `Your booking for ${occurrence.name} is confirmed`,
    body: `Hi ${order.buyer_name},\n\nYour booking has been confirmed!\n\nOrder Number: ${order.order_number}\nEvent: ${occurrence.name}\nDate: ${occurrence.event_date}\nTotal: ${totalText}\n\nTickets:\n${ticketSummary}\n\nThank you!`
  });
}

async function sendTicketEmail(base44, ticket, occurrence, ticketType) {
  let venueInfo = '';
  if (ticket.attendance_mode === 'online') {
    venueInfo = occurrence.zoom_link ? `\nJoin Online: ${occurrence.zoom_link}` : '\nOnline Event';
  } else {
    venueInfo = occurrence.venue_details ? `\nVenue: ${occurrence.venue_details}` : '\nIn-Person Event';
  }

  await base44.asServiceRole.integrations.Core.SendEmail({
    to: ticket.attendee_email,
    subject: `Your ticket for ${occurrence.name}`,
    body: `Hi ${ticket.attendee_first_name},\n\nHere are your ticket details:\n\nEvent: ${occurrence.name}\nDate: ${occurrence.event_date}\nTicket Type: ${ticketType?.name || 'General'} (${ticket.attendance_mode === 'online' ? 'Online' : 'In-Person'})${venueInfo}\n\nTicket Reference: ${ticket.id}\n\nPlease present your QR code at check-in.\n\nThank you!`
  });
}