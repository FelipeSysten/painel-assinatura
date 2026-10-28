import { json, requirePanel } from '../lib/http.js';
import { hasStore, loadState, saveState, loadLog } from '../lib/store.js';
import { channelsStatus } from '../lib/notify.js';

export async function GET(request) {
  const denied = requirePanel(request);
  if (denied) return denied;
  const [state, log] = await Promise.all([loadState(), loadLog()]);
  return json({ state, log, storage: hasStore() ? 'server' : 'local', channels: channelsStatus() });
}

export async function PUT(request) {
  const denied = requirePanel(request);
  if (denied) return denied;
  if (!hasStore()) return json({ error: 'Armazenamento não configurado: conecte o Upstash Redis no projeto da Vercel.' }, 503);
  const body = await request.json().catch(() => null);
  const next = body && body.state;
  if (!next || !Array.isArray(next.subs) || typeof next.settings !== 'object') return json({ error: 'Dados inválidos.' }, 400);
  const current = await loadState();
  if ((next.rev ?? 0) !== (current.rev ?? 0)) return json({ error: 'Os dados mudaram em outro lugar.', state: current }, 409);
  const saved = { ...next, rev: (current.rev ?? 0) + 1 };
  await saveState(saved);
  return json({ state: saved });
}
