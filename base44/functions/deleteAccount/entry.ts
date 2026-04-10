import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete user's tickets
    const tickets = await base44.asServiceRole.entities.Ticket.filter({ attendee_email: user.email });
    for (const ticket of tickets) {
      await base44.asServiceRole.entities.Ticket.delete(ticket.id);
    }

    // Delete user's orders
    const orders = await base44.asServiceRole.entities.Order.filter({ buyer_email: user.email });
    for (const order of orders) {
      await base44.asServiceRole.entities.Order.delete(order.id);
    }

    // Delete check-in logs by this user
    const checkInLogs = await base44.asServiceRole.entities.CheckInLog.filter({ performed_by: user.id });
    for (const log of checkInLogs) {
      await base44.asServiceRole.entities.CheckInLog.delete(log.id);
    }

    // Delete scanner assignments
    const assignments = await base44.asServiceRole.entities.ScannerAssignment.filter({ user_id: user.id });
    for (const a of assignments) {
      await base44.asServiceRole.entities.ScannerAssignment.delete(a.id);
    }

    // Delete the user record itself
    await base44.asServiceRole.entities.User.delete(user.id);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});