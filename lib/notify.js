// Envio de alertas. E-mail via Resend; WhatsApp via CallMeBot (grátis, para o próprio número) ou Twilio.

const digits = (s) => String(s || '').replace(/\D/g, '');

export function channelsStatus() {
  const wa = (process.env.WHATSAPP_PROVIDER || '').toLowerCase();
  return {
    email: !!(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM),
    emailFrom: process.env.ALERT_EMAIL_FROM || null,
    whatsapp: wa === 'callmebot' ? !!process.env.CALLMEBOT_APIKEY
      : wa === 'twilio' ? !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM)
      : false,
    whatsappProvider: wa || null,
    canReply: wa === 'twilio'
  };
}

export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { ok: false, skipped: 'sem e-mail cadastrado' };
  if (!channelsStatus().email) return { ok: false, skipped: 'RESEND_API_KEY / ALERT_EMAIL_FROM não configurados' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.ALERT_EMAIL_FROM, to: [to], subject, html, text })
  });
  if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { ok: true };
}

export async function sendWhatsApp({ to, text, mediaUrl }) {
  const phone = digits(to);
  if (!phone) return { ok: false, skipped: 'sem WhatsApp cadastrado' };
  const st = channelsStatus();
  if (!st.whatsapp) return { ok: false, skipped: 'WHATSAPP_PROVIDER não configurado' };

  if (st.whatsappProvider === 'callmebot') {
    const u = new URL('https://api.callmebot.com/whatsapp.php');
    u.searchParams.set('phone', phone);
    u.searchParams.set('text', text);
    u.searchParams.set('apikey', process.env.CALLMEBOT_APIKEY);
    const r = await fetch(u);
    const body = await r.text();
    if (!r.ok || /error/i.test(body.slice(0, 300))) return { ok: false, error: `CallMeBot ${r.status}: ${body.replace(/<[^>]+>/g, ' ').slice(0, 200)}` };
    return { ok: true };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const form = new URLSearchParams({ From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`, To: `whatsapp:+${phone}`, Body: text });
  if (mediaUrl) form.set('MediaUrl', mediaUrl);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64') },
    body: form
  });
  if (!r.ok) return { ok: false, error: `Twilio ${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { ok: true };
}
