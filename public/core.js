// Lógica compartilhada entre o navegador e as funções da Vercel (sem DOM, sem dependências).

export const TZ = 'America/Sao_Paulo';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ---------- datas (sempre no fuso de São Paulo, como strings YYYY-MM-DD) ----------

export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function hourBR(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(now));
}

const toUTC = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

export const addDays = (iso, n) => new Date(toUTC(iso) + n * 86400000).toISOString().slice(0, 10);

export function addMonths(cycle, n) {
  let [y, m] = cycle.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  y = Math.floor(idx / 12);
  m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function dueDate(cycle, dueDay) {
  const [y, m] = cycle.split('-').map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${cycle}-${String(Math.min(dueDay, dim)).padStart(2, '0')}`;
}

export function fmtDate(iso, withYear = false) {
  const [y, m, d] = iso.split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function fmtCycle(cycle) {
  const [y, m] = cycle.split('-').map(Number);
  return `${MESES[m - 1]}/${y}`;
}

export function fmtLongDate(iso) {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(toUTC(iso)));
}

export const fmtBRL = (cents) => 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function parseBRL(text) {
  const clean = String(text).replace(/[^\d,.-]/g, '');
  if (!clean) return NaN;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  return Math.round(Number(normalized) * 100);
}

export function inDaysLabel(n) {
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  return `em ${n} dias`;
}

// ---------- status de cada assinatura ----------

// sub.paidThrough = último ciclo pago ("YYYY-MM"). O próximo ciclo vence em dueDay do mês seguinte.
export function analyze(sub, today) {
  const next = addMonths(sub.paidThrough, 1);
  const due = dueDate(next, sub.dueDay);
  const diff = daysBetween(today, due);
  if (diff < 0) {
    const openCycles = [];
    let c = next;
    while (dueDate(c, sub.dueDay) <= today) {
      openCycles.push(c);
      c = addMonths(c, 1);
    }
    const upcomingDue = dueDate(c, sub.dueDay);
    return {
      state: 'late', cycle: next, due, lateDays: -diff, openCycles,
      // overdueOverride: total informado pelo fornecedor, quando difere da soma das mensalidades
      overdue: sub.overdueOverride ?? openCycles.length * sub.amount, overdueManual: sub.overdueOverride != null,
      toPay: sub.overdueOverride ?? openCycles.length * sub.amount, payThrough: openCycles[openCycles.length - 1],
      upcomingCycle: c, upcomingDue, daysToUpcoming: daysBetween(today, upcomingDue)
    };
  }
  return {
    state: diff <= 7 ? 'soon' : 'ok', cycle: next, due, diff, openCycles: [], overdue: 0, overdueManual: false, toPay: sub.amount, payThrough: next,
    upcomingCycle: next, upcomingDue: due, daysToUpcoming: diff
  };
}

export function statusLabel(a) {
  if (a.state === 'late') return 'Em atraso';
  if (a.state === 'soon') return a.diff === 0 ? 'Vence hoje' : a.diff === 1 ? 'Vence amanhã' : `Vence em ${a.diff} dias`;
  return 'Em dia';
}

export function dueLine(sub, a) {
  const base = `Vence todo dia ${String(sub.dueDay).padStart(2, '0')}`;
  if (a.state === 'late') {
    const n = a.openCycles.length;
    return `${base} · em atraso desde ${fmtDate(a.due, true)}` + (n > 1 ? ` · ${n} mensalidades em aberto` : '');
  }
  return `${base} · próximo ${fmtDate(a.due)} (${inDaysLabel(a.diff)})`;
}

export function sortByUrgency(subs, today) {
  const rank = (s) => {
    const a = analyze(s, today);
    return a.state === 'late' ? -100000 - a.lateDays : a.diff;
  };
  return [...subs].sort((x, y) => rank(x) - rank(y));
}

export function summary(subs, today) {
  const monthly = subs.reduce((t, s) => t + s.amount, 0);
  let overdue = 0;
  const lateSubs = [];
  let nextDue = null;
  for (const s of subs) {
    const a = analyze(s, today);
    if (a.state === 'late') {
      overdue += a.overdue;
      lateSubs.push({ sub: s, a });
    }
    if (!nextDue || a.upcomingDue < nextDue) nextDue = a.upcomingDue;
  }
  const nextSubs = subs.filter((s) => analyze(s, today).upcomingDue === nextDue);
  const limit = addDays(today, 30);
  let next30 = 0;
  const next30Subs = new Set();
  for (const s of subs) {
    let c = analyze(s, today).upcomingCycle;
    while (dueDate(c, s.dueDay) <= limit) {
      next30 += s.amount;
      next30Subs.add(s.name);
      c = addMonths(c, 1);
    }
  }
  return {
    monthly, overdue, lateSubs, nextDue, nextSubs,
    nextAmount: nextSubs.reduce((t, s) => t + s.amount, 0),
    next30, next30Subs: [...next30Subs]
  };
}

// ---------- pagamentos ----------

export function applyPayment(state, subId, today, source = 'painel') {
  const sub = state.subs.find((s) => s.id === subId);
  if (!sub) return state;
  const a = analyze(sub, today);
  const entry = { subId, from: sub.paidThrough, fromOverride: sub.overdueOverride ?? null, to: a.payThrough, at: new Date().toISOString(), source, amount: a.toPay };
  return {
    ...state,
    subs: state.subs.map((s) => (s.id === subId ? { ...s, paidThrough: a.payThrough, overdueOverride: null } : s)),
    history: [entry, ...(state.history || [])].slice(0, 200)
  };
}

export function lastPayment(state, subId) {
  return (state.history || []).find((h) => h.subId === subId) || null;
}

export function undoPayment(state, subId) {
  const h = lastPayment(state, subId);
  if (!h) return state;
  const history = [...state.history];
  history.splice(history.indexOf(h), 1);
  return { ...state, subs: state.subs.map((s) => (s.id === subId ? { ...s, paidThrough: h.from, overdueOverride: h.fromOverride ?? null } : s)), history };
}

// ---------- agenda de alertas ----------

const TAG = { 7: 'D-7', 3: 'D-3', 1: 'D-1', 0: 'DIA' };

// Lista de alertas do ciclo atual. Cada item tem uma chave única usada para registrar o envio.
export function alertSchedule(sub, today, settings) {
  const a = analyze(sub, today);
  const out = [];
  const key = (tag, date, slot) => `${sub.id}:${a.cycle}:${tag}:${date}:${slot}`;
  if (a.state === 'late') {
    if (settings.atrasoDiario !== false) {
      out.push({ key: key('ATRASO', today, 'manha'), tag: 'ATRASO', kind: 'late', date: today, slot: 'manha', recurring: true, text: 'Todo dia, 9h · WhatsApp + e-mail até marcar como pago' });
    }
    out.push({ key: null, tag: 'DIA', kind: 'info', date: a.upcomingDue, slot: 'manha', text: `Vence mais uma mensalidade (${fmtCycle(a.upcomingCycle)}) e o atraso acumula` });
    return out;
  }
  const offsets = [...(settings.offsets || [7, 3, 1, 0])].sort((x, y) => y - x);
  for (const o of offsets) {
    const date = addDays(a.due, -o);
    const tag = TAG[o] || `D-${o}`;
    const text = o === 0 ? 'Último aviso antes da cobrança no cartão' : 'WhatsApp + e-mail';
    out.push({ key: key(tag, date, 'manha'), tag, kind: 'soon', offset: o, date, slot: 'manha', text: `${fmtDate(date)} · 9h · ${text}` });
    if (o === 1 && settings.reforcoTarde !== false) {
      out.push({ key: key(tag, date, 'tarde'), tag, kind: 'soon', offset: o, date, slot: 'tarde', text: `${fmtDate(date)} · 18h · reforço à tarde` });
    }
  }
  if (settings.atrasoDiario !== false) {
    out.push({ key: null, tag: 'ATRASO', kind: 'info', date: addDays(a.due, 1), slot: 'manha', text: `A partir de ${fmtDate(addDays(a.due, 1))} · diário até marcar como pago` });
  }
  return out;
}

export function alertsDueNow(state, today, slot) {
  const out = [];
  for (const sub of state.subs) {
    for (const e of alertSchedule(sub, today, state.settings)) {
      if (e.key && e.date === today && e.slot === slot) out.push({ sub, entry: e });
    }
  }
  return out;
}

// ---------- mensagens (usadas pelo cron e pela prévia do painel) ----------

export function overdueNote(a) {
  const n = a.openCycles.length;
  const months = `${n} mensalidade${n === 1 ? '' : 's'} em aberto (${a.openCycles.map(fmtCycle).join(', ')})`;
  return a.overdueManual
    ? `${months} · valor informado pelo fornecedor: ${fmtBRL(a.overdue)}.`
    : `${months} · total estimado ${fmtBRL(a.overdue)}. Confirme o valor no painel do fornecedor.`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function buildMessage(sub, today, ctx = {}) {
  const a = analyze(sub, today);
  const card = ctx.card || {};
  const panelUrl = ctx.panelUrl || '';
  const qrUrl = ctx.qrUrl || '';
  const late = a.state === 'late';
  const amountLabel = !late || (a.openCycles.length === 1 && !a.overdueManual)
    ? fmtBRL(a.toPay)
    : `${fmtBRL(a.toPay)} (${a.openCycles.length} mensalidade${a.openCycles.length === 1 ? '' : 's'} em aberto${a.overdueManual ? '' : ', estimado'})`;
  const when = late ? `EM ATRASO` : a.diff === 0 ? 'VENCE HOJE' : a.diff === 1 ? 'VENCE AMANHÃ' : `VENCE EM ${a.diff} DIAS`;
  const title = `${when} · ${sub.name}`;
  const label = sub.what ? `${sub.name} (${sub.what})` : sub.name;
  const lead = late ? `${label} está sem pagamento desde ${fmtCycle(a.cycle)}.` : `${label} vence dia ${fmtDate(a.due)}.`;
  const cardLine = card.last4 ? ` no cartão •••• ${card.last4}` : ' no cartão';
  const pixLine = sub.pixCode ? sub.pixCode : '[cadastre o Pix desta assinatura no painel]';

  const lines = [`*${title}*`, lead];
  if (sub.risk) lines.push(`*${late ? 'Impacto' : 'Se não pagar'}:* ${sub.risk}`);
  lines.push(`*Valor:* ${amountLabel}`);
  if (!late) lines.push(`Pague o Pix para liberar o limite${cardLine}.`);
  lines.push('', 'Pix copia e cola:', pixLine);
  if (panelUrl) lines.push('', `Abrir no painel: ${panelUrl}`);
  if (ctx.canReply) lines.push('', 'Responda *PAGO* depois de pagar.');
  const whatsapp = lines.join('\n');

  const subject = late
    ? `[GeoMatch] ${sub.name} em atraso desde ${fmtDate(a.due)} · ${fmtBRL(a.toPay)}`
    : `[GeoMatch] ${sub.name} vence ${inDaysLabel(a.diff)} · ${fmtBRL(sub.amount)}`;

  const tone = late ? { bg: '#FDECEA', fg: '#7A1A12' } : { bg: '#FEF0E1', fg: '#6B2E05' };
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F2F3EF;font-family:Arial,Helvetica,sans-serif;color:#15181D;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#FFFFFF;border:1px solid #E2E4DE;border-radius:14px;padding:24px">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5B6270;margin-bottom:6px">GeoMatch · Alerta de assinatura</div>
<h1 style="margin:0 0 16px;font-size:20px">${esc(title)}</h1>
<table role="presentation" width="100%" style="background:${tone.bg};color:${tone.fg};border-radius:12px;border-collapse:separate"><tr>
<td style="padding:16px"><div style="font-size:13px">${late ? 'Em atraso desde' : 'Vencimento'}</div><div style="font-family:monospace;font-size:22px;font-weight:bold">${fmtDate(a.due, true)}</div></td>
<td style="padding:16px;text-align:right"><div style="font-size:13px">Valor</div><div style="font-family:monospace;font-size:22px;font-weight:bold">${fmtBRL(a.toPay)}</div></td>
</tr></table>
${late && (a.openCycles.length > 1 || a.overdueManual) ? `<p style="margin:16px 0 0">${esc(overdueNote(a))}</p>` : ''}
${sub.risk ? `<p style="margin:16px 0"><b>${late ? 'Impacto' : 'O que acontece se não pagar'}:</b> ${esc(sub.risk)}</p>` : '<div style="height:16px"></div>'}
<div style="font-size:13px;color:#5B6270">Como pagar</div>
<ol style="margin:4px 0 16px;padding-left:20px">
<li>Pague o Pix abaixo na conta vinculada ao cartão.</li>
<li>O valor libera limite no cartão de crédito.</li>
<li>${esc(sub.name)} debita a assinatura automaticamente${esc(cardLine)}.</li>
</ol>
${qrUrl && sub.pixCode ? `<img src="${esc(qrUrl)}" width="180" height="180" alt="QR Code Pix ${esc(fmtBRL(a.toPay))}" style="display:block;margin:0 0 12px;border:1px solid #E2E4DE;border-radius:8px">` : ''}
<div style="font-family:monospace;font-size:12px;background:#F6F7F4;padding:10px 12px;border-radius:8px;word-break:break-all">${esc(pixLine)}</div>
${panelUrl ? `<p style="margin:20px 0 0"><a href="${esc(panelUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1D4ED8;color:#FFFFFF;font-weight:bold;text-decoration:none">Abrir painel de assinaturas</a></p>` : ''}
</div></div></body></html>`;

  const text = whatsapp.replace(/\*/g, '');
  return { title, lead, whatsapp, subject, html, text, a };
}

// ---------- Pix (BR Code / EMV) ----------

function tlv(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

export function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');

export function buildPix({ key, name, city, cep, amount, txid = '***' }) {
  const mai = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  let p = tlv('00', '01') + tlv('26', mai) + tlv('52', '0000') + tlv('53', '986');
  if (amount) p += tlv('54', (amount / 100).toFixed(2));
  p += tlv('58', 'BR') + tlv('59', ascii(name).slice(0, 25)) + tlv('60', ascii(city).slice(0, 15));
  if (cep) p += tlv('61', cep);
  p += tlv('62', tlv('05', txid));
  p += '6304';
  return p + crc16(p);
}

function readTLV(s) {
  const out = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (Number.isNaN(len)) break;
    out[id] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

export function parsePix(code) {
  const s = String(code || '').trim();
  if (!s.startsWith('000201') || s.length < 30) return { valid: false };
  const crcOk = crc16(s.slice(0, -4)) === s.slice(-4).toUpperCase();
  const f = readTLV(s);
  const mai = readTLV(f['26'] || '');
  const extra = readTLV(f['62'] || '');
  return {
    valid: crcOk,
    key: mai['01'] || '',
    name: f['59'] || '',
    city: f['60'] || '',
    cep: f['61'] || '',
    amount: f['54'] ? Math.round(Number(f['54']) * 100) : null,
    txid: extra['05'] || ''
  };
}
