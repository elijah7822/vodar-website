import { jsonResponse, badRequest, normalizeOrderId, cleanText } from '../../../lib/util.js';
import { requireAdmin } from '../../../lib/auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  const auth = await requireAdmin(request, env);
  if (!auth.ok) {
    return jsonResponse({ error: 'Unauthorized.' }, auth.reason === 'not-configured' ? 503 : 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request.');
  }

  const orderId = normalizeOrderId(body.order_id);
  if (!orderId) {
    return badRequest('Order number is required.');
  }

  const order = await env.DB.prepare(
    "SELECT order_id, status FROM orders WHERE order_id = ?"
  ).bind(orderId).first();
  if (!order) {
    return jsonResponse({ error: 'Order not found.' }, 404);
  }

  if (cleanText(body.action) === 'complete') {
    if (order.status !== 'shipped') {
      return badRequest('Only shipped orders can be completed.');
    }
    await env.DB.prepare("UPDATE orders SET status = 'completed' WHERE order_id = ?")
      .bind(orderId).run();
    return jsonResponse({ ok: true });
  }

  const carrier = cleanText(body.carrier);
  const trackingNo = cleanText(body.tracking_no);
  if (!carrier || !trackingNo) {
    return badRequest('Carrier and tracking number are required.');
  }
  if (order.status !== 'paid' && order.status !== 'shipped') {
    return badRequest('Only paid orders can be shipped.');
  }

  await env.DB.prepare(
    'INSERT INTO tracking (order_id, carrier, tracking_no, status) VALUES (?, ?, ?, ?)'
  ).bind(orderId, carrier, trackingNo, 'shipped').run();

  await env.DB.prepare(
    "UPDATE orders SET status = 'shipped' WHERE order_id = ?"
  ).bind(orderId).run();

  return jsonResponse({ ok: true });
}
