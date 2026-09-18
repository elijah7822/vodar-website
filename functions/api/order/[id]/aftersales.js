import { jsonResponse, badRequest, normalizeOrderId, normalizeEmail, cleanText } from '../../../../lib/util.js';

const TICKET_TYPES = ['return', 'exchange', 'other'];

export async function onRequestGet(context) {
  const { env, params } = context;
  const orderId = normalizeOrderId(params.id);

  const order = await env.DB.prepare('SELECT order_id FROM orders WHERE order_id = ?').bind(orderId).first();
  if (!order) {
    return jsonResponse({ error: 'Order not found.' }, 404);
  }
  const { results } = await env.DB.prepare(
    'SELECT id, type, subject, status, resolution, created_at FROM after_sales WHERE order_id = ? ORDER BY created_at DESC'
  ).bind(orderId).all();
  return jsonResponse({ aftersales: results });
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const orderId = normalizeOrderId(params.id);

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request.');
  }

  const order = await env.DB.prepare(
    'SELECT order_id, email FROM orders WHERE order_id = ?'
  ).bind(orderId).first();
  if (!order) {
    return jsonResponse({ error: 'Order not found.' }, 404);
  }

  // Second-factor check (#13): the order number alone must not be enough to open a ticket
  const providedEmail = normalizeEmail(body.email);
  if (!providedEmail || providedEmail !== order.email) {
    return jsonResponse(
      { error: 'This email does not match the order. Please use the email you ordered with.' },
      403
    );
  }

  const type = cleanText(body.type);
  const subject = cleanText(body.subject);
  const detail = cleanText(body.detail);
  if (!TICKET_TYPES.includes(type)) {
    return badRequest('Invalid request type.');
  }
  if (!subject || subject.length > 120) {
    return badRequest('Please provide a subject (max 120 characters).');
  }
  if (!detail || detail.length > 2000) {
    return badRequest('Please describe the issue (max 2000 characters).');
  }

  const { meta } = await env.DB.prepare(
    'INSERT INTO after_sales (order_id, type, subject, detail, contact) VALUES (?, ?, ?, ?, ?)'
  ).bind(orderId, type, subject, detail, providedEmail).run();

  return jsonResponse({ ok: true, id: meta.last_row_id });
}
