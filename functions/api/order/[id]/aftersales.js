import { jsonResponse, badRequest, normalizeOrderId, normalizeEmail, cleanText } from '../../../../lib/util.js';
import { sendAfterSalesReceived, sendAdminAfterSalesNotification } from '../../../../lib/email.js';

const TICKET_TYPES = ['cancel', 'return_refund', 'exchange', 'defective', 'other'];

export async function onRequestGet(context) {
  const { env, params } = context;
  const orderId = normalizeOrderId(params.id);

  const order = await env.DB.prepare('SELECT order_id FROM orders WHERE order_id = ?').bind(orderId).first();
  if (!order) return jsonResponse({ error: 'Order not found.' }, 404);

  const { results } = await env.DB.prepare(
    `SELECT id, type, subject, status, resolution, refund_status, refund_amount,
            refund_reference, refunded_at, created_at, updated_at
     FROM after_sales WHERE order_id = ? ORDER BY created_at DESC`
  ).bind(orderId).all();
  const itemRows = await env.DB.prepare(
    `SELECT asi.ticket_id, asi.product_id, asi.qty, p.name
     FROM after_sales_items asi LEFT JOIN products p ON p.id = asi.product_id
     JOIN after_sales a ON a.id = asi.ticket_id
     WHERE a.order_id = ? ORDER BY asi.id`
  ).bind(orderId).all();
  const itemsByTicket = {};
  for (const item of itemRows.results) (itemsByTicket[item.ticket_id] ||= []).push(item);
  return jsonResponse({
    aftersales: results.map((ticket) => ({ ...ticket, items: itemsByTicket[ticket.id] || [] })),
  });
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const orderId = normalizeOrderId(params.id);

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid request.'); }

  const order = await env.DB.prepare(
    'SELECT order_id, customer_name, email, total_amt, status, payment_status FROM orders WHERE order_id = ?'
  ).bind(orderId).first();
  if (!order) return jsonResponse({ error: 'Order not found.' }, 404);

  const providedEmail = normalizeEmail(body.email);
  if (!providedEmail || providedEmail !== order.email) {
    return jsonResponse({ error: 'This email does not match the order. Please use the email you ordered with.' }, 403);
  }

  const type = cleanText(body.type);
  const subject = cleanText(body.subject);
  const detail = cleanText(body.detail);
  if (!TICKET_TYPES.includes(type)) return badRequest('Invalid request type.');
  if (!subject || subject.length > 120) return badRequest('Please provide a subject (max 120 characters).');
  if (!detail || detail.length > 2000) return badRequest('Please describe the issue (max 2000 characters).');
  if (type !== 'cancel' && order.payment_status === 'unpaid') {
    return badRequest('This order has not been paid. Only cancellation requests are available.');
  }

  const requestedItems = Array.isArray(body.items) ? body.items : [];
  if (!requestedItems.length) return badRequest('Please select at least one item.');
  const orderItems = (await env.DB.prepare(
    `SELECT oi.product_id, oi.qty, p.name FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
  ).bind(orderId).all()).results;
  const owned = new Map(orderItems.map((item) => [item.product_id, item]));
  const selected = [];
  const seen = new Set();
  for (const raw of requestedItems) {
    const productId = cleanText(raw.product_id || raw.id);
    const qty = Number(raw.qty);
    const source = owned.get(productId);
    if (!source || seen.has(productId) || !Number.isInteger(qty) || qty < 1 || qty > source.qty) {
      return badRequest('One or more selected items are invalid.');
    }
    seen.add(productId);
    selected.push({ product_id: productId, name: source.name || productId, qty });
  }

  const duplicate = await env.DB.prepare(
    `SELECT id FROM after_sales
     WHERE order_id = ? AND type = ? AND subject = ? AND detail = ?
       AND created_at >= datetime('now', '-5 minutes')
     ORDER BY created_at DESC LIMIT 1`
  ).bind(orderId, type, subject, detail).first();
  if (duplicate) return jsonResponse({ ok: true, id: duplicate.id, duplicate: true, email: { customer: 'unchanged', admin: 'unchanged' } });

  const { meta } = await env.DB.prepare(
    `INSERT INTO after_sales
       (order_id, type, subject, detail, contact, status, updated_at)
     VALUES (?, ?, ?, ?, ?, 'submitted', datetime('now'))`
  ).bind(orderId, type, subject, detail, providedEmail).run();
  const ticketId = meta.last_row_id;
  await env.DB.batch(selected.map((item) => env.DB.prepare(
    'INSERT INTO after_sales_items (ticket_id, product_id, qty) VALUES (?, ?, ?)'
  ).bind(ticketId, item.product_id, item.qty)));

  const ticket = {
    ticketId, orderId, type, subject, detail, items: selected,
    customerEmail: order.email, customerName: order.customer_name, totalCents: order.total_amt,
  };
  const [customerMail, adminMail] = await Promise.all([
    sendAfterSalesReceived(env, ticket),
    sendAdminAfterSalesNotification(env, ticket),
  ]);

  return jsonResponse({
    ok: true,
    id: ticketId,
    email: {
      customer: customerMail.ok ? 'sent' : customerMail.skipped ? 'skipped' : 'failed',
      admin: adminMail.ok ? 'sent' : adminMail.skipped ? 'skipped' : 'failed',
    },
  });
}
