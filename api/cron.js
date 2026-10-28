// Chamado pela Vercel Cron às 12:00 UTC (9h em São Paulo) e 21:00 UTC (18h, reforço do D-1).
// Também pode ser disparado pelo painel (POST) para rodar na hora.
import { alertsDueNow, todayISO, hourBR } from '../public/core.js';
import { json, requirePanel, isCron, baseUrl } from '../lib/http.js';
import { hasStore, loadState, loadLog, saveLog } from '../lib/store.js';
import { deliver } from '../lib/alerts.js';

async function run(request) {
  const now = new Date();
  const today = todayISO(now);
  const slot = new URL(request.url).searchParams.get('slot') || (hourBR(now) >= 15 ? 'tarde' : 'manha');
  const state = await loadState();
  const log = await loadLog();
  const base = baseUrl(request);
  const results = [];
  for (const { sub, entry } of alertsDueNow(state, today, slot)) {
    if (log[entry.key]) {
      results.push({ sub: sub.id, tag: entry.tag, skipped: 'já enviado' });
      continue;
    }
    const r = await deliver(state, sub, today, base);
    if (r.email.ok) log[entry.key] = { at: now.toISOString(), email: true, to: r.to };
    results.push({ sub: sub.id, tag: entry.tag, ...r });
  }
  if (hasStore()) await saveLog(log);
  return json({ today, slot, sent: results.filter((r) => r.email?.ok).length, results });
}

export async function GET(request) {
  if (!isCron(request)) return json({ error: 'Não autorizado.' }, 401);
  return run(request);
}

export async function POST(request) {
  const denied = requirePanel(request);
  if (denied) return denied;
  return run(request);
}
