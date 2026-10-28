// Armazenamento: Postgres da Neon (plano gratuito, integração da Vercel Marketplace) via HTTP.
// Em desenvolvimento local, PAINEL_DEV_STORE aponta para um arquivo JSON.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { seedState } from './seed.js';

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const devFile = process.env.PAINEL_DEV_STORE;

const STATE_KEY = 'geomatch:painel:state';
const LOG_KEY = 'geomatch:painel:log';

export const hasStore = () => !!(devFile || dbUrl);

let sql;
let ready;
function db() {
  if (!sql) {
    sql = neon(dbUrl);
    // cria a tabela na primeira chamada; não precisa rodar migração
    ready = sql`CREATE TABLE IF NOT EXISTS painel_kv (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  }
  return ready.then(() => sql);
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
  const q = await db();
  const rows = await q`SELECT value FROM painel_kv WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

async function setJSON(key, value) {
  if (devFile) {
    const all = await devRead();
    all[key] = value;
    await mkdir(dirname(devFile), { recursive: true });
    await writeFile(devFile, JSON.stringify(all, null, 2));
    return;
  }
  const q = await db();
  await q`INSERT INTO painel_kv (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
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
