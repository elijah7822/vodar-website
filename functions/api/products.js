import { jsonResponse } from '../../lib/util.js';

export async function onRequestGet(context) {
  const { env } = context;
  const { results } = await env.DB.prepare(
    'SELECT id, name, description, price_amt FROM products WHERE active = 1 ORDER BY sort'
  ).all();
  return jsonResponse({ products: results });
}
