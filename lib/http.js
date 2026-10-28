import { createHash, timingSafeEqual } from 'node:crypto';

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const digest = (s) => createHash('sha256').update(String(s)).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));

function bearer(request) {
  const h = request.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

// Retorna uma Response de erro, ou null se a senha do painel estiver correta.
export function requirePanel(request) {
  const senha = process.env.PAINEL_SENHA;
  if (!senha) return json({ error: 'Defina a variável de ambiente PAINEL_SENHA na Vercel.' }, 500);
  if (!same(bearer(request), senha)) return json({ error: 'Senha incorreta.' }, 401);
  return null;
}

export function isCron(request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && same(bearer(request), secret);
}

export function baseUrl(request) {
  if (process.env.PAINEL_URL) return process.env.PAINEL_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(request.url).origin;
}
