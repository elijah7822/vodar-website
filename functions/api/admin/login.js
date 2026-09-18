import { jsonResponse, badRequest } from '../../../lib/util.js';
import {
  verifyPassword, clientIp, checkLoginLock, recordLoginFail, clearLoginFails,
  makeSessionToken, sessionCookie,
} from '../../../lib/auth.js';

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.ADMIN_PASSWORD) {
    return jsonResponse({ error: 'Admin panel is not configured yet (missing ADMIN_PASSWORD secret).' }, 503);
  }

  const ip = clientIp(request);
  const lock = await checkLoginLock(env, ip);
  if (lock.locked) {
    return jsonResponse({ error: 'Too many failed attempts. Please try again in 15 minutes.' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request.');
  }

  const ok = await verifyPassword(body.password, env.ADMIN_PASSWORD);
  if (!ok) {
    const state = await recordLoginFail(env, ip);
    return jsonResponse(
      { error: state.locked ? 'Too many failed attempts. Locked for 15 minutes.' : 'Wrong password.' },
      state.locked ? 429 : 401
    );
  }

  await clearLoginFails(env, ip);
  const token = await makeSessionToken(env.ADMIN_PASSWORD);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': sessionCookie(token, request, 8 * 3600),
    },
  });
}
