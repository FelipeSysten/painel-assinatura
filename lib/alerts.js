import { buildMessage } from '../public/core.js';
import { sendEmail, sendWhatsApp, channelsStatus } from './notify.js';

export async function deliver(state, sub, today, base) {
  const qrUrl = sub.pixCode ? `${base}/api/qr?code=${encodeURIComponent(sub.pixCode)}` : '';
  const msg = buildMessage(sub, today, { card: state.settings.card, panelUrl: base, qrUrl, canReply: channelsStatus().canReply });
  const [whatsapp, email] = await Promise.all([
    sendWhatsApp({ to: state.settings.whatsapp, text: msg.whatsapp, mediaUrl: qrUrl }).catch((e) => ({ ok: false, error: e.message })),
    sendEmail({ to: state.settings.email, subject: msg.subject, html: msg.html, text: msg.text }).catch((e) => ({ ok: false, error: e.message }))
  ]);
  return { whatsapp, email };
}
