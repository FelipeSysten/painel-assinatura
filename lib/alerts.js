import QRCode from 'qrcode';
import { buildMessage } from '../public/core.js';
import { sendEmail, DEFAULT_EMAIL_TO } from './notify.js';

export async function deliver(state, sub, today, base) {
  // QR Code vai anexado no próprio e-mail (cid), assim aparece mesmo com imagens externas bloqueadas
  const attachments = sub.pixCode
    ? [{ filename: 'pix.png', content: await QRCode.toBuffer(sub.pixCode, { width: 360, margin: 2 }), cid: 'pixqr' }]
    : [];
  const msg = buildMessage(sub, today, { card: state.settings.card, panelUrl: base, qrUrl: sub.pixCode ? 'cid:pixqr' : '' });
  const to = state.settings.email || DEFAULT_EMAIL_TO;
  const email = await sendEmail({ to, subject: msg.subject, html: msg.html, text: msg.text, attachments });
  return { email, to };
}
