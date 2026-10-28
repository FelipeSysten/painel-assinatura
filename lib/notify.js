// Envio de alertas por e-mail via SMTP (Gmail, Brevo, Zoho, servidor próprio…).
import nodemailer from 'nodemailer';

export const DEFAULT_EMAIL_TO = 'Samueljim19@hotmail.com';

const env = process.env;

export function channelsStatus() {
  return {
    email: !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
    emailFrom: env.ALERT_EMAIL_FROM || env.SMTP_USER || null
  };
}

let transport;
function getTransport() {
  if (!transport) {
    const port = Number(env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000
    });
  }
  return transport;
}

export async function sendEmail({ to, subject, html, text, attachments }) {
  if (!channelsStatus().email) return { ok: false, skipped: 'SMTP_HOST / SMTP_USER / SMTP_PASS não configurados' };
  try {
    await getTransport().sendMail({
      from: env.ALERT_EMAIL_FROM || `Alertas GeoMatch <${env.SMTP_USER}>`,
      to: to || DEFAULT_EMAIL_TO,
      subject, html, text, attachments
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `SMTP: ${e.message}`.slice(0, 240) };
  }
}
