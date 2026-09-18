import { maskEmail } from './util.js';

export async function sendOrderConfirmation(env, { to, orderId, totalCents }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:skipped] RESEND_API_KEY not set; would notify ${maskEmail(to)} for ${orderId}`);
    return { skipped: true };
  }
  const amount = (totalCents / 100).toFixed(2);
  const from = env.MAIL_FROM || 'VODAR <onboarding@resend.dev>';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1A1A2E;">
    <h2 style="color:#F0303F;margin-bottom:4px;">VODAR</h2>
    <p>Thank you for your order!</p>
    <p style="font-size:16px;">Your order number is
      <strong style="background:#FFF0F1;color:#C41A27;padding:2px 8px;border-radius:6px;">${orderId}</strong>
    </p>
    <p style="font-size:15px;">Total paid: <strong>$${amount} USD</strong></p>
    <p style="font-size:14px;color:#4A4A5A;">
      You can check your order status and tracking anytime at
      <a href="https://vodar.net/#track" style="color:#F0303F;">vodar.net</a> using this order number.
    </p>
    <p style="font-size:13px;color:#8A8A9A;margin-top:24px;">
      Questions? Use the contact form on our website. Please keep this email for reference.
    </p>
  </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Your VODAR order ${orderId}`,
        html,
      }),
    });
    if (!res.ok) {
      console.log(`[email:error] ${res.status} ${await res.text()}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.log(`[email:exception] ${err}`);
    return { ok: false };
  }
}
