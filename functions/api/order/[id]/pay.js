import { jsonResponse, normalizeOrderId } from '../../../../lib/util.js';
import { sendOrderConfirmation } from '../../../../lib/email.js';

// Mock payment: marks a pending order as paid and triggers the confirmation email.
// When LianLian goes live this flow is replaced by the hosted-checkout redirect
// plus functions/api/payment/callback.js (which must verify the signature).
export async function onRequestPost(context) {
  const { env, params } = context;
  const orderId = normalizeOrderId(params.id);

  const order = await env.DB.prepare(
    'SELECT order_id, status, email, total_amt FROM orders WHERE order_id = ?'
  ).bind(orderId).first();
  if (!order) {
    return jsonResponse({ error: 'Order not found.' }, 404);
  }
  if (order.status !== 'pending') {
    return jsonResponse({ order: orderId, status: order.status, already: true });
  }

  await env.DB.prepare(
    `UPDATE orders SET status = 'paid', payment_status = 'paid_mock' WHERE order_id = ?`
  ).bind(orderId).run();

  await sendOrderConfirmation(env, {
    to: order.email,
    orderId,
    totalCents: order.total_amt,
  });

  return jsonResponse({ order: orderId, status: 'paid' });
}
