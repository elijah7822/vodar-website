import { jsonResponse, badRequest } from '../../../lib/util.js';
import { requireAdmin } from '../../../lib/auth.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const auth = await requireAdmin(request, env);
  if (!auth.ok) {
    return jsonResponse({ error: 'Unauthorized.' }, auth.reason === 'not-configured' ? 503 : 401);
  }

  const { results } = await env.DB.prepare(
    'SELECT id, name, description, price_amt, active, sort FROM products ORDER BY sort'
  ).all();
  return jsonResponse({ products: results });
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

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return badRequest('Product id is required.');

  const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(id).first();
  if (!product) {
    return jsonResponse({ error: 'Product not found.' }, 404);
  }

  const active = body.active === undefined ? undefined : (body.active ? 1 : 0);
  const priceAmt =
    body.price_amt === undefined
      ? undefined
      : (Number.isInteger(body.price_amt) && body.price_amt > 0 && body.price_amt < 10_000_000
        ? body.price_amt
        : null);

  if (active === undefined && priceAmt === undefined) {
    return badRequest('Nothing to update.');
  }
  if (priceAmt === null) {
    return badRequest('Invalid price.');
  }

  if (active !== undefined && priceAmt !== undefined) {
    await env.DB.prepare('UPDATE products SET active = ?, price_amt = ? WHERE id = ?').bind(active, priceAmt, id).run();
  } else if (active !== undefined) {
    await env.DB.prepare('UPDATE products SET active = ? WHERE id = ?').bind(active, id).run();
  } else {
    await env.DB.prepare('UPDATE products SET price_amt = ? WHERE id = ?').bind(priceAmt, id).run();
  }

  return jsonResponse({ ok: true });
}
