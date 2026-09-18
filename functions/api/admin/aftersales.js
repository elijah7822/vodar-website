import { jsonResponse, badRequest, cleanText } from '../../../lib/util.js';
import { requireAdmin } from '../../../lib/auth.js';

const TICKET_STATUSES = ['open', 'processing', 'resolved'];

export async function onRequestGet(context) {
  const { env, request } = context;

  const auth = await requireAdmin(request, env);
  if (!auth.ok) {
    return jsonResponse({ error: 'Unauthorized.' }, auth.reason === 'not-configured' ? 503 : 401);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM after_sales ORDER BY created_at DESC LIMIT 500'
  ).all();
  return jsonResponse({ aftersales: results });
}

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

  const id = Number(body.id);
  const status = cleanText(body.status);
  const resolution = cleanText(body.resolution);

  if (!Number.isInteger(id) || id < 1) {
    return badRequest('Invalid ticket id.');
  }
  if (!TICKET_STATUSES.includes(status)) {
    return badRequest('Invalid ticket status.');
  }

  const ticket = await env.DB.prepare('SELECT id FROM after_sales WHERE id = ?').bind(id).first();
  if (!ticket) {
    return jsonResponse({ error: 'Ticket not found.' }, 404);
  }

  await env.DB.prepare(
    'UPDATE after_sales SET status = ?, resolution = ? WHERE id = ?'
  ).bind(status, resolution, id).run();

  return jsonResponse({ ok: true });
}
