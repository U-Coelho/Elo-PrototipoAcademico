import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRevenueReport } from '../src/domain/revenue-report.js';
import { createSeedState } from '../server/domain/platform.js';

const now = new Date('2026-11-22T15:00:00.000Z');
const campaigns = [
  { id: 'c1', creatorId: 'creator1', title: 'Horta', raisedCents: 99999999 },
  { id: 'c4', creatorId: 'creator1', title: 'Ateliê', raisedCents: 99999999 },
  { id: 'c2', creatorId: 'creator2', title: 'Álbum', raisedCents: 99999999 },
];
function receipt(id, amountCents, createdAt, campaignId = 'c1', overrides = {}) {
  const creatorId = campaignId === 'c2' ? 'creator2' : 'creator1';
  return {
    support: { id, amountCents, campaignId, creatorId, status: 'confirmed', confirmedAt: createdAt, ...overrides.support },
    entry: { id: `ledger-${id}`, contributionId: id, amountCents, campaignId, ownerId: creatorId, createdAt, type: 'contribution', direction: 'in', description: `Apoio ${id}`, ...overrides.entry },
  };
}
function report(receipts = [], options = {}) {
  return buildRevenueReport({ creatorId: 'creator1', campaigns, now, ledger: receipts.map(r => r.entry), contributions: receipts.map(r => r.support), ...options });
}
const code = expected => error => error.code === expected;

test('histórico financeiro permanece no relatório quando o conteúdo do projeto já foi removido',()=>{
 const r=receipt('removido',2700,'2026-11-22T12:00:00Z');r.support.campaignTitle='Projeto histórico';
 const value=report([r],{campaigns:[]});assert.equal(value.totalCents,2700);assert.equal(value.entries[0].campaignTitle,'Projeto histórico');
});

test('devoluções na janela são descontadas no líquido mesmo quando o crédito é anterior',()=>{
  const old=receipt('antigo',1800,'2026-11-10T12:00:00Z');
  Object.assign(old.support,{refundStatus:'completed',refundId:'ref-antigo'});
  const newer=receipt('novo',1000,'2026-11-20T12:00:00Z');
  const refund={...old.entry,id:'refund-1',refundId:'ref-antigo',createdAt:'2026-11-22T10:00:00Z',type:'refund',direction:'out'};
  const rows=[old.entry,newer.entry,refund,{...refund}, {...refund,ownerId:'supporter1',direction:'in'}];
  const r=report([old,newer],{ledger:rows});
  assert.equal(r.totalCents,1000);assert.equal(r.refundedCents,1800);assert.equal(r.netCents,-800);assert.equal(r.refundCount,1);
  assert.equal(r.points.at(-1).amountCents,0);assert.equal(r.entries.length,1);
});

test('período vazio tem sete dias de calendário e não inventa curva pelos totais das campanhas', () => {
  const r = report();
  assert.equal(r.startDate, '2026-11-16'); assert.equal(r.endDate, '2026-11-22');
  assert.equal(r.points.length, 7); assert.deepEqual(r.points.map(p => p.amountCents), Array(7).fill(0));
  assert.equal(r.totalCents, 0); assert.equal(r.paymentCount, 0); assert.equal(r.hasData, false); assert.deepEqual(r.entries, []);
  assert.equal(r.points[0].label, '16/11');
});

test('saldos iniciais e arrecadação histórica sem crédito registrado não viram receita diária', () => {
  const state = createSeedState();
  const r = buildRevenueReport({ ...state, creatorId: 'creator1', now });
  assert.equal(r.totalCents, 0); assert.equal(r.paymentCount, 0); assert.equal(r.hasData, false);
});

test('somente créditos positivos vinculados a contribuições confirmadas do criador entram no relatório', () => {
  const inputs = [
    receipt('ok', 5000, '2026-11-22T10:00:00Z'),
    receipt('pending', 6000, '2026-11-22T10:00:00Z', 'c1', { support: { status: 'pending' } }),
    receipt('failed', 7000, '2026-11-22T10:00:00Z', 'c1', { support: { status: 'failed' } }),
    receipt('out', 8000, '2026-11-22T10:00:00Z', 'c1', { entry: { direction: 'out' } }),
    receipt('opening', 9000, '2026-11-22T10:00:00Z', 'c1', { entry: { type: 'opening_balance' } }),
    receipt('payout', 10000, '2026-11-22T10:00:00Z', 'c1', { entry: { type: 'payout' } }),
    receipt('other', 11000, '2026-11-22T10:00:00Z', 'c2'),
  ];
  const r = report(inputs);
  assert.equal(r.totalCents, 5000); assert.equal(r.paymentCount, 1); assert.equal(r.entries[0].contributionId, 'ok');
});

test('filtro de projeto separa recebimentos e conserva o título canônico da campanha', () => {
  const inputs = [receipt('a', 5000, '2026-11-21T15:00:00Z'), receipt('b', 3500, '2026-11-22T15:00:00Z', 'c4')];
  assert.equal(report(inputs).totalCents, 8500);
  const r = report(inputs, { campaignId: 'c4' });
  assert.equal(r.totalCents, 3500); assert.equal(r.entries[0].campaignTitle, 'Ateliê');
  assert.ok(r.entries.every(e => e.campaignId === 'c4'));
});

test('janela inclui o primeiro instante do dia inicial em São Paulo e exclui o instante anterior', () => {
  const r = report([
    receipt('before', 1000, '2026-11-16T02:59:59.999Z'),
    receipt('first', 2000, '2026-11-16T03:00:00.000Z'),
    receipt('today', 3000, '2026-11-22T15:00:00.000Z'),
    receipt('future', 4000, '2026-11-22T15:00:00.001Z'),
  ]);
  assert.equal(r.totalCents, 5000); assert.equal(r.points[0].amountCents, 2000);
  assert.equal(r.points.at(-1).amountCents, 3000); assert.equal(r.paymentCount, 2);
});

test('agrupamento usa o dia de São Paulo e o timestamp do lançamento, não o dia UTC nem a criação do apoio', () => {
  const r = report([
    receipt('late', 2500, '2026-11-22T02:30:00Z', 'c1', { support: { confirmedAt: '2026-11-20T15:00:00Z' } }),
    receipt('morning', 7500, '2026-11-22T03:30:00Z'),
  ]);
  assert.equal(r.points.find(p => p.date === '2026-11-21').amountCents, 2500);
  assert.equal(r.points.find(p => p.date === '2026-11-22').amountCents, 7500);
  assert.equal(r.entries[0].contributionId, 'morning');
});

test('a própria data de hoje é obtida pelo fuso local mesmo antes das três horas UTC', () => {
  const r = report([], { now: '2026-11-22T01:00:00Z' });
  assert.equal(r.endDate, '2026-11-21'); assert.equal(r.startDate, '2026-11-15');
});

test('trinta dias atravessam mês e ano sem depender de intervalos de 24 horas locais', () => {
  const r = report([], { days: 30, now: '2027-01-03T15:00:00Z' });
  assert.equal(r.points.length, 30); assert.equal(r.startDate, '2026-12-05'); assert.equal(r.endDate, '2027-01-03');
});

test('janela preserva sete datas únicas durante uma transição de horário de verão', () => {
  const r = report([
    receipt('early', 1000, '2026-11-01T05:30:00Z'),
    receipt('late', 2000, '2026-11-01T06:30:00Z'),
  ], { timeZone: 'America/New_York', now: '2026-11-02T15:00:00Z' });
  assert.equal(new Set(r.points.map(p => p.date)).size, 7);
  assert.equal(r.points.find(p => p.date === '2026-11-01').amountCents, 3000);
});

test('repetição do mesmo crédito não duplica receita e não desloca uma receita antiga para a janela', () => {
  const original = receipt('same', 5000, '2026-11-20T15:00:00Z');
  const repeated = { ...original.entry, id: 'ledger-retry', createdAt: '2026-11-22T15:00:00Z' };
  const r = report([original], { ledger: [repeated, original.entry, { ...original.entry }] });
  assert.equal(r.totalCents, 5000); assert.equal(r.paymentCount, 1); assert.equal(r.entries[0].date, '2026-11-20');
  const old = { ...original.entry, createdAt: '2026-11-15T15:00:00Z' };
  assert.equal(report([original], { ledger: [repeated, old] }).totalCents, 0);
});

test('renovação mensal confirmada conta como outra cobrança e pendência não entra', () => {
  const root = receipt('root', 3500, '2026-11-19T15:00:00Z', 'c4', { support: { mode: 'monthly' } });
  const renewal = receipt('cycle-2', 3500, '2026-11-22T15:00:00Z', 'c4', { support: { mode: 'monthly', isRenewal: true, parentContributionId: 'root', billingCycle: 2 } });
  const pending = receipt('cycle-3', 3500, '2026-11-22T15:00:00Z', 'c4', { support: { mode: 'monthly', isRenewal: true, status: 'pending' } });
  const r = report([root, renewal, pending]);
  assert.equal(r.totalCents, 7000); assert.equal(r.paymentCount, 2);
});

test('lançamentos inválidos, créditos sem contribuição e valores incompatíveis são ignorados', () => {
  const inputs = [
    receipt('ok', 5000, '2026-11-22T15:00:00Z'),
    receipt('zero', 0, '2026-11-22T15:00:00Z'),
    receipt('negative', -500, '2026-11-22T15:00:00Z'),
    receipt('fraction', 500.5, '2026-11-22T15:00:00Z'),
    receipt('unsafe', Number.MAX_SAFE_INTEGER + 1, '2026-11-22T15:00:00Z'),
    receipt('nan', NaN, '2026-11-22T15:00:00Z'),
    receipt('date', 5000, 'inválida'),
    receipt('mismatch', 5000, '2026-11-22T15:00:00Z', 'c1', { entry: { amountCents: 6000 } }),
    receipt('wrong-project', 5000, '2026-11-22T15:00:00Z', 'c1', { entry: { campaignId: 'c4' } }),
    receipt('wrong-owner', 5000, '2026-11-22T15:00:00Z', 'c1', { entry: { ownerId: 'creator2' } }),
  ];
  const r = report(inputs, { ledger: [...inputs.map(r => r.entry), { ...inputs[0].entry, contributionId: 'missing' }] });
  assert.equal(r.totalCents, 5000); assert.equal(r.paymentCount, 1);
});

test('relatório não altera a fonte e não reutiliza objetos mutáveis da origem', () => {
  const inputs = [receipt('ok', 5000, '2026-11-22T15:00:00Z')];
  const before = JSON.stringify(inputs);
  const r = report(inputs); r.entries[0].description = 'Alteração'; r.points[6].amountCents = -1;
  assert.equal(JSON.stringify(inputs), before); assert.equal(report(inputs).totalCents, 5000);
});

test('parâmetros inválidos e campanha de outro criador são rejeitados explicitamente', () => {
  for (const days of [0, 1, 14, '7', 7.5, null]) assert.throws(() => report([], { days }), code('INVALID_REPORT_DAYS'));
  for (const campaignId of ['c2', 'missing', '', 3]) assert.throws(() => report([], { campaignId }), code('INVALID_REPORT_CAMPAIGN'));
  assert.throws(() => report([], { creatorId: '' }), code('INVALID_REPORT_CREATOR'));
  assert.throws(() => report([], { now: 'inválido' }), code('INVALID_REPORT_DATE'));
  assert.throws(() => report([], { timeZone: 'Fuso/Inexistente' }), code('INVALID_REPORT_TIME_ZONE'));
  assert.throws(() => report([], { ledger: null }), code('INVALID_REPORT_DATA'));
});

test('totais não ultrapassam a precisão de centavos inteiros', () => {
  const inputs = [receipt('big', Number.MAX_SAFE_INTEGER, '2026-11-22T12:00:00Z'), receipt('extra', 1, '2026-11-22T13:00:00Z')];
  assert.throws(() => report(inputs), code('REPORT_AMOUNT_OVERFLOW'));
});
