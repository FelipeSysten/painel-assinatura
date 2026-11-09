import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, summary, applyPayment, undoPayment, alertSchedule, alertsDueNow, buildPix, parsePix, crc16, parseBRL, fmtBRL, addMonths, dueDate } from '../public/core.js';
import { seedState, migrateState, PIX_ATUAL } from '../lib/seed.js';

const TODAY = '2026-10-28';

test('datas de ciclo', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(dueDate('2027-02', 31), '2027-02-28');
});

test('status das assinaturas do mockup', () => {
  const { subs } = seedState();
  const [google, render, claude] = subs.map((s) => analyze(s, TODAY));
  assert.equal(google.state, 'late');
  assert.equal(google.due, '2026-06-01');
  assert.deepEqual(google.openCycles, ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.equal(google.overdue, 34554);
  assert.equal(google.toPay, 34554);
  assert.equal(render.state, 'soon');
  assert.equal(render.diff, 4);
  assert.equal(claude.state, 'ok');
  assert.equal(claude.due, '2026-11-15');
});

test('resumo: próximo vencimento 01/11 Render + Google', () => {
  const s = summary(seedState().subs, TODAY);
  assert.equal(s.monthly, 94900);
  assert.equal(s.overdue, 34554);
  assert.equal(s.nextDue, '2026-11-01');
  assert.equal(s.nextAmount, 39900);
  assert.equal(s.next30, 94900);
});

test('pagar quita todos os meses em atraso e desfazer volta', () => {
  const st = seedState();
  const paid = applyPayment(st, 'google', TODAY);
  const a = analyze(paid.subs[0], TODAY);
  assert.equal(a.state, 'soon');
  assert.equal(a.due, '2026-11-01');
  assert.equal(paid.subs[0].overdueOverride, null);
  assert.equal(paid.history[0].amount, 34554);
  const undone = undoPayment(paid, 'google').subs[0];
  assert.equal(undone.paidThrough, '2026-05');
  assert.equal(undone.overdueOverride, 34554);
  assert.equal(undone.overdueOverrideThrough, '2026-11');
});

test('agenda de alertas', () => {
  const st = seedState();
  const render = alertSchedule(st.subs[1], TODAY, st.settings);
  assert.deepEqual(render.filter((e) => e.key).map((e) => `${e.tag}@${e.date}/${e.slot}`), [
    'D-7@2026-10-25/manha', 'D-3@2026-10-29/manha', 'D-1@2026-10-31/manha', 'D-1@2026-10-31/tarde', 'DIA@2026-11-01/manha'
  ]);
  const due = alertsDueNow(st, TODAY, 'manha').map((x) => x.sub.id);
  assert.deepEqual(due, ['google']);
  assert.deepEqual(alertsDueNow(st, '2026-10-29', 'manha').map((x) => x.sub.id), ['google', 'render']);
});

test('Pix: CRC confere com os QR Codes reais e gerador é válido', () => {
  const { subs } = seedState();
  for (const s of subs) {
    const p = parsePix(s.pixCode);
    assert.ok(p.valid, s.id);
    assert.equal(s.pixCode, PIX_ATUAL, s.id);
    assert.equal(p.amount, null, s.id);
    assert.equal(p.key, '282ba16c-5445-4ec7-bd30-7b30b0e6e699');
  }
  const code = buildPix({ key: 'abc', name: 'José Ação', city: 'São Paulo', amount: 1050 });
  assert.equal(crc16(code.slice(0, -4)), code.slice(-4));
  assert.equal(parsePix(code).name, 'Jose Acao');
});

test('valores em reais', () => {
  assert.equal(parseBRL('1.234,56'), 123456);
  assert.equal(parseBRL('120'), 12000);
  assert.equal(parseBRL('R$ 279,00'), 27900);
  assert.equal(fmtBRL(94900), 'R$ 949,00');
});

test('dados salvos com os QR Codes antigos passam a usar o novo', () => {
  const old = seedState();
  old.subs[0].pixCode = '00020126580014br.gov.bcb.pix0136282ba16c-5445-4ec7-bd30-7b30b0e6e6995204000053039865406279.005802BR592557.894.816 FELIPE DE SOUZ6007Itabuna610945604-2586229052501M61DSAXF05JPENC2RWD0MSQ630488EE';
  old.subs[0].pixKeep = true;
  old.subs[2].pixCode = 'codigo-editado-pelo-usuario';
  const m = migrateState(old);
  assert.equal(m.subs[0].pixCode, PIX_ATUAL);
  assert.equal(m.subs[0].pixKeep, undefined);
  assert.equal(m.subs[2].pixCode, 'codigo-editado-pelo-usuario');
  assert.equal(migrateState(seedState()), null);
});

test('valor em atraso do Google Admin vale até nov e soma as mensalidades seguintes', () => {
  const google = seedState().subs[0];
  const nov = analyze(google, '2026-11-09');
  assert.equal(nov.openCycles.length, 6);
  assert.deepEqual(nov.extraCycles, []);
  assert.equal(nov.overdue, 34554);
  const dez = analyze(google, '2026-12-01');
  assert.deepEqual(dez.extraCycles, ['2026-12']);
  assert.equal(dez.overdue, 34554 + 27900);
});

test('valor em atraso salvo sem mês de referência é corrigido', () => {
  const st = seedState();
  delete st.subs[0].overdueOverrideThrough;
  const m = migrateState(st, '2026-11-09');
  assert.equal(m.subs[0].overdueOverrideThrough, '2026-11');
  assert.equal(analyze(m.subs[0], '2026-11-09').overdue, 34554);
});

test('dados salvos com R$ 280,00 ou R$ 298,50 passam para o saldo do Google Admin', () => {
  const st = seedState();
  Object.assign(st.subs[0], { overdueOverride: 28000, overdueOverrideThrough: '2026-10', note: 'antiga' });
  const g = migrateState(st, '2026-11-09').subs[0];
  st.subs[0].overdueOverride = 29850;
  assert.equal(migrateState(st, '2026-11-09').subs[0].overdueOverride, 34554);
  assert.equal(g.overdueOverride, 34554);
  assert.equal(g.overdueOverrideThrough, '2026-11');
  assert.match(g.note, /345,54/);
});
