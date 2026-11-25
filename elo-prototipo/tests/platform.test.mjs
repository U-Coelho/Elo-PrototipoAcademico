import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatform, createSeedState, securityDiagnostics, STORAGE_KEY } from '../server/domain/platform.js';

const newSupport = (p, overrides = {}) => p.createContribution({ campaignId: 'c1', amountCents: 5000, mode: 'once', idempotencyKey: 'test-support', ...overrides });
const hasCode = code => error => error.code === code;

test('inicia com catálogo e personagens fictícios, sem campos de cartão ou senha', () => {
  const p = createPlatform();
  assert.equal(p.listCampaigns().length, 6);
  assert.equal(p.getActor().id, 'supporter1');
  assert.equal(p.getState().contributions.length, 3);
  assert.doesNotMatch(JSON.stringify(p.getState()), /"(?:password|cardNumber|cvv|cpf)"/i);
});

test('objetos retornados não permitem alterar o estado interno', () => {
  const p = createPlatform();
  const campaign = p.getCampaign('c1'); campaign.raisedCents = 0;
  const state = p.getState(); state.actorId = 'admin1';
  assert.notEqual(p.getCampaign('c1').raisedCents, 0);
  assert.equal(p.getActor().id, 'supporter1');
});

test('exige personagem adequada para apoiar, publicar e solicitar repasse', () => {
  const p = createPlatform();
  assert.throws(() => p.requestPayout({ amountCents: 500, idempotencyKey: 'p' }), hasCode('FORBIDDEN'));
  assert.throws(() => p.createCampaign({}), hasCode('FORBIDDEN'));
  p.switchActor('creator1');
  assert.throws(() => newSupport(p), hasCode('SELF_SUPPORT_UNAVAILABLE'));
  assert.equal(newSupport(p,{campaignId:'c2'}).supporterId,'creator1');
});

test('nega alteração de apoio alheio e restringe trilha completa', () => {
  const p = createPlatform(); p.switchActor('creator1');
  assert.throws(() => p.simulatePayment('support-3'), hasCode('FORBIDDEN'));
  assert.throws(() => p.cancelSubscription('support-2'), hasCode('FORBIDDEN'));
  assert.throws(() => p.audit(), hasCode('FORBIDDEN'));
  p.switchActor('admin1'); assert.ok(p.audit().length > 0);
});

test('rejeita valores inválidos e frações de centavo', () => {
  const p = createPlatform();
  for (const amountCents of [-1, 0, 499, 500.1, '5000', NaN, Infinity, Number.MAX_SAFE_INTEGER, 100_000_001]) {
    assert.throws(() => newSupport(p, { amountCents }), hasCode('INVALID_AMOUNT'));
  }
  assert.equal(p.getState().contributions.length, 3);
});

test('apoio pendente não altera campanha ou saldo', () => {
  const p = createPlatform(); const raised = p.getCampaign('c1').raisedCents;
  const before = p.getState().ledger.length;
  const support = newSupport(p);
  assert.equal(support.status, 'pending');
  assert.equal(p.getCampaign('c1').raisedCents, raised);
  assert.equal(p.getState().ledger.length, before);
});

test('a mesma solicitação idempotente cria apenas um apoio', () => {
  const p = createPlatform(); const first = newSupport(p); const second = newSupport(p);
  assert.equal(first.id, second.id);
  assert.equal(p.getState().contributions.filter(c => c.id === first.id).length, 1);
  assert.throws(() => newSupport(p, { amountCents: 6000 }), hasCode('IDEMPOTENCY_CONFLICT'));
});

test('confirmação duplicada credita uma única vez e preserva valores inteiros', () => {
  const p = createPlatform(); const initial = p.getCampaign('c1').raisedCents;
  const support = newSupport(p); const first = p.simulatePayment(support.id); const second = p.simulatePayment(support.id);
  assert.equal(first.duplicate, false); assert.equal(second.duplicate, true);
  assert.equal(p.getCampaign('c1').raisedCents, initial + 5000);
  const credits = p.getState().ledger.filter(l => l.contributionId === support.id && l.ownerId === 'creator1');
  assert.equal(credits.length, 1); assert.equal(credits[0].amountCents, 5000);
  p.switchActor('creator1'); assert.equal(p.getSummary().availableBalanceCents, 253000);
});

test('recusa não movimenta saldo e estados finais não são sobrescritos', () => {
  const p = createPlatform(); const initial = p.getCampaign('c1').raisedCents;
  const support = newSupport(p); p.simulatePayment(support.id, 'failed');
  assert.equal(p.getCampaign('c1').raisedCents, initial);
  assert.throws(() => p.simulatePayment(support.id, 'confirmed'), hasCode('INVALID_TRANSITION'));
});

test('plano mensal só é permitido em campanha compatível', () => {
  const p = createPlatform();
  assert.throws(() => newSupport(p, { campaignId: 'c3', mode: 'monthly' }), hasCode('MONTHLY_UNAVAILABLE'));
  assert.throws(() => newSupport(p, { mode: 'weekly' }), hasCode('INVALID_MODE'));
});

test('cancelar plano preserva pagamento e histórico e impede renovação ativa', () => {
  const p = createPlatform(); const total = p.getSummary().totalSupportedCents;
  const first = p.cancelSubscription('support-2'); const second = p.cancelSubscription('support-2');
  assert.equal(first.subscriptionStatus, 'canceled'); assert.equal(second.duplicate, true);
  assert.equal(p.getSummary().activeSubscriptions, 0);
  assert.equal(p.getSummary().totalSupportedCents, total);
  assert.equal(p.getState().contributions.find(c => c.id === 'support-2').status, 'confirmed');
});

test('repasse idempotente não retira saldo duas vezes', () => {
  const p = createPlatform(); p.switchActor('creator1'); const before = p.getSummary().availableBalanceCents;
  const first = p.requestPayout({ amountCents: 10000, idempotencyKey: 'payout-a' });
  const second = p.requestPayout({ amountCents: 10000, idempotencyKey: 'payout-a' });
  assert.equal(first.id, second.id); assert.equal(p.getSummary().availableBalanceCents, before - 10000);
  assert.throws(() => p.requestPayout({ amountCents: 12000, idempotencyKey: 'payout-a' }), hasCode('IDEMPOTENCY_CONFLICT'));
});

test('solicitações sucessivas na mesma instância não excedem saldo disponível', async () => {
  const p = createPlatform(); p.switchActor('creator1'); const before = p.getSummary().availableBalanceCents;
  const outcomes = await Promise.allSettled([
    Promise.resolve().then(() => p.requestPayout({ amountCents: before, idempotencyKey: 'payout-one' })),
    Promise.resolve().then(() => p.requestPayout({ amountCents: before, idempotencyKey: 'payout-two' })),
  ]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(o => o.status === 'rejected').reason.code, 'INSUFFICIENT_BALANCE');
  assert.equal(p.getSummary().availableBalanceCents, 0);
});

test('extrato retorna apenas registros da personagem, exceto administração', () => {
  const p = createPlatform(); assert.ok(p.getLedger().every(l => l.ownerId === 'supporter1'));
  p.switchActor('creator1'); assert.ok(p.getLedger().every(l => l.ownerId === 'creator1'));
  p.switchActor('admin1'); assert.equal(p.getLedger().length, p.getState().ledger.length);
});

test('criação de campanha valida domínio e publica somente dados fornecidos', () => {
  const p = createPlatform(); p.switchActor('creator1');
  const payload = { title: 'Um projeto fictício', description: 'Uma campanha educativa criada apenas para demonstração.', category: 'Educação', goalCents: 100000, daysLeft: 30, monthly: true };
  const project = p.createCampaign(payload);
  assert.equal(project.creatorId, 'creator1'); assert.equal(project.raisedCents, 0); assert.equal(project.rewards.length, 0);
  assert.throws(() => p.createCampaign({ ...payload, daysLeft: 100 }), hasCode('INVALID_DURATION'));
  assert.throws(() => p.createCampaign({ ...payload, category: 'inexistente' }), hasCode('INVALID_CATEGORY'));
});

test('persistência válida sobrevive a nova instância e estado inválido é reiniciado', () => {
  const memory = new Map(); const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const p = createPlatform({ storage }); newSupport(p);
  assert.equal(createPlatform({ storage }).getState().contributions.length, 4);
  storage.setItem(STORAGE_KEY, '{"schemaVersion":999}');
  assert.equal(createPlatform({ storage }).getState().contributions.length, 3);
});

test('armazenamento indisponível não interrompe simulação', () => {
  const p = createPlatform({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } } });
  assert.equal(p.getState().persistenceAvailable, false);
  assert.equal(newSupport(p).status, 'pending');
});

test('estado persistido com datas ou campos de renderização inválidos é descartado', () => {
  for (const corrupt of [
    state => { state.campaigns[0].daysLeft = '<button>conteúdo inválido</button>'; },
    state => { state.campaigns[0].creator = null; },
    state => { state.contributions[0].createdAt = 'data inválida'; },
    state => { state.ledger[0].createdAt = null; },
  ]) {
    let saved = null;
    const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
    const p = createPlatform({ storage }); newSupport(p);
    const state = JSON.parse(saved); corrupt(state); saved = JSON.stringify(state);
    const restored = createPlatform({ storage });
    assert.equal(restored.getState().contributions.length, 3);
    assert.equal(restored.getCampaign('c1').daysLeft, 18);
  }
});

test('diagnóstico não modifica a sessão e todas as regras demonstrativas passam', () => {
  const p = createPlatform(); const before = JSON.stringify(p.getState());
  const results = p.securityDiagnostics();
  assert.equal(results.length, 8); assert.ok(results.every(result => result.passed));
  assert.equal(JSON.stringify(p.getState()), before);
});

test('exportação identifica simulação e reset restaura dados iniciais', () => {
  const p = createPlatform(); newSupport(p); const exported = JSON.parse(p.exportSnapshot());
  assert.match(exported.warning, /fictícios/);
  assert.equal(exported.contributions.length, 4);
  p.reset(); assert.equal(p.getState().contributions.length, 3);
  assert.equal(securityDiagnostics().every(r => r.passed), true);
});

test('estado inicial explícito é isolado e corrupção do repositório não reinicia o cenário', () => {
  const seed = createSeedState();
  const p = createPlatform({ initialState: seed });
  seed.campaigns[0].title = 'Alteração externa';
  assert.notEqual(p.getCampaign('c1').title, seed.campaigns[0].title);
  assert.equal(p.getState().contributions.every(c => c.isRenewal === false && c.billingCycle === 1), true);
  const corrupt = createSeedState(); corrupt.contributions[0].amountCents = -1;
  assert.throws(() => createPlatform({ initialState: corrupt }), hasCode('INVALID_STATE'));
  assert.equal(createSeedState().campaigns[0].title, 'Verde no concreto');
});

test('renovação cria pagamento pendente separado e somente um ciclo pendente por assinatura', () => {
  const p = createPlatform(); const initialRaised = p.getCampaign('c4').raisedCents;
  const initialLedger = p.getState().ledger.length;
  const renewal = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'renew-a' });
  assert.equal(renewal.isRenewal, true); assert.equal(renewal.parentContributionId, 'support-2');
  assert.equal(renewal.billingCycle, 2); assert.equal(renewal.status, 'pending');
  assert.equal(renewal.subscriptionStatus, null); assert.equal(renewal.amountCents, 3500);
  assert.equal(p.getCampaign('c4').raisedCents, initialRaised); assert.equal(p.getState().ledger.length, initialLedger);
  assert.equal(p.getSummary().activeSubscriptions, 1); assert.equal(p.getSummary().monthlyTotalCents, 3500);
  assert.throws(() => p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'renew-b' }), hasCode('RENEWAL_PENDING'));
});

test('renovação idempotente retorna a mesma cobrança e não permite trocar a assinatura da chave', () => {
  const p = createPlatform();
  const first = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'renew-same' });
  const second = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'renew-same' });
  assert.equal(first.id, second.id);
  const another = newSupport(p, { mode: 'monthly', idempotencyKey: 'monthly-new' }); p.simulatePayment(another.id);
  assert.throws(() => p.renewSubscription({ contributionId: another.id, idempotencyKey: 'renew-same' }), hasCode('IDEMPOTENCY_CONFLICT'));
  assert.equal(p.getState().contributions.filter(c => c.parentContributionId === 'support-2').length, 1);
});

test('confirmar renovação credita uma vez sem duplicar assinatura e mantém sequência dos ciclos', () => {
  const p = createPlatform(); const initialRaised = p.getCampaign('c4').raisedCents;
  const renewal = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'cycle-2' });
  const first = p.simulatePayment(renewal.id); const repeated = p.simulatePayment(renewal.id);
  assert.equal(first.duplicate, false); assert.equal(repeated.duplicate, true);
  assert.equal(first.subscriptionStatus, null);
  assert.equal(p.getCampaign('c4').raisedCents, initialRaised + 3500);
  assert.equal(p.getState().ledger.filter(l => l.contributionId === renewal.id && l.direction === 'in').length, 1);
  assert.equal(p.getSummary().activeSubscriptions, 1); assert.equal(p.getSummary().monthlyTotalCents, 3500);
  const third = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'cycle-3' });
  assert.equal(third.billingCycle, 3); p.simulatePayment(third.id, 'failed');
  const fourth = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'cycle-4' });
  assert.equal(fourth.billingCycle, 4);
  assert.equal(p.getCampaign('c4').raisedCents, initialRaised + 3500);
});

test('renovação exige assinatura original confirmada ativa e permissão', () => {
  const p = createPlatform();
  assert.throws(() => p.renewSubscription({ contributionId: 'support-1', idempotencyKey: 'once' }), hasCode('INVALID_SUBSCRIPTION'));
  const pending = newSupport(p, { mode: 'monthly', idempotencyKey: 'pending-monthly' });
  assert.throws(() => p.renewSubscription({ contributionId: pending.id, idempotencyKey: 'pending-renewal' }), hasCode('INACTIVE_SUBSCRIPTION'));
  const child = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'root-child' });
  assert.throws(() => p.renewSubscription({ contributionId: child.id, idempotencyKey: 'child-renewal' }), hasCode('INVALID_SUBSCRIPTION'));
  assert.throws(() => p.cancelSubscription(child.id), hasCode('INVALID_SUBSCRIPTION'));
  p.switchActor('creator1');
  assert.throws(() => p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'creator-renewal' }), hasCode('FORBIDDEN'));
});

test('cancelar assinatura invalida filho pendente sem mexer no histórico nem permitir novo crédito', () => {
  const p = createPlatform(); const initialRaised = p.getCampaign('c4').raisedCents;
  const child = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'cancel-renewal' });
  const before = p.getSummary().totalSupportedCents;
  p.cancelSubscription('support-2');
  const state = p.getState(), canceled = state.contributions.find(c => c.id === child.id);
  assert.equal(canceled.status, 'failed'); assert.equal(canceled.cancellationReason, 'subscription_canceled');
  assert.equal(state.contributions.find(c => c.id === 'support-2').status, 'confirmed');
  assert.equal(p.getCampaign('c4').raisedCents, initialRaised); assert.equal(p.getSummary().totalSupportedCents, before);
  assert.equal(p.getSummary().activeSubscriptions, 0); assert.equal(p.getSummary().monthlyTotalCents, 0);
  assert.throws(() => p.simulatePayment(child.id, 'confirmed'), hasCode('INVALID_TRANSITION'));
  assert.throws(() => p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'new-canceled' }), hasCode('INACTIVE_SUBSCRIPTION'));
  assert.equal(p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'cancel-renewal' }).id, child.id);
  p.switchActor('admin1'); assert.ok(p.audit().some(a => a.action === 'payment.canceled_with_subscription' && a.resourceId === child.id));
});

test('snapshot público filtra registros, remove mecanismos internos e não altera o ator da sessão', () => {
  const p = createPlatform(); newSupport(p);
  const publicSupporter = p.getPublicState();
  assert.equal(publicSupporter.actorId, 'supporter1'); assert.equal(publicSupporter.actor.id, 'supporter1');
  assert.ok(publicSupporter.contributions.every(c => c.supporterId === 'supporter1'));
  assert.ok(publicSupporter.ledger.every(l => l.ownerId === 'supporter1'));
  assert.deepEqual(publicSupporter.auditLog, []); assert.equal('idempotency' in publicSupporter, false); assert.equal('sequence' in publicSupporter, false);
  assert.equal(publicSupporter.summary.totalSupportedCents, p.getSummary().totalSupportedCents);
  const creator = p.getPublicState('creator1');
  assert.ok(creator.contributions.every(c => c.creatorId === 'creator1'));
  assert.ok(creator.ledger.every(l => l.ownerId === 'creator1'));
  assert.equal(creator.contributions.some(c => c.campaignId === 'c2'), false);
  const admin = p.getPublicState('admin1'); assert.ok(admin.auditLog.length > 0);
  assert.equal(admin.ledger.length, p.getState().ledger.length);
  assert.equal(p.getActor().id, 'supporter1');
  assert.throws(() => p.getPublicState('inexistente'), hasCode('INVALID_ACTOR'));
  publicSupporter.campaigns[0].title = 'externo'; assert.notEqual(p.getCampaign('c1').title, 'externo');
});

test('cobranças recorrentes sobrevivem à persistência sem restaurar assinaturas canceladas', () => {
  let saved;
  const storage = { getItem: () => saved ?? null, setItem: (_, value) => { saved = value; } };
  const p = createPlatform({ storage });
  const child = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'restore-child' });
  p.simulatePayment(child.id); p.cancelSubscription('support-2');
  const restored = createPlatform({ storage });
  assert.equal(restored.getSummary().activeSubscriptions, 0);
  assert.equal(restored.getState().contributions.find(c => c.id === child.id).status, 'confirmed');
  assert.equal(restored.getState().contributions.find(c => c.id === child.id).subscriptionStatus, null);
  assert.throws(() => restored.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'restore-new' }), hasCode('INACTIVE_SUBSCRIPTION'));
});
