import { sha256hex } from './util.js';

const COOKIE_NAME = 'vodar_admin';
const SESSION_TTL_MS = 8 * 3600 * 1000;

async function hmacHex(keyStr, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(keyStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makeSessionToken(password) {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = await hmacHex(password, `admin-session:${exp}`);
  return `${exp}.${sig}`;
}

export async function verifySession(request, password) {
  if (!password) return false;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)vodar_admin=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expect = await hmacHex(password, `admin-session:${exp}`);
  return constantTimeEqual(sig, expect);
}

export async function requireAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return { ok: false, reason: 'not-configured' };
  const ok = await verifySession(request, env.ADMIN_PASSWORD);
  return ok ? { ok: true } : { ok: false, reason: 'unauthorized' };
}

export async function verifyPassword(provided, actual) {
  const a = await sha256hex(String(provided));
  const b = await sha256hex(actual);
  return constantTimeEqual(a, b);
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || '127.0.0.1';
}

export async function checkLoginLock(env, ip) {
  const row = await env.DB.prepare(
    `SELECT fails, (locked_until IS NOT NULL AND locked_until > datetime('now')) AS is_locked
     FROM login_attempts WHERE ip = ?`
  ).bind(ip).first();
  return { locked: !!(row && row.is_locked), fails: row ? row.fails : 0 };
}

export async function recordLoginFail(env, ip) {
  const fails = ((await env.DB.prepare('SELECT fails FROM login_attempts WHERE ip = ?').bind(ip).first())?.fails || 0) + 1;
  const locked = fails >= 5;
  await env.DB.prepare(
    `INSERT INTO login_attempts (ip, fails, locked_until) VALUES (?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until, updated_at = datetime('now')`
  ).bind(ip, fails, locked ? `datetime('now', '+15 minutes')` : null).run();
  return { fails, locked };
}

export async function clearLoginFails(env, ip) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
}

export function sessionCookie(token, request, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
