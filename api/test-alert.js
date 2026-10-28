// Envia, na hora, o alerta de uma assinatura para os canais cadastrados (não registra no histórico).
import { todayISO } from '../public/core.js';
import { json, requirePanel, baseUrl } from '../lib/http.js';
import { hasStore, loadState } from '../lib/store.js';
import { deliver } from '../lib/alerts.js';

export async function POST(request) {
  const denied = requirePanel(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const state = await loadState();
  // Sem armazenamento no servidor (modo local) o navegador manda os próprios dados.
  if (!hasStore() && body.state && Array.isArray(body.state.subs)) Object.assign(state, { subs: body.state.subs, settings: body.state.settings });
  const sub = state.subs.find((s) => s.id === body.subId) || state.subs[0];
  if (!sub) return json({ error: 'Nenhuma assinatura cadastrada.' }, 400);
  const r = await deliver(state, sub, todayISO(), baseUrl(request));
  return json({ sub: sub.id, ...r });
}
