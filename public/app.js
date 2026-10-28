import {
  todayISO, daysBetween, fmtLongDate, fmtDate, fmtCycle, fmtBRL, parseBRL, addMonths, dueDate, inDaysLabel,
  analyze, statusLabel, dueLine, sortByUrgency, summary, applyPayment, undoPayment, lastPayment,
  alertSchedule, buildMessage, buildPix, parsePix, overdueNote
} from './core.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

const ui = { token: store.get('gm_token') || '', data: null, log: {}, storage: 'server', channels: {}, selected: null, copied: false, editing: null, busy: false };

// ---------- API ----------

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${ui.token}`, ...(opts.headers || {}) }
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, body };
}

async function load() {
  const r = await api('/api/state');
  if (r.status === 401) {
    store.del('gm_token');
    ui.token = '';
    return renderLogin('Senha incorreta ou alterada. Entre novamente.');
  }
  if (!r.ok) return renderFatal(r.body.error || `Erro ${r.status} ao carregar o painel.`);
  ui.storage = r.body.storage;
  ui.channels = r.body.channels || {};
  ui.log = r.body.log || {};
  ui.data = r.body.state;
  if (ui.storage === 'local') {
    const local = store.get('gm_state');
    if (local) try { ui.data = JSON.parse(local); } catch {}
  }
  if (!ui.selected || !ui.data.subs.some((s) => s.id === ui.selected)) ui.selected = sortByUrgency(ui.data.subs, today())[0]?.id || null;
  render();
}

let saving = Promise.resolve();
function save(next, okMsg) {
  ui.data = next;
  render();
  if (ui.storage === 'local') {
    store.set('gm_state', JSON.stringify(next));
    if (okMsg) toast(okMsg);
    return;
  }
  saving = saving.then(async () => {
    const r = await api('/api/state', { method: 'PUT', body: JSON.stringify({ state: ui.data }) });
    if (r.status === 409) {
      ui.data = r.body.state;
      render();
      toast('Os dados mudaram em outro lugar (ex.: "PAGO" pelo WhatsApp). Recarreguei a versão mais recente.');
    } else if (!r.ok) {
      toast(r.body.error || 'Não foi possível salvar.');
    } else {
      ui.data.rev = r.body.state.rev;
      if (okMsg) toast(okMsg);
    }
  });
}

// ---------- helpers ----------

const today = () => todayISO();
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
}

const qrSrc = (code) => `/api/qr?code=${encodeURIComponent(code)}`;
const icon = {
  warn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6270" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
  qr: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5B6270" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4"/></svg>'
};

function pixIssues(sub) {
  if (!sub.pixCode) return [];
  const p = parsePix(sub.pixCode);
  if (!p.valid) return ['O código Pix parece inválido (dígito verificador não confere). Cole o código de novo.'];
  const out = [];
  const a = analyze(sub, today());
  // pixKeep: o usuário escolheu manter esse QR Code mesmo com valor diferente
  if (p.amount != null && p.amount !== a.toPay && !sub.pixKeep) out.push(`O Pix está com ${fmtBRL(p.amount)}, mas o valor a pagar é ${fmtBRL(a.toPay)}.`);
  return out;
}

// ---------- views ----------

function renderLogin(error = '') {
  app.className = '';
  app.innerHTML = `
  <form class="card login" id="login">
    <div class="logo">GM</div>
    <div class="stack-4"><div class="eyebrow">GeoMatch · Financeiro</div><h1 style="font-size:24px">Painel de assinaturas</h1></div>
    <label class="field">Senha do painel<input type="password" name="senha" autocomplete="current-password" required autofocus></label>
    ${error ? `<div class="hint bad">${esc(error)}</div>` : ''}
    <button class="btn btn-primary" type="submit">Entrar</button>
    <div class="hint">A senha é a variável <span class="mono">PAINEL_SENHA</span> configurada na Vercel.</div>
  </form>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    ui.token = new FormData(e.target).get('senha');
    const r = await api('/api/state');
    if (r.status === 401) return renderLogin('Senha incorreta.');
    store.set('gm_token', ui.token);
    load();
  });
}

function renderFatal(msg) {
  app.className = 'wrap';
  app.innerHTML = `<div class="notice red"><div class="grow"><b>Não foi possível abrir o painel</b><div class="desc">${esc(msg)}</div></div><button class="btn" data-action="logout">Sair</button></div>`;
}

function render() {
  if (!ui.data) return;
  app.className = 'wrap';
  const view = location.hash === '#alertas' ? 'alertas' : 'painel';
  app.innerHTML = header(view) + (view === 'alertas' ? previewView() : panelView());
  if (view === 'alertas') {
    const frame = $('#mail-frame');
    if (frame) frame.srcdoc = frame.dataset.html;
  }
}

function header(view) {
  return `
  <header class="top">
    <div class="stack-4">
      <div class="eyebrow">GeoMatch · Financeiro</div>
      <h1>${view === 'alertas' ? 'Como chegam os alertas' : 'Assinaturas e vencimentos'}</h1>
      <div class="muted">Hoje, ${fmtLongDate(today())} · pagamento via Pix para a conta vinculada ao cartão •••• ${esc(ui.data.settings.card?.last4 || '----')}</div>
    </div>
    <div class="row-wrap">
      <nav class="tabs" aria-label="Seções">
        <a href="#" ${view === 'painel' ? 'aria-current="page"' : ''}>Painel</a>
        <a href="#alertas" ${view === 'alertas' ? 'aria-current="page"' : ''}>Prévia dos alertas</a>
      </nav>
      <button type="button" class="btn" data-action="settings">Configurar alertas</button>
      <button type="button" class="btn btn-primary" data-action="new-sub">+ Nova assinatura</button>
    </div>
  </header>`;
}

function panelView() {
  const t = today();
  const { subs, settings } = ui.data;
  const sorted = sortByUrgency(subs, t);
  const sum = summary(subs, t);
  const sel = subs.find((s) => s.id === ui.selected) || sorted[0];

  const notices = [];
  if (ui.storage === 'local') {
    notices.push(`<div class="notice info">${icon.info}<div class="grow"><b>Modo local</b><div class="desc">Os dados ficam salvos só neste navegador e os alertas automáticos não rodam. Conecte o Neon Postgres (gratuito) no projeto da Vercel para salvar no servidor.</div></div></div>`);
  }
  if (!ui.channels.whatsapp && !ui.channels.email) {
    notices.push(`<div class="notice info">${icon.info}<div class="grow"><b>Nenhum canal de envio configurado</b><div class="desc">Configure o Resend (e-mail) e/ou CallMeBot/Twilio (WhatsApp) nas variáveis de ambiente para os alertas saírem de verdade. Veja o README.</div></div></div>`);
  }
  for (const s of sorted) {
    const a = analyze(s, t);
    if (a.state === 'late') {
      notices.push(`<div class="notice red">${icon.warn}<div class="grow"><b>${esc(s.name)}${s.what ? ` (${esc(s.what)})` : ''} em atraso desde ${fmtDate(a.due)} · vence todo dia ${String(s.dueDay).padStart(2, '0')}</b><div class="desc">Se não pagar: ${esc(s.risk)}</div></div><button type="button" class="btn btn-red" data-action="select" data-id="${s.id}">Pagar ${fmtBRL(a.toPay)}</button></div>`);
    } else if (a.state === 'soon') {
      notices.push(`<div class="notice amber">${icon.clock}<div class="grow"><b>${esc(s.name)} vence ${inDaysLabel(a.diff)} (${fmtDate(a.due)})</b><div class="desc">Se não pagar: ${esc(s.risk)}</div></div><button type="button" class="btn btn-amber" data-action="select" data-id="${s.id}">Ver Pix</button></div>`);
    }
  }

  const lateNames = sum.lateSubs.map((l) => `${l.sub.name} · desde ${fmtCycle(l.a.cycle)}`).join(' · ');
  const stats = `
  <section class="stats" aria-label="Resumo">
    <div class="card stat"><div class="small muted">Custo mensal</div><div class="v">${fmtBRL(sum.monthly)}</div><div class="small muted">${subs.length} assinatura${subs.length === 1 ? '' : 's'} · cartão •••• ${esc(settings.card?.last4 || '----')}</div></div>
    <div class="card stat"><div class="small muted">Em atraso</div><div class="v ${sum.overdue ? 'c-red' : 'c-green'}">${fmtBRL(sum.overdue)}</div><div class="small muted">${sum.overdue ? esc(lateNames) + (sum.lateSubs.every((l) => l.a.overdueManual) ? ' · valor informado' : ' · confirmar total') : 'Nada em atraso'}</div></div>
    <div class="card stat"><div class="small muted">Próximo vencimento</div><div class="v c-amber">${sum.nextDue ? fmtDate(sum.nextDue) : '—'}</div><div class="small muted">${sum.nextDue ? `${esc(sum.nextSubs.map((s) => s.name).join(' + '))} · ${fmtBRL(sum.nextAmount)} · ${inDaysLabel(daysBetween(t, sum.nextDue))}` : 'Sem assinaturas'}</div></div>
    <div class="card stat"><div class="small muted">A pagar nos próximos 30 dias</div><div class="v">${fmtBRL(sum.next30)}</div><div class="small muted">${sum.next30Subs.length ? esc(sum.next30Subs.join(', ')) : 'Nada'}${sum.overdue ? ' · fora o atraso' : ''}</div></div>
  </section>`;

  const list = sorted.length
    ? sorted.map((s) => subCard(s, t, s.id === sel?.id)).join('')
    : `<div class="empty">Nenhuma assinatura ainda. <button class="btn-link" data-action="new-sub">Cadastrar a primeira</button></div>`;

  return `
  ${notices.length ? `<section class="notices" aria-label="Alertas">${notices.join('')}</section>` : ''}
  ${stats}
  <div class="cols">
    <section class="subs" aria-label="Assinaturas">
      <div class="section-head"><h2>Assinaturas do projeto</h2><div class="small muted">Ordenadas por urgência</div></div>
      ${list}
    </section>
    ${sel ? sidePanel(sel, t) : ''}
  </div>
  ${cardSection(sorted, t)}
  ${stepsSection()}
  ${channelsSection()}
  <footer class="row-wrap small muted">
    <span>${ui.storage === 'server' ? 'Dados salvos no servidor.' : 'Dados salvos neste navegador.'}</span>
    <span class="spacer"></span>
    <button class="btn-link" data-action="export">Exportar dados (JSON)</button>
    <button class="btn-link" data-action="logout">Sair</button>
  </footer>`;
}

function subCard(s, t, selected) {
  const a = analyze(s, t);
  const sched = alertSchedule(s, t, ui.data.settings);
  const nextAlert = sched.find((e) => e.key && e.date >= t && !ui.log[e.key]);
  const alertLine = a.state === 'late'
    ? (ui.data.settings.atrasoDiario !== false ? 'Alerta diário de atraso ativo' : 'Alerta diário de atraso desligado')
    : nextAlert ? `Próximo alerta: ${nextAlert.date === t ? 'hoje' : fmtDate(nextAlert.date)} (${nextAlert.tag})` : 'Sem alertas programados';
  return `
  <article class="sub ${selected ? 'selected' : ''}">
    <div class="sub-top">
      <div class="avatar">${esc(s.mono || s.name[0])}</div>
      <div class="sub-id">
        <div class="name-row"><h3>${esc(s.name)}</h3><span class="pill ${a.state}">${statusLabel(a)}</span></div>
        <div class="small muted">${esc([s.category, s.what].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="sub-amt"><div class="v">${fmtBRL(s.amount)}</div><div class="small muted">${esc(dueLine(s, a))}</div></div>
    </div>
    <div class="risk">${icon.info}<div><b>Se não pagar: </b>${esc(s.risk || '—')}</div></div>
    <div class="sub-foot">
      <div class="small muted">${esc(alertLine)}</div>
      <div class="row-wrap">
        <button type="button" class="btn btn-ghost btn-sm" data-action="edit-sub" data-id="${s.id}">Editar</button>
        <button type="button" class="btn ${selected ? 'btn-primary' : 'btn-outline'}" data-action="select" data-id="${s.id}">${selected ? 'Selecionada' : 'Ver Pix e alertas'}</button>
      </div>
    </div>
  </article>`;
}

function timelineRows(sub, t) {
  const sched = alertSchedule(sub, t, ui.data.settings);
  let markedNext = false;
  return sched.map((e) => {
    const sent = e.key && ui.log[e.key];
    let cls = 'plan';
    let text = e.text;
    if (sent) {
      cls = 'sent';
      const via = [sent.whatsapp && 'WhatsApp', sent.email && 'e-mail'].filter(Boolean).join(' e ');
      text = `Enviado por ${via || '—'}`;
    } else if (e.kind === 'late') {
      cls = 'late';
    } else if (e.key && e.date < t) {
      text = `${e.text} · não enviado`;
    } else if (!markedNext && e.date >= t) {
      cls = 'next';
      markedNext = true;
    }
    const when = e.recurring ? 'Todo dia, 9h' : `${fmtDate(e.date)} · ${e.slot === 'tarde' ? '18h' : '9h'}`;
    return `<li><span class="tag ${cls}">${esc(e.tag)}</span><div class="t"><b>${e.kind === 'info' ? fmtDate(e.date) : when}</b><span>${esc(text)}</span></div></li>`;
  }).join('');
}

function sidePanel(sub, t) {
  const a = analyze(sub, t);
  const last = lastPayment(ui.data, sub.id);
  const issues = pixIssues(sub);
  const toPay = a.state === 'late' && (a.openCycles.length > 1 || a.overdueManual)
    ? `<div class="${a.overdueManual ? 'small muted' : 'warn'}">${esc(overdueNote(a))}</div>`
    : '';
  const paidLabel = a.state === 'late' ? `Marcar como pago (quita ${a.openCycles.length === 1 ? fmtCycle(a.cycle) : `${a.openCycles.length} meses`})` : `Marcar ${fmtCycle(a.cycle)} como pago`;
  return `
  <aside class="card side" aria-label="Pagamento selecionado">
    <div class="stack-4">
      <div class="eyebrow">Pagar via Pix</div>
      <h2>${esc(sub.name)}</h2>
      <div class="small muted">${esc(dueLine(sub, a))}</div>
    </div>
    <div class="qr-box">
      ${sub.pixCode && !issues.some((i) => i.includes('inválido'))
        ? `<img src="${qrSrc(sub.pixCode)}" alt="QR Code Pix de ${esc(sub.name)}" width="220" height="220">`
        : `<div class="qr-empty">${icon.qr}<div>QR Code ainda não cadastrado</div><button class="btn btn-sm btn-outline" data-action="edit-sub" data-id="${sub.id}">Adicionar Pix de ${fmtBRL(a.toPay)}</button></div>`}
    </div>
    <div class="stack-4" style="gap:10px">
      <div class="kv"><div class="small muted">${a.state === 'late' ? 'Valor a pagar' : 'Valor'}</div><div class="v">${fmtBRL(a.toPay)}</div></div>
      ${toPay}
      <label for="pixcode" class="small muted">Pix copia e cola</label>
      <div class="copy-row">
        <input id="pixcode" type="text" readonly value="${esc(sub.pixCode || '')}" placeholder="Sem código cadastrado">
        <button type="button" class="btn btn-ghost" data-action="copy" ${sub.pixCode ? '' : 'disabled'}>${ui.copied ? 'Copiado' : 'Copiar'}</button>
      </div>
      ${issues.map((i) => `<div class="warn">${esc(i)}</div>`).join('')}
      ${sub.pixKeep && sub.pixCode && parsePix(sub.pixCode).amount != null && parsePix(sub.pixCode).amount !== a.toPay ? `<div class="small muted">QR Code de ${fmtBRL(parsePix(sub.pixCode).amount)}, mantido por escolha sua.</div>` : ''}
      ${issues.length && ui.data.settings.pix?.key ? `<button type="button" class="btn btn-sm btn-outline" data-action="regen-pix">Gerar Pix de ${fmtBRL(a.toPay)} com minha chave</button>` : ''}
      <div class="small muted">O valor cai na conta, libera limite e a assinatura é debitada automaticamente no cartão •••• ${esc(ui.data.settings.card?.last4 || '----')}.</div>
      ${sub.note ? `<div class="small"><b>Observação:</b> ${esc(sub.note)}</div>` : ''}
    </div>
    <div class="stack-4" style="gap:10px">
      <div class="section-head"><h3 style="font-size:15px">Alertas programados</h3><a class="small" href="#alertas">Ver mensagem</a></div>
      <ol class="timeline">${timelineRows(sub, t)}</ol>
    </div>
    <button type="button" class="btn btn-dark btn-block" data-action="mark-paid">${esc(paidLabel)}</button>
    ${last ? `<div class="small muted">Último pagamento registrado em ${fmtDate(last.at.slice(0, 10))}${last.source === 'whatsapp' ? ' pelo WhatsApp' : ''} (até ${fmtCycle(last.to)}). <button class="btn-link" data-action="undo-paid">Desfazer</button></div>` : ''}
  </aside>`;
}

function cardSection(sorted, t) {
  const c = ui.data.settings.card || {};
  const rows = sorted.map((s) => {
    const a = analyze(s, t);
    return `<div><span>${esc(s.name)}</span><span class="${a.state === 'late' ? 'c-red' : 'muted'}" style="${a.state === 'late' ? 'font-weight:600' : ''}">todo dia ${String(s.dueDay).padStart(2, '0')}${a.state === 'late' ? ' · em atraso' : ''}</span><span class="mono">${fmtBRL(s.amount)}</span></div>`;
  }).join('');
  return `
  <section class="card panel cardrow" aria-label="Cartão de pagamento">
    <div class="cc">
      <div class="cc-row" style="align-items:center"><div class="small" style="color:var(--line-strong)">Cartão de crédito</div><div style="font-size:14px;font-weight:600">${esc(c.brand || '')}</div></div>
      <div class="num">•••• •••• •••• ${esc(c.last4 || '----')}</div>
      <div class="cc-row">
        <div class="stack-4" style="gap:2px"><div class="lbl">Titular</div><div style="font-size:14px;font-weight:600">${esc(c.holder || '—')}</div></div>
        <div class="stack-4" style="gap:2px;align-items:flex-end"><div class="lbl">Validade</div><div class="mono" style="font-size:14px;font-weight:600">${esc(c.exp || '—')}</div></div>
      </div>
    </div>
    <div class="cc-info">
      <h2>Cartão vinculado aos pagamentos</h2>
      <div class="muted" style="font-size:14px">Todas as assinaturas são cobradas neste cartão. O Pix de cada uma cai na conta vinculada e libera o limite antes da cobrança.</div>
      <div class="lines">${rows}</div>
      <div class="small muted">Por segurança o painel mostra só o final do cartão. Número completo e CVC ficam apenas no app do banco.</div>
    </div>
  </section>`;
}

const joinE = (list) => list.join(', ').replace(/, ([^,]*)$/, ' e $1');

function alertWhen(settings) {
  const offs = [...(settings.offsets || [])].sort((a, b) => b - a);
  const before = offs.filter((o) => o > 0);
  const parts = [];
  if (before.length) parts.push(`${joinE(before.map(String))} dia${before.length === 1 && before[0] === 1 ? '' : 's'} antes`);
  if (offs.includes(0)) parts.push('no dia');
  if (settings.atrasoDiario !== false) parts.push('todo dia enquanto estiver em atraso');
  return parts.length ? joinE(parts).replace(/^./, (c) => c.toUpperCase()) : 'Nenhum alerta ligado';
}

function stepsSection() {
  const names = joinE(ui.data.subs.map((s) => s.name)) || 'As assinaturas';
  return `
  <section class="card panel" aria-label="Como funciona o pagamento">
    <h2>Como o pagamento funciona</h2>
    <div class="steps">
      <div><div class="n">01 · Alerta</div><b>Mensagem no WhatsApp e no e-mail</b><div class="d">${esc(alertWhen(ui.data.settings))}.</div></div>
      <div><div class="n">02 · Pix</div><b>Pagar o QR Code da assinatura</b><div class="d">Cada assinatura tem o próprio Pix com o valor exato.</div></div>
      <div><div class="n">03 · Limite</div><b>O valor libera limite no cartão</b><div class="d">O dinheiro fica disponível na conta vinculada ao cartão de crédito.</div></div>
      <div><div class="n">04 · Débito</div><b>A assinatura é cobrada no cartão</b><div class="d">${esc(names)} debitam automaticamente no cartão •••• ${esc(ui.data.settings.card?.last4 || '----')}.</div></div>
    </div>
  </section>`;
}

function channelsSection() {
  const s = ui.data.settings;
  const ch = ui.channels;
  const badEmail = /@geomatchbr\.com\s*$/i.test(s.email || '');
  return `
  <section class="card panel" aria-label="Canais de alerta">
    <div class="section-head"><h2>Para onde vão os alertas</h2>
      <div class="small muted"><span class="status-dot ${ch.whatsapp ? 'on' : ''}"></span>WhatsApp ${ch.whatsapp ? `ativo (${esc(ch.whatsappProvider)})` : 'não configurado'} · <span class="status-dot ${ch.email ? 'on' : ''}"></span>E-mail ${ch.email ? 'ativo' : 'não configurado'}</div>
    </div>
    <form id="form-channels" class="channels">
      <label class="field">WhatsApp
        <input name="whatsapp" type="tel" inputmode="tel" value="${esc(s.whatsapp)}" placeholder="55 73 99999-9999">
        <span class="hint">Com DDI e DDD. Recebe todos os alertas, inclusive os de atraso.</span>
      </label>
      <label class="field">E-mail
        <input name="email" type="email" value="${esc(s.email)}" placeholder="seu.email@gmail.com">
        <span class="hint ${badEmail ? 'bad' : ''}" style="${badEmail ? '' : 'color:var(--amber-2);font-weight:500'}">Não use um endereço @geomatchbr.com: se o Google suspender o domínio, o alerta não chega.</span>
      </label>
    </form>
    <div class="row-wrap">
      <button type="button" class="btn btn-primary" data-action="save-channels">Salvar canais</button>
      <button type="button" class="btn" data-action="test-alert">Enviar teste agora (${esc(ui.data.subs.find((x) => x.id === ui.selected)?.name || '—')})</button>
      ${ui.storage === 'server' ? '<button type="button" class="btn btn-ghost" data-action="run-cron">Rodar alertas de hoje</button>' : ''}
    </div>
  </section>`;
}

function previewView() {
  const t = today();
  const subs = sortByUrgency(ui.data.subs, t);
  const sub = subs.find((s) => s.id === ui.selected) || subs[0];
  if (!sub) return '<div class="empty">Cadastre uma assinatura para ver a prévia dos alertas.</div>';
  const msg = buildMessage(sub, t, { card: ui.data.settings.card, panelUrl: location.origin, qrUrl: sub.pixCode ? location.origin + qrSrc(sub.pixCode) : '', canReply: ui.channels.canReply });
  const after = analyze(applyPayment(ui.data, sub.id, t).subs.find((s) => s.id === sub.id), t);
  const pick = subs.map((s) => `<button type="button" class="btn btn-sm ${s.id === sub.id ? 'btn-dark' : ''}" data-action="select" data-id="${s.id}">${esc(s.name)}</button>`).join('');
  return `
  <div class="row-wrap"><span class="small muted">Assinatura:</span>${pick}</div>
  <div class="previews">
    <section class="card pv" aria-label="Prévia WhatsApp">
      <div class="pv-head"><div class="pv-avatar">GM</div><div class="stack-4" style="gap:0"><b>GeoMatch Alertas</b><span class="small muted">WhatsApp · ${esc(ui.data.settings.whatsapp || '[cadastre seu número]')}</span></div></div>
      <div class="chat">
        <div class="day">Hoje</div>
        <div class="bubble">${esc(msg.whatsapp).replace(/\*([^*\n]+)\*/g, '<b>$1</b>')}<span class="time">09:00</span></div>
        ${ui.channels.canReply ? `<div class="bubble me">PAGO<span class="time">09:12</span></div><div class="bubble">Registrado. Os alertas de ${esc(sub.name)} param até o próximo vencimento (${fmtDate(after.due)}).</div>` : ''}
      </div>
    </section>
    <section class="card pv" aria-label="Prévia e-mail">
      <div class="mail-head">
        <div><span class="muted">De: </span>${esc(ui.channels.emailFrom || 'Alertas GeoMatch <[REMETENTE FORA DO DOMÍNIO]>')}</div>
        <div><span class="muted">Para: </span>${esc(ui.data.settings.email || '[cadastre seu e-mail]')}</div>
        <div class="subj">${esc(msg.subject)}</div>
      </div>
      <iframe id="mail-frame" class="mail-frame" title="Prévia do e-mail" sandbox="" data-html="${esc(msg.html)}"></iframe>
    </section>
  </div>
  <div class="row-wrap"><button type="button" class="btn" data-action="test-alert">Enviar este alerta agora</button><span class="small muted">Os alertas automáticos saem às 9h (e 18h no reforço do D-1), horário de Brasília.</span></div>`;
}

// ---------- formulário de assinatura ----------

const dlgSub = $('#dlg-sub');
const formSub = $('#form-sub');

function paidThroughOptions(dueDay, selected) {
  const t = today();
  const cur = t.slice(0, 7);
  const opts = [];
  for (let i = 1; i >= -12; i--) {
    const c = addMonths(cur, i);
    const next = addMonths(c, 1);
    const nd = dueDate(next, dueDay || 1);
    const late = nd < t;
    opts.push(`<option value="${c}" ${c === selected ? 'selected' : ''}>Último mês pago: ${fmtCycle(c)} → ${late ? `em atraso desde ${fmtDate(nd, true)}` : `próximo vencimento ${fmtDate(nd, true)}`}</option>`);
  }
  return opts.join('');
}

function defaultPaidThrough(dueDay) {
  const t = today();
  const cur = t.slice(0, 7);
  return dueDate(cur, dueDay) >= t ? addMonths(cur, -1) : cur;
}

function openSubForm(sub) {
  ui.editing = sub ? sub.id : null;
  $('#dlg-sub-title').textContent = sub ? `Editar ${sub.name}` : 'Nova assinatura';
  formSub.reset();
  const f = formSub.elements;
  const dueDay = sub?.dueDay || 1;
  f.name.value = sub?.name || '';
  f.mono.value = sub?.mono || '';
  f.category.value = sub?.category || '';
  f.what.value = sub?.what || '';
  f.amount.value = sub ? (sub.amount / 100).toFixed(2).replace('.', ',') : '';
  f.dueDay.value = sub?.dueDay || '';
  f.risk.value = sub?.risk || '';
  f.note.value = sub?.note || '';
  f.overdueOverride.value = sub?.overdueOverride != null ? (sub.overdueOverride / 100).toFixed(2).replace('.', ',') : '';
  f.pixCode.value = sub?.pixCode || '';
  f.paidThrough.innerHTML = paidThroughOptions(dueDay, sub?.paidThrough || defaultPaidThrough(dueDay));
  $('[data-action="delete-sub"]', formSub).hidden = !sub;
  checkPixField();
  dlgSub.showModal();
}

function checkPixField() {
  const f = formSub.elements;
  const el = $('#pix-check');
  const code = f.pixCode.value.trim();
  if (!code) { el.textContent = 'Opcional. Sem Pix, o alerta sai sem QR Code.'; el.className = 'hint'; return; }
  const p = parsePix(code);
  if (!p.valid) { el.textContent = 'Código Pix inválido (dígito verificador não confere).'; el.className = 'hint bad'; return; }
  const amount = parseBRL(f.amount.value);
  const parts = [`Recebedor: ${p.name}`, p.amount != null ? `valor ${fmtBRL(p.amount)}` : 'sem valor fixo'];
  const mismatch = p.amount != null && amount && p.amount !== amount;
  el.textContent = parts.join(' · ') + (mismatch ? ` · diferente do valor da assinatura (${fmtBRL(amount)})` : '');
  el.className = mismatch ? 'hint bad' : 'hint good';
}

formSub.addEventListener('input', (e) => {
  if (e.target.name === 'dueDay') {
    const f = formSub.elements;
    const d = Math.min(31, Math.max(1, Number(f.dueDay.value) || 1));
    f.paidThrough.innerHTML = paidThroughOptions(d, f.paidThrough.value);
  }
  if (e.target.name === 'pixCode' || e.target.name === 'amount') checkPixField();
});

formSub.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = formSub.elements;
  const amount = parseBRL(f.amount.value);
  const dueDay = Number(f.dueDay.value);
  if (!(amount > 0)) return toast('Informe um valor válido, ex.: 120,00');
  if (!(dueDay >= 1 && dueDay <= 31)) return toast('O dia de vencimento vai de 1 a 31.');
  const overdueOverride = f.overdueOverride.value.trim() ? parseBRL(f.overdueOverride.value) : null;
  if (overdueOverride !== null && !(overdueOverride > 0)) return toast('Valor em atraso inválido, ex.: 280,00');
  const name = f.name.value.trim();
  const fields = {
    name, mono: (f.mono.value.trim() || name[0] || '?').toUpperCase(), category: f.category.value.trim(), what: f.what.value.trim(),
    amount, dueDay, paidThrough: f.paidThrough.value, risk: f.risk.value.trim(), note: f.note.value.trim(), pixCode: f.pixCode.value.trim(), overdueOverride
  };
  const subs = ui.data.subs;
  let next;
  if (ui.editing) {
    next = { ...ui.data, subs: subs.map((s) => (s.id === ui.editing ? { ...s, ...fields, pixKeep: !!s.pixKeep && s.pixCode === fields.pixCode } : s)) };
  } else {
    const base = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assinatura';
    let id = base;
    for (let i = 2; subs.some((s) => s.id === id); i++) id = `${base}-${i}`;
    next = { ...ui.data, subs: [...subs, { id, ...fields }] };
    ui.selected = id;
  }
  dlgSub.close();
  save(next, ui.editing ? 'Assinatura atualizada.' : 'Assinatura cadastrada.');
});

async function loadJsQR() {
  if (window.jsQR) return window.jsQR;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/jsQR.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Falha ao carregar o leitor de QR.'));
    document.head.appendChild(s);
  });
  return window.jsQR;
}

async function decodeQrFile(file) {
  const jsQR = await loadJsQR();
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || null;
}

// ---------- configurações ----------

const dlgSettings = $('#dlg-settings');
const formSettings = $('#form-settings');

function openSettings() {
  const s = ui.data.settings;
  const f = formSettings.elements;
  const offs = s.offsets || [];
  for (const o of [7, 3, 1, 0]) f[`off${o}`].checked = offs.includes(o);
  f.reforcoTarde.checked = s.reforcoTarde !== false;
  f.atrasoDiario.checked = s.atrasoDiario !== false;
  f.pixKey.value = s.pix?.key || '';
  f.pixName.value = s.pix?.name || '';
  f.pixCity.value = s.pix?.city || '';
  f.pixCep.value = s.pix?.cep || '';
  f.cardBrand.value = s.card?.brand || '';
  f.cardLast4.value = s.card?.last4 || '';
  f.cardHolder.value = s.card?.holder || '';
  f.cardExp.value = s.card?.exp || '';
  dlgSettings.showModal();
}

formSettings.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = formSettings.elements;
  const settings = {
    ...ui.data.settings,
    offsets: [7, 3, 1, 0].filter((o) => f[`off${o}`].checked),
    reforcoTarde: f.reforcoTarde.checked,
    atrasoDiario: f.atrasoDiario.checked,
    pix: { key: f.pixKey.value.trim(), name: f.pixName.value.trim(), city: f.pixCity.value.trim(), cep: f.pixCep.value.trim() },
    card: { brand: f.cardBrand.value.trim(), last4: f.cardLast4.value.trim(), holder: f.cardHolder.value.trim().toUpperCase(), exp: f.cardExp.value.trim() }
  };
  dlgSettings.close();
  save({ ...ui.data, settings }, 'Configurações salvas.');
});

// ---------- ações ----------

const actions = {
  select(el) {
    ui.selected = el.dataset.id;
    ui.copied = false;
    render();
    if (location.hash !== '#alertas' && window.matchMedia('(max-width: 940px)').matches) $('.side')?.scrollIntoView({ behavior: 'smooth' });
  },
  'new-sub': () => openSubForm(null),
  'edit-sub': (el) => openSubForm(ui.data.subs.find((s) => s.id === el.dataset.id)),
  settings: openSettings,
  async copy() {
    const sub = ui.data.subs.find((s) => s.id === ui.selected);
    try {
      await navigator.clipboard.writeText(sub.pixCode);
    } catch {
      const input = $('#pixcode');
      input.select();
      document.execCommand('copy');
    }
    ui.copied = true;
    render();
    toast('Código Pix copiado.');
  },
  'mark-paid'() {
    const sub = ui.data.subs.find((s) => s.id === ui.selected);
    const next = applyPayment(ui.data, sub.id, today());
    const a = analyze(next.subs.find((s) => s.id === sub.id), today());
    save(next, `${sub.name} marcado como pago. Próximo vencimento: ${fmtDate(a.due, true)}.`);
  },
  'undo-paid'() {
    save(undoPayment(ui.data, ui.selected), 'Pagamento desfeito.');
  },
  'delete-sub'() {
    const sub = ui.data.subs.find((s) => s.id === ui.editing);
    if (!sub || !confirm(`Excluir ${sub.name}? Essa ação não pode ser desfeita.`)) return;
    dlgSub.close();
    if (ui.selected === sub.id) ui.selected = null;
    const next = { ...ui.data, subs: ui.data.subs.filter((s) => s.id !== sub.id) };
    ui.selected = ui.selected || sortByUrgency(next.subs, today())[0]?.id || null;
    save(next, 'Assinatura excluída.');
  },
  'gen-pix'() {
    const f = formSub.elements;
    const pix = ui.data.settings.pix || {};
    const amount = parseBRL(f.amount.value);
    if (!pix.key || !pix.name || !pix.city) return toast('Cadastre a chave Pix em "Configurar alertas" primeiro.');
    if (!(amount > 0)) return toast('Informe o valor da assinatura antes de gerar o Pix.');
    f.pixCode.value = buildPix({ ...pix, amount });
    checkPixField();
  },
  'regen-pix'() {
    const sub = ui.data.subs.find((s) => s.id === ui.selected);
    const amount = analyze(sub, today()).toPay;
    if (!confirm(`Trocar o Pix de ${sub.name} por um novo de ${fmtBRL(amount)} gerado com sua chave? Confira o recebedor no banco antes de pagar.`)) return;
    const pixCode = buildPix({ ...ui.data.settings.pix, amount });
    save({ ...ui.data, subs: ui.data.subs.map((s) => (s.id === sub.id ? { ...s, pixCode } : s)) }, `Pix de ${fmtBRL(amount)} gerado.`);
  },
  'save-channels'() {
    const f = $('#form-channels').elements;
    const email = f.email.value.trim();
    if (email && !f.email.checkValidity()) return toast('E-mail inválido.');
    save({ ...ui.data, settings: { ...ui.data.settings, whatsapp: f.whatsapp.value.trim(), email } }, 'Canais salvos.');
  },
  async 'test-alert'(el) {
    el.disabled = true;
    const r = await api('/api/test-alert', { method: 'POST', body: JSON.stringify({ subId: ui.selected, state: ui.storage === 'local' ? ui.data : undefined }) });
    el.disabled = false;
    if (!r.ok) return toast(r.body.error || 'Falha ao enviar.');
    const fmt = (name, x) => `${name}: ${x.ok ? 'enviado' : x.skipped || x.error}`;
    toast(`${fmt('WhatsApp', r.body.whatsapp)} · ${fmt('E-mail', r.body.email)}`);
  },
  async 'run-cron'(el) {
    el.disabled = true;
    const r = await api('/api/cron', { method: 'POST' });
    el.disabled = false;
    if (!r.ok) return toast(r.body.error || 'Falha ao rodar os alertas.');
    toast(r.body.results.length ? `${r.body.sent} alerta(s) enviado(s) de ${r.body.results.length} programado(s) para hoje.` : 'Nenhum alerta programado para agora.');
    load();
  },
  export() {
    const blob = new Blob([JSON.stringify(ui.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `assinaturas-geomatch-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  logout() {
    store.del('gm_token');
    ui.token = '';
    ui.data = null;
    renderLogin();
  }
};

document.addEventListener('click', (e) => {
  const close = e.target.closest('[data-close]');
  if (close) return close.closest('dialog').close();
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.dataset.action !== 'read-qr' || !e.target.files[0]) return;
  try {
    const code = await decodeQrFile(e.target.files[0]);
    if (!code) return toast('Não encontrei um QR Code nessa imagem.');
    formSub.elements.pixCode.value = code;
    checkPixField();
    toast('QR Code lido.');
  } catch (err) {
    toast(err.message);
  } finally {
    e.target.value = '';
  }
});

window.addEventListener('hashchange', render);

if (ui.token) load();
else renderLogin();
