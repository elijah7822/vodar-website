export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function badRequest(message) {
  return jsonResponse({ error: message }, 400);
}

export function generateOrderId() {
  const d = new Date();
  const ymd =
    String(d.getUTCFullYear()).slice(2) +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let rnd = '';
  for (const b of bytes) rnd += chars[b % chars.length];
  return `VOD-${ymd}-${rnd}`;
}

export function normalizeOrderId(id) {
  return String(id || '').trim().toUpperCase();
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function maskEmail(email) {
  const at = String(email).indexOf('@');
  if (at < 1) return '***';
  const local = String(email).slice(0, at);
  const domain = String(email).slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

export async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cleanText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
