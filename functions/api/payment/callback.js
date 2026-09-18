// Reserved endpoint for the real LianLian (连连) payment callback.
// HARD RULE (#14): never trust this request until the signature has been verified
// with LIANLIAN_SIGN_KEY. Signature verification is implemented together with the
// live LianLian integration (per design doc section 7).
export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.LIANLIAN_SIGN_KEY || !env.LIANLIAN_API_KEY) {
    return new Response('Payment integration not configured.', { status: 503 });
  }

  // TODO(v2-live-payments):
  //   1. verify signature over the raw body using LIANLIAN_SIGN_KEY
  //   2. match merchant order id + verify amount
  //   3. on success: UPDATE orders SET status='paid', payment_status='paid_lianlian'
  return new Response('Not implemented until signature verification is in place.', { status: 501 });
}

export async function onRequestGet() {
  return new Response('Method not allowed.', { status: 405 });
}
