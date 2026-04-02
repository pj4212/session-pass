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

function generateOrderNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `UV-${date}-${rand}`;
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

    // Store attendee data on the order for later ticket creation (for paid orders)
    // We'll store it temporarily — the webhook will use it
    if (!isFree) {
      // Store attendee info as JSON in a temp approach — save to order metadata
      // We'll create tickets with pending data
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

      const baseUrl = origin_url || 'https://app.base44.com';
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

      // Update order with stripe session id
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

      // Generate QR hash
      const qrHash = await generateQrHash(ticket.id, occurrence.id);
      await base44.asServiceRole.entities.Ticket.update(ticket.id, { qr_code_hash: qrHash });
      ticket.qr_code_hash = qrHash;
      tickets.push(ticket);

      // Update quantity sold
      await base44.asServiceRole.entities.TicketType.update(tt.id, {
        quantity_sold: (tt.quantity_sold || 0) + 1
      });
    }

    // Send emails
    await sendOrderReceiptEmail(base44, order, occurrence, tickets, ticketTypeMap);
    for (const ticket of tickets) {
      await sendTicketEmail(base44, ticket, occurrence, ticketTypeMap[ticket.ticket_type_id]);
    }

    return Response.json({ 
      order_number: orderNumber,
      payment_required: false 
    });
  } catch (error) {
    console.error("createCheckout error:", error);
    return Response.json({ error: error.message }, { status: 500 });
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
    body: `Hi ${order.buyer_name},\n\nYour booking has been confirmed!\n\nOrder Number: ${order.order_number}\nEvent: ${occurrence.name}\nDate: ${occurrence.event_date}\nTotal: ${totalText}\n\nTickets:\n${ticketSummary}\n\nView your tickets: ${Deno.env.get("BASE44_APP_URL") || ''}/order/${order.order_number}\n\nThank you!`
  });
}

async function sendTicketEmail(base44, ticket, occurrence, ticketType) {
  let venueInfo = '';
  if (ticket.attendance_mode === 'online') {
    venueInfo = occurrence.zoom_link ? `\nJoin Online: ${occurrence.zoom_link}` : '\nOnline Event';
  } else {
    venueInfo = occurrence.venue_details ? `\nVenue: ${occurrence.venue_details}` : '\nIn-Person Event';
  }

  const qrPayload = JSON.stringify({ t: ticket.id, e: ticket.occurrence_id, h: ticket.qr_code_hash });

  await base44.asServiceRole.integrations.Core.SendEmail({
    to: ticket.attendee_email,
    subject: `Your ticket for ${occurrence.name}`,
    body: `Hi ${ticket.attendee_first_name},\n\nHere are your ticket details:\n\nEvent: ${occurrence.name}\nDate: ${occurrence.event_date}\nTicket Type: ${ticketType?.name || 'General'} (${ticket.attendance_mode === 'online' ? 'Online' : 'In-Person'})${venueInfo}\n\nTicket Reference: ${ticket.id}\nQR Code Data: ${qrPayload}\n\nPlease present your QR code at check-in.\n\nThank you!`
  });
}