import { sessionCookie } from '../../../lib/auth.js';

export async function onRequestPost(context) {
  const { request } = context;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': sessionCookie('', request, 0),
    },
  });
}
