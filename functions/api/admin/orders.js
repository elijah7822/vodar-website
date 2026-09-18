import { jsonResponse } from '../../../lib/util.js';
import { requireAdmin } from '../../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const auth = await requireAdmin(request, env);
  if (!auth.ok) {
    return jsonResponse({ error: 'Unauthorized.' }, auth.reason === 'not-configured' ? 503 : 401);
  }

  const orders = (
    await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500').all()
  ).results;
  const items = (
    await env.DB.prepare('SELECT order_id, product_id, qty, unit_price FROM order_items').all()
  ).results;
  const tracking = (
    await env.DB.prepare('SELECT order_id, carrier, tracking_no, status, updated_at FROM tracking ORDER BY updated_at DESC').all()
  ).results;
  const tickets = (
    await env.DB.prepare('SELECT order_id, COUNT(*) AS n FROM after_sales GROUP BY order_id').all()
  ).results;

  const itemsByOrder = {};
  for (const it of items) (itemsByOrder[it.order_id] ||= []).push(it);
  const trackingByOrder = {};
  for (const t of tracking) (trackingByOrder[t.order_id] ||= []).push(t);
  const ticketCount = {};
  for (const t of tickets) ticketCount[t.order_id] = t.n;

  return jsonResponse({
    orders: orders.map((o) => ({
      ...o,
      items: itemsByOrder[o.order_id] || [],
      tracking: trackingByOrder[o.order_id] || [],
      aftersales_count: ticketCount[o.order_id] || 0,
    })),
  });
}
