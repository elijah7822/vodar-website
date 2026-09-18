import { maskEmail } from './util.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function typeLabel(type) {
  return ({
    cancel: 'Cancel order',
    return_refund: 'Return & refund',
    exchange: 'Exchange',
    defective: 'Damaged or defective item',
    other: 'Other issue',
  })[type] || type;
}

function statusLabel(status) {
  return ({
    submitted: 'Submitted',
    reviewing: 'Under review',
    approved: 'Approved',
    awaiting_return: 'Awaiting return',
    return_received: 'Return received',
    replacement_shipped: 'Replacement shipped',
    refunded: 'Refund completed',
    rejected: 'Not approved',
    closed: 'Closed',
  })[status] || status;
}

function itemLines(items = []) {
  if (!items.length) return '<li>Order-level request</li>';
  return items.map((item) =>
    `<li>${escapeHtml(item.name || item.product_id)} × ${Number(item.qty) || 0}</li>`
  ).join('');
}

async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:skipped] RESEND_API_KEY not set; recipient=${maskEmail(to)} subject=${subject}`);
    return { skipped: true };
  }
  const from = env.MAIL_FROM || 'VODAR <onboarding@resend.dev>';
  try {
    const body = { from, to: [to], subject, html };
    if (replyTo) body.reply_to = replyTo;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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

function shell(content) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1A1A2E;line-height:1.6;">
    <h2 style="color:#F0303F;margin-bottom:8px;">VODAR</h2>${content}
    <p style="font-size:13px;color:#8A8A9A;margin-top:24px;">Please keep this email for reference.</p>
  </div>`;
}

export async function sendOrderConfirmation(env, { to, orderId, totalCents }) {
  const amount = (totalCents / 100).toFixed(2);
  return sendEmail(env, {
    to,
    replyTo: env.SUPPORT_EMAIL || undefined,
    subject: `Your VODAR order ${orderId}`,
    html: shell(`
      <p>Thank you for your order!</p>
      <p style="font-size:16px;">Your order number is
        <strong style="background:#FFF0F1;color:#C41A27;padding:2px 8px;border-radius:6px;">${escapeHtml(orderId)}</strong>
      </p>
      <p style="font-size:15px;">Total paid: <strong>$${amount} USD</strong></p>
      <p><a href="https://vodar.net/#track" style="color:#F0303F;">Track your order</a> using this order number.</p>`),
  });
}

export async function sendAfterSalesReceived(env, ticket) {
  return sendEmail(env, {
    to: ticket.customerEmail,
    replyTo: env.SUPPORT_EMAIL || undefined,
    subject: `VODAR support request #${ticket.ticketId} received`,
    html: shell(`
      <p>We received your <strong>${escapeHtml(typeLabel(ticket.type))}</strong> request.</p>
      <p>Ticket: <strong>#${ticket.ticketId}</strong><br>Order: <strong>${escapeHtml(ticket.orderId)}</strong></p>
      <ul>${itemLines(ticket.items)}</ul>
      <p><strong>${escapeHtml(ticket.subject)}</strong><br>${escapeHtml(ticket.detail).replace(/\n/g, '<br>')}</p>
      <p>Our support team will review your request within 2 business days. Please do not ship anything until we send return instructions.</p>
      <p><a href="https://vodar.net/#track" style="color:#F0303F;">Check support status</a></p>`),
  });
}

export async function sendAdminAfterSalesNotification(env, ticket) {
  if (!env.SUPPORT_EMAIL) {
    console.log(`[email:skipped] SUPPORT_EMAIL not set; new ticket #${ticket.ticketId}`);
    return { skipped: true };
  }
  return sendEmail(env, {
    to: env.SUPPORT_EMAIL,
    replyTo: ticket.customerEmail,
    subject: `[VODAR Support] New ${typeLabel(ticket.type)} request #${ticket.ticketId}`,
    html: shell(`
      <p>A new after-sales request needs review.</p>
      <p>Ticket: <strong>#${ticket.ticketId}</strong><br>
         Order: <strong>${escapeHtml(ticket.orderId)}</strong><br>
         Customer: ${escapeHtml(ticket.customerName)} &lt;${escapeHtml(ticket.customerEmail)}&gt;<br>
         Order total: <strong>$${(ticket.totalCents / 100).toFixed(2)} USD</strong></p>
      <p>Type: <strong>${escapeHtml(typeLabel(ticket.type))}</strong></p>
      <ul>${itemLines(ticket.items)}</ul>
      <p><strong>${escapeHtml(ticket.subject)}</strong><br>${escapeHtml(ticket.detail).replace(/\n/g, '<br>')}</p>
      <p><a href="https://vodar.net/admin.html" style="color:#F0303F;">Open VODAR Admin</a></p>`),
  });
}

export async function sendAfterSalesUpdate(env, ticket) {
  const refund = ticket.refundStatus === 'completed'
    ? `<p>Refund amount: <strong>$${(ticket.refundAmount / 100).toFixed(2)} USD</strong>${ticket.refundReference ? `<br>Reference: ${escapeHtml(ticket.refundReference)}` : ''}</p>`
    : '';
  return sendEmail(env, {
    to: ticket.customerEmail,
    replyTo: env.SUPPORT_EMAIL || undefined,
    subject: `Update on VODAR support request #${ticket.ticketId}`,
    html: shell(`
      <p>Your support request has been updated.</p>
      <p>Ticket: <strong>#${ticket.ticketId}</strong><br>Order: <strong>${escapeHtml(ticket.orderId)}</strong><br>
         Status: <strong>${escapeHtml(statusLabel(ticket.status))}</strong></p>
      ${ticket.resolution ? `<p>${escapeHtml(ticket.resolution).replace(/\n/g, '<br>')}</p>` : ''}
      ${refund}
      <p><a href="https://vodar.net/#track" style="color:#F0303F;">View the latest status</a></p>`),
  });
}
