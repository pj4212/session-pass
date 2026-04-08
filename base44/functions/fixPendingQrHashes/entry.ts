import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Find all tickets with pending/temp QR hashes
    const allTickets = await base44.asServiceRole.entities.Ticket.filter({
      ticket_status: 'active'
    });

    const broken = allTickets.filter(t => 
      !t.qr_code_hash || t.qr_code_hash === 'pending' || t.qr_code_hash === 'temp'
    );

    if (!broken.length) {
      return Response.json({ fixed: 0, message: 'No tickets with pending QR hashes found.' });
    }

    let fixed = 0;
    const errors = [];

    for (const ticket of broken) {
      try {
        const qrHash = await generateQrHash(ticket.id, ticket.occurrence_id);
        await base44.asServiceRole.entities.Ticket.update(ticket.id, { qr_code_hash: qrHash });
        fixed++;
        console.log(`Fixed QR hash for ticket ${ticket.id} (${ticket.attendee_first_name} ${ticket.attendee_last_name})`);
      } catch (err) {
        errors.push({ ticket_id: ticket.id, error: err.message });
        console.error(`Failed to fix ticket ${ticket.id}:`, err.message);
      }
    }

    return Response.json({ 
      fixed, 
      total_broken: broken.length,
      errors: errors.length ? errors : undefined,
      message: `Fixed ${fixed} of ${broken.length} tickets with pending QR hashes.`
    });
  } catch (error) {
    console.error("fixPendingQrHashes error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});