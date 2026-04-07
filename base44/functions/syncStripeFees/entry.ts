import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@17.4.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  // Get all paid orders that have a stripe payment intent
  const orders = await base44.asServiceRole.entities.Order.filter({
    payment_status: 'completed'
  });

  const toSync = orders.filter(o => o.stripe_payment_intent_id && o.total_amount > 0);

  const results = [];
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const order of toSync) {
    try {
      // Fetch the payment intent from Stripe
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
        expand: ['latest_charge.balance_transaction']
      });

      const bt = pi.latest_charge?.balance_transaction;
      if (!bt || typeof bt === 'string') {
        // Could not expand balance transaction
        skipped++;
        results.push({ order: order.order_number, status: 'skipped', reason: 'no balance transaction' });
        continue;
      }

      // Fee is in cents, convert to dollars
      const actualFee = bt.fee / 100;
      const estimatedFee = order.total_amount * 0.029 + 0.30;
      const difference = Math.abs(actualFee - estimatedFee);

      // Update order with actual fee
      await base44.asServiceRole.entities.Order.update(order.id, {
        stripe_fee: actualFee
      });

      synced++;
      results.push({
        order: order.order_number,
        amount: order.total_amount,
        estimated_fee: Math.round(estimatedFee * 100) / 100,
        actual_fee: actualFee,
        difference: Math.round(difference * 100) / 100,
        status: 'synced'
      });
    } catch (err) {
      errors++;
      results.push({ order: order.order_number, status: 'error', reason: err.message });
    }
  }

  // Calculate totals
  const totalEstimated = results.filter(r => r.status === 'synced').reduce((s, r) => s + r.estimated_fee, 0);
  const totalActual = results.filter(r => r.status === 'synced').reduce((s, r) => s + r.actual_fee, 0);

  return Response.json({
    synced,
    skipped,
    errors,
    total_estimated_fees: Math.round(totalEstimated * 100) / 100,
    total_actual_fees: Math.round(totalActual * 100) / 100,
    difference: Math.round((totalActual - totalEstimated) * 100) / 100,
    results
  });
});