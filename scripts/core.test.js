import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, summary, applyPayment, undoPayment, alertSchedule, alertsDueNow, buildPix, parsePix, crc16, parseBRL, fmtBRL, addMonths, dueDate } from '../public/core.js';
import { seedState } from '../lib/seed.js';

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
  assert.equal(google.overdue, 28000);
  assert.equal(google.toPay, 28000);
  assert.equal(render.state, 'soon');
  assert.equal(render.diff, 4);
  assert.equal(claude.state, 'ok');
  assert.equal(claude.due, '2026-11-15');
});

test('resumo: próximo vencimento 01/11 Render + Google', () => {
  const s = summary(seedState().subs, TODAY);
  assert.equal(s.monthly, 94900);
  assert.equal(s.overdue, 28000);
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
  assert.equal(paid.history[0].amount, 28000);
  const undone = undoPayment(paid, 'google').subs[0];
  assert.equal(undone.paidThrough, '2026-05');
  assert.equal(undone.overdueOverride, 28000);
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
    assert.equal(p.amount, s.amount);
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
