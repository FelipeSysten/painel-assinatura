// Webhook do Twilio: responder "PAGO" (ou "PAGO RENDER") no WhatsApp marca a assinatura como paga.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { analyze, applyPayment, sortByUrgency, todayISO, fmtDate } from '../public/core.js';
import { hasStore, loadState, saveState } from '../lib/store.js';

const twiml = (text) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text.replace(/[<&>]/g, '')}</Message></Response>`, {
    headers: { 'content-type': 'text/xml; charset=utf-8' }
  });

function validSignature(request, params) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const sig = request.headers.get('x-twilio-signature') || '';
  if (!authToken || !sig) return false;
  const url = process.env.PAINEL_URL ? `${process.env.PAINEL_URL.replace(/\/$/, '')}/api/whatsapp` : request.url;
  const data = url + [...params.keys()].sort().map((k) => k + params.get(k)).join('');
  const expected = createHmac('sha1', authToken).update(data).digest('base64');
  return expected.length === sig.length && timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export async function POST(request) {
  const params = new URLSearchParams(await request.text());
  if (!validSignature(request, params)) return new Response('Assinatura inválida', { status: 403 });
  const state = await loadState();
  const from = (params.get('From') || '').replace(/\D/g, '');
  if (!from || from !== String(state.settings.whatsapp || '').replace(/\D/g, '')) return twiml('Número não autorizado.');

  const body = (params.get('Body') || '').trim().toLowerCase();
  if (!/^pago\b/.test(body)) return twiml('Responda PAGO (ou PAGO e o nome da assinatura) depois de pagar o Pix.');
  if (!hasStore()) return twiml('Armazenamento não configurado no painel.');

  const today = todayISO();
  const name = body.replace(/^pago\s*/, '');
  const pending = sortByUrgency(state.subs, today).filter((s) => analyze(s, today).state !== 'ok');
  const target = name ? state.subs.find((s) => s.name.toLowerCase().includes(name) || s.id === name) : pending[0];
  if (!target) return twiml(name ? `Não achei a assinatura "${name}".` : 'Nenhuma assinatura pendente agora.');

  const next = applyPayment(state, target.id, today, 'whatsapp');
  await saveState({ ...next, rev: (state.rev ?? 0) + 1 });
  const after = analyze(next.subs.find((s) => s.id === target.id), today);
  return twiml(`Registrado. Os alertas de ${target.name} param até o próximo vencimento (${fmtDate(after.due)}).`);
}
