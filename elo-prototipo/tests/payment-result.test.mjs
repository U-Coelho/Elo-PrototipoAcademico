import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPaymentResult } from '../src/components/payment-result.js';

const contribution = overrides => ({
  id: 'support-73', transactionId: 'SIM-73', campaignId: 'c1',
  campaignTitle: 'Biblioteca do bairro', amountCents: 12345, mode: 'once',
  status: 'confirmed', refundStatus: 'none', rewardTitle: 'Livro da comunidade',
  ...overrides,
});
const render = overrides => renderPaymentResult(contribution(overrides));

test('recusa identifica a tentativa sem apresentar crédito ou direito à recompensa', () => {
  const { title, body } = render({ status: 'failed' });
  assert.equal(title, 'Pagamento recusado');
  assert.match(body, /Nenhum valor foi creditado/);
  assert.match(body, /Referência da tentativa[\s\S]*SIM-73/);
  assert.match(body, /Recompensa escolhida:[\s\S]*Livro da comunidade/);
  assert.match(body, /A seleção não confirma a entrega/);
  assert.ok(body.includes('R$\u00a0123,45'));
  assert.doesNotMatch(body, /Pagamento confirmado|Apoio confirmado|Referência do pagamento/);
});

test('pendência mantém a referência da tentativa e informa que não houve crédito', () => {
  const { title, body } = render({ status: 'pending' });
  assert.equal(title, 'Apoio aguardando confirmação');
  assert.match(body, /Nenhum valor foi creditado/);
  assert.match(body, /Meus apoios/);
  assert.match(body, /Referência da tentativa[\s\S]*SIM-73/);
  assert.match(body, /Recompensa escolhida:/);
  assert.match(body, /A seleção não confirma a entrega/);
  assert.doesNotMatch(body, /Pagamento confirmado|Referência do pagamento/);
});

test('confirmação preserva o projeto, a recompensa e a referência do pagamento', () => {
  const { title, body } = render();
  assert.equal(title, 'Apoio confirmado');
  assert.match(body, /Pagamento confirmado/);
  assert.match(body, /Seu apoio a Biblioteca do bairro foi registrado/);
  assert.match(body, /Recompensa: Livro da comunidade/);
  assert.match(body, /Referência do pagamento[\s\S]*SIM-73/);
  assert.doesNotMatch(body, /Referência da tentativa|Nenhum valor foi creditado/);
  assert.match(body, /data-action="modal-navigate" data-page="projeto\/c1"/);
  assert.match(body, /data-action="modal-navigate" data-page="apoios"/);
});

test('a modalidade mensal é mostrada no apoio original e não é repetida em uma cobrança', () => {
  assert.match(render({ mode: 'monthly' }).body, /<small> \/ mês<\/small>/);
  assert.doesNotMatch(render({ mode: 'monthly', isRenewal: true }).body, /\/ mês/);
});

test('devolução tem prioridade sobre o estado confirmado e não exibe sucesso novo', () => {
  for (const state of [{ refundStatus: 'completed' }, { status: 'refunded' }]) {
    const { title, body } = render(state);
    assert.equal(title, 'Apoio devolvido');
    assert.match(body, /valor foi devolvido/i);
    assert.match(body, /Referência do pagamento[\s\S]*SIM-73/);
    assert.doesNotMatch(body, /Pagamento confirmado|Seu apoio .* foi registrado/);
  }
});

test('pagamento e cobranças cancelados não parecem confirmações recentes', () => {
  for (const state of [
    { status: 'canceled', cancellationReason: 'project_deleted' },
    { status: 'failed', cancellationReason: 'subscription_canceled' },
  ]) {
    const { title, body } = render(state);
    assert.equal(title, 'Pagamento cancelado');
    assert.match(body, /Nenhum valor foi creditado/);
    assert.match(body, /Referência da tentativa[\s\S]*SIM-73/);
    assert.doesNotMatch(body, /Pagamento confirmado|Seu apoio .* foi registrado/);
  }
  const recurring = render({ mode: 'monthly', subscriptionStatus: 'canceled' });
  assert.equal(recurring.title, 'Recorrência cancelada');
  assert.match(recurring.body, /pagamento confirmado permanece no histórico/);
  assert.doesNotMatch(recurring.body, /<h3>Pagamento confirmado<\/h3>|Seu apoio .* foi registrado/);
});

test('estado desconhecido nunca é apresentado como confirmação de pagamento', () => {
  const { title, body } = render({ status: 'unknown', rewardTitle: null });
  assert.equal(title, 'Pagamento não confirmado');
  assert.match(body, /Consulte Meus apoios/);
  assert.doesNotMatch(body, /Pagamento confirmado|Seu apoio .* foi registrado|Recompensa:/);
});

test('conteúdo do apoio é escapado e a navegação conserva identificadores como dados', () => {
  const { body } = render({
    campaignId: 'c1" autofocus onfocus="alert(1)',
    campaignTitle: '<img src=x onerror=alert(1)>',
    rewardTitle: '<script>recompensa()</script>',
    transactionId: 'SIM-73<&"\'>',
  });
  assert.match(body, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(body, /&lt;script&gt;recompensa\(\)&lt;\/script&gt;/);
  assert.match(body, /SIM-73&lt;&amp;&quot;&#39;&gt;/);
  assert.match(body, /data-page="projeto\/c1&quot; autofocus onfocus=&quot;alert\(1\)"/);
  assert.doesNotMatch(body, /<script>|<img|data-page="projeto\/c1" autofocus/);
});
