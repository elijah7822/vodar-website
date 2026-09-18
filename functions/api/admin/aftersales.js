import { jsonResponse, badRequest, cleanText } from '../../../lib/util.js';
import { requireAdmin } from '../../../lib/auth.js';
import { sendAfterSalesUpdate } from '../../../lib/email.js';

const TICKET_STATUSES = [
  'submitted', 'reviewing', 'approved', 'awaiting_return', 'return_received',
  'replacement_shipped', 'refunded', 'rejected', 'closed',
];
const REFUND_STATUSES = ['not_required', 'pending', 'approved', 'completed', 'rejected'];

async function authorize(request, env) {
  const auth = await requireAdmin(request, env);
  return auth.ok ? null : jsonResponse({ error: 'Unauthorized.' }, auth.reason === 'not-configured' ? 503 : 401);
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const denied = await authorize(request, env);
  if (denied) return denied;

  const { results } = await env.DB.prepare(
    `SELECT a.*, o.customer_name, o.email AS customer_email, o.total_amt,
            o.status AS order_status, o.payment_status
     FROM after_sales a JOIN orders o ON o.order_id = a.order_id
     ORDER BY a.created_at DESC LIMIT 500`
  ).all();
  const itemRows = (await env.DB.prepare(
    `SELECT asi.ticket_id, asi.product_id, asi.qty, p.name
     FROM after_sales_items asi LEFT JOIN products p ON p.id = asi.product_id
     ORDER BY asi.id`
  ).all()).results;
  const itemsByTicket = {};
  for (const item of itemRows) (itemsByTicket[item.ticket_id] ||= []).push(item);
  return jsonResponse({
    aftersales: results.map((ticket) => ({ ...ticket, items: itemsByTicket[ticket.id] || [] })),
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const denied = await authorize(request, env);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid request.'); }

  const id = Number(body.id);
  const status = cleanText(body.status);
  const resolution = cleanText(body.resolution);
  const internalNote = cleanText(body.internal_note);
  const refundStatus = cleanText(body.refund_status) || 'not_required';
  const refundReference = cleanText(body.refund_reference);
  const refundAmount = Number(body.refund_amount || 0);

  if (!Number.isInteger(id) || id < 1) return badRequest('Invalid ticket id.');
  if (!TICKET_STATUSES.includes(status)) return badRequest('Invalid ticket status.');
  if (!REFUND_STATUSES.includes(refundStatus)) return badRequest('Invalid refund status.');
  if (resolution.length > 2000 || internalNote.length > 4000 || refundReference.length > 200) {
    return badRequest('One or more fields are too long.');
  }

  const ticket = await env.DB.prepare(
    `SELECT a.*, o.email AS customer_email, o.total_amt
     FROM after_sales a JOIN orders o ON o.order_id = a.order_id WHERE a.id = ?`
  ).bind(id).first();
  if (!ticket) return jsonResponse({ error: 'Ticket not found.' }, 404);
  if (!Number.isInteger(refundAmount) || refundAmount < 0 || refundAmount > ticket.total_amt) {
    return badRequest('Refund amount must be a valid cent amount no greater than the order total.');
  }
  if (refundStatus === 'completed' && refundAmount < 1) {
    return badRequest('Enter the completed refund amount.');
  }
  if (status === 'refunded' && refundStatus !== 'completed') {
    return badRequest('A refunded ticket must include a completed refund record.');
  }
  if (refundStatus === 'completed' && !['refunded', 'closed'].includes(status)) {
    return badRequest('Set the ticket status to Refund completed or Closed.');
  }

  const refundedAt = refundStatus === 'completed'
    ? (ticket.refunded_at || new Date().toISOString())
    : null;
  await env.DB.prepare(
    `UPDATE after_sales
     SET status = ?, resolution = ?, internal_note = ?, refund_status = ?,
         refund_amount = ?, refund_reference = ?, refunded_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(status, resolution, internalNote, refundStatus, refundAmount, refundReference, refundedAt, id).run();

  const shouldNotify = ticket.status !== status || ticket.resolution !== resolution ||
    ticket.refund_status !== refundStatus || ticket.refund_amount !== refundAmount ||
    ticket.refund_reference !== refundReference;
  let mail = { skipped: true };
  if (shouldNotify) {
    mail = await sendAfterSalesUpdate(env, {
      ticketId: id,
      orderId: ticket.order_id,
      customerEmail: ticket.customer_email,
      status,
      resolution,
      refundStatus,
      refundAmount,
      refundReference,
    });
  }

  return jsonResponse({
    ok: true,
    email: shouldNotify ? (mail.ok ? 'sent' : mail.skipped ? 'skipped' : 'failed') : 'unchanged',
  });
}
