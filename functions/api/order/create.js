import { jsonResponse, badRequest, generateOrderId, normalizeEmail, cleanText, sha256hex } from '../../../lib/util.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request.');
  }

  const name = cleanText(body.name);
  const email = normalizeEmail(body.email);
  const address = cleanText(body.address);
  const city = cleanText(body.city);
  const country = cleanText(body.country);
  const zip = cleanText(body.zip);

  if (!name || !address || !city || !country) {
    return badRequest('Please complete all shipping information fields.');
  }
  if (!email || !email.includes('@') || email.length < 5) {
    return badRequest('Please provide a valid email address.');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return badRequest('Your cart is empty.');
  }

  const { results: products } = await env.DB.prepare(
    'SELECT id, price_amt, active FROM products'
  ).all();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  let total = 0;
  const lines = [];
  for (const item of body.items) {
    const product = byId[item && item.id];
    const qty = Number(item && item.qty);
    if (!product || product.active !== 1) {
      return badRequest('A selected product is no longer available.');
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
      return badRequest('Invalid quantity.');
    }
    total += product.price_amt * qty;
    lines.push({ id: product.id, qty, price: product.price_amt });
  }

  // Idempotency: same email + same product combination within 60s returns the existing order
  const idemKey = await sha256hex(
    email + '|' + lines.map((l) => `${l.id}x${l.qty}`).sort().join(',')
  );
  const existing = await env.DB.prepare(
    `SELECT order_id FROM orders
     WHERE idem_key = ? AND created_at >= datetime('now', '-60 seconds')
     ORDER BY created_at DESC LIMIT 1`
  ).bind(idemKey).first();
  if (existing) {
    return jsonResponse({ order: existing.order_id, duplicate: true });
  }

  const orderId = generateOrderId();
  await env.DB.prepare(
    `INSERT INTO orders (order_id, customer_name, email, address, city, country, zip, status, total_amt, payment_status, idem_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'unpaid', ?)`
  ).bind(orderId, name, email, address, city, country, zip, total, idemKey).run();

  for (const line of lines) {
    await env.DB.prepare(
      'INSERT INTO order_items (order_id, product_id, qty, unit_price) VALUES (?, ?, ?, ?)'
    ).bind(orderId, line.id, line.qty, line.price).run();
  }

  return jsonResponse({ order: orderId, total_amt: total });
}
