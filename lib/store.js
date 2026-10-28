// Armazenamento: Upstash Redis (integração da Vercel Marketplace) via REST.
// Em desenvolvimento local, PAINEL_DEV_STORE aponta para um arquivo JSON.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { seedState } from './seed.js';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const devFile = process.env.PAINEL_DEV_STORE;

const STATE_KEY = 'geomatch:painel:state';
const LOG_KEY = 'geomatch:painel:log';

export const hasStore = () => !!(devFile || (url && token));

async function redis(...args) {
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(args) });
  const j = await r.json();
  if (j.error) throw new Error(`Redis: ${j.error}`);
  return j.result;
}

async function devRead() {
  try {
    return JSON.parse(await readFile(devFile, 'utf8'));
  } catch {
    return {};
  }
}

async function getJSON(key) {
  if (devFile) return (await devRead())[key] ?? null;
  const v = await redis('GET', key);
  return v ? JSON.parse(v) : null;
}

async function setJSON(key, value) {
  if (devFile) {
    const all = await devRead();
    all[key] = value;
    await mkdir(dirname(devFile), { recursive: true });
    await writeFile(devFile, JSON.stringify(all, null, 2));
    return;
  }
  await redis('SET', key, JSON.stringify(value));
}

export async function loadState() {
  if (!hasStore()) return seedState();
  return (await getJSON(STATE_KEY)) || seedState();
}

export async function saveState(state) {
  await setJSON(STATE_KEY, state);
}

export async function loadLog() {
  if (!hasStore()) return {};
  return (await getJSON(LOG_KEY)) || {};
}

export async function saveLog(log) {
  // guarda só os últimos 120 dias
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString();
  const pruned = Object.fromEntries(Object.entries(log).filter(([, v]) => v.at >= cutoff));
  await setJSON(LOG_KEY, pruned);
}
