import { jsonResponse, normalizeOrderId, maskEmail } from '../../../lib/util.js';

export async function onRequestGet(context) {
  const { env, params } = context;
  const orderId = normalizeOrderId(params.id);

  const order = await env.DB.prepare(
    'SELECT order_id, status, total_amt, created_at, email FROM orders WHERE order_id = ?'
  ).bind(orderId).first();
  if (!order) {
    return jsonResponse({ error: 'Order not found. Please check your order number.' }, 404);
  }

  const items = await env.DB.prepare(
    `SELECT oi.product_id, oi.qty, oi.unit_price, p.name
     FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`
  ).bind(orderId).all();

  const tracking = await env.DB.prepare(
    'SELECT carrier, tracking_no, status, updated_at FROM tracking WHERE order_id = ? ORDER BY updated_at DESC'
  ).bind(orderId).all();

  const tickets = await env.DB.prepare(
    `SELECT id, type, subject, status, resolution, refund_status, refund_amount,
            refund_reference, refunded_at, created_at, updated_at
     FROM after_sales WHERE order_id = ? ORDER BY created_at DESC`
  ).bind(orderId).all();
  const ticketItems = await env.DB.prepare(
    `SELECT asi.ticket_id, asi.product_id, asi.qty, p.name
     FROM after_sales_items asi LEFT JOIN products p ON p.id = asi.product_id
     JOIN after_sales a ON a.id = asi.ticket_id
     WHERE a.order_id = ? ORDER BY asi.id`
  ).bind(orderId).all();
  const itemsByTicket = {};
  for (const item of ticketItems.results) (itemsByTicket[item.ticket_id] ||= []).push(item);

  // Desensitized: no address, no full email — only what the buyer needs to self-serve
  return jsonResponse({
    order: {
      order_id: order.order_id,
      status: order.status,
      total_amt: order.total_amt,
      created_at: order.created_at,
      email_hint: maskEmail(order.email),
      items: items.results,
      tracking: tracking.results,
      aftersales: tickets.results.map((ticket) => ({
        ...ticket,
        items: itemsByTicket[ticket.id] || [],
      })),
    },
  });
}
