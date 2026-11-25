import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMilestones, validMilestones } from '../src/domain/project-milestones.js';
import { renderMilestoneDraft, renderProjectMilestones } from '../src/components/project-milestones.js';

const goalCents = 4_500_000;
const milestone = overrides => ({ title: 'Versão alpha', description: 'Uma versão para testes da comunidade.', amountCents: 7_000_000, ...overrides });
const canonical = overrides => ({ id: 'milestone-7000000', ...milestone(), ...overrides });
const invalidMilestones = error => error?.code === 'INVALID_MILESTONES';

test('metas omitidas e listas vazias não acrescentam etapas', () => {
  assert.deepEqual(normalizeMilestones(undefined, goalCents), []);
  assert.deepEqual(normalizeMilestones([], goalCents), []);
});

test('metas são ordenadas, limpas e recebem IDs estáveis pelo valor', () => {
  const input = [milestone({ id: '<script>id</script>', title: '  Recursos extras  ', description: '  Mais recursos.  ', amountCents: 8_000_000 }), milestone({ id: 'id-enviado' })];
  const before = structuredClone(input);
  assert.deepEqual(normalizeMilestones(input, goalCents), [canonical(), { id: 'milestone-8000000', title: 'Recursos extras', description: 'Mais recursos.', amountCents: 8_000_000 }]);
  assert.deepEqual(input, before);
  assert.deepEqual(normalizeMilestones([milestone({ description: undefined })], goalCents), [canonical({ description: '' })]);
});

test('meta adicional exige valor único, inteiro seguro e acima da meta principal', () => {
  for (const amountCents of [goalCents, goalCents - 1, 0, -1, 7_000_000.5, '7000000', Number.NaN, Infinity, Number.MAX_SAFE_INTEGER, 100_000_001]) {
    assert.throws(() => normalizeMilestones([milestone({ amountCents })], goalCents), invalidMilestones, String(amountCents));
  }
  assert.throws(() => normalizeMilestones([milestone(), milestone({ title: 'Outra etapa' })], goalCents), invalidMilestones);
  assert.deepEqual(normalizeMilestones([milestone({ amountCents: 100_000_000 })], goalCents), [canonical({ id: 'milestone-100000000', amountCents: 100_000_000 })]);
});

test('normalização recusa entradas malformadas e mais de dez metas', () => {
  for (const value of [null, {}, 'etapas', [null], [[]], [12], Array(1), Array.from({ length: 11 }, (_, index) => milestone({ amountCents: 7_000_000 + index }))]) {
    assert.throws(() => normalizeMilestones(value, goalCents), invalidMilestones);
  }
  const ten = Array.from({ length: 10 }, (_, index) => milestone({ amountCents: 7_000_000 + index }));
  assert.equal(normalizeMilestones(ten, goalCents).length, 10);
});

test('metas aceitam os limites de texto simples e recusam HTML e controles', () => {
  assert.deepEqual(normalizeMilestones([milestone({ title: 'A'.repeat(100), description: 'D'.repeat(600) })], goalCents), [canonical({ title: 'A'.repeat(100), description: 'D'.repeat(600) })]);
  assert.deepEqual(normalizeMilestones([milestone({ title: 'abc', description: '' })], goalCents), [canonical({ title: 'abc', description: '' })]);
  for (const title of ['', '  ab  ', 'A'.repeat(101), null, '<script>alert(1)</script>', 'abc\u0000', 'abc\u007f']) {
    assert.throws(() => normalizeMilestones([milestone({ title })], goalCents), invalidMilestones);
  }
  for (const description of [null, 5, 'D'.repeat(601), '<img src=x onerror=alert(1)>', 'texto\u0001']) {
    assert.throws(() => normalizeMilestones([milestone({ description })], goalCents), invalidMilestones);
  }
});

test('validação de estado aceita apenas a representação canônica ordenada', () => {
  assert.equal(validMilestones([], goalCents), true);
  assert.equal(validMilestones([canonical(), canonical({ id: 'milestone-8000000', amountCents: 8_000_000 })], goalCents), true);
  for (const value of [undefined, null, {}, [milestone()], [canonical({ id: 'outro-id' })], [canonical({ title: ' Versão alpha ' })], [canonical({ description: undefined })], [canonical({ amountCents: goalCents })], [canonical(), canonical()], [canonical({ id: 'milestone-8000000', amountCents: 8_000_000 }), canonical()]]) {
    assert.equal(validMilestones(value, goalCents), false);
  }
});

const campaign = overrides => ({ id: 'c1', title: 'Jogo da comunidade', goalCents, raisedCents: 5_000_000, rewardRaisedCents: 2_000_000,
  milestones: [canonical(), canonical({ id: 'milestone-8000000', title: 'Recursos extras', description: '', amountCents: 8_000_000 })], ...overrides });
const steps = html => [...html.matchAll(/<li\b[^>]*data-milestone-id="([^"]*)"[^>]*data-milestone-status="([^"]*)"[\s\S]*?<\/li>/g)].map(match => ({ id: match[1], status: match[2], html: match[0] }));

test('projeto sem metas adicionais não mostra uma sequência vazia', () => {
  assert.equal(renderProjectMilestones(campaign({ milestones: [] })), '');
  assert.equal(renderProjectMilestones(campaign({ milestones: undefined })), '');
});

test('sequência mostra a principal alcançada e somente a primeira meta pendente como próxima', () => {
  const html = renderProjectMilestones(campaign());
  const stages = steps(html);
  assert.deepEqual(stages.map(({ id, status }) => ({ id, status })), [{ id: 'principal', status: 'reached' }, { id: 'milestone-7000000', status: 'next' }, { id: 'milestone-8000000', status: 'future' }]);
  assert.match(stages[0].html, /Meta principal[\s\S]*Alcançada/);
  assert.match(stages[1].html, /Próxima meta/);
  assert.match(stages[2].html, /Meta futura/);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.match(stages[1].html, /aria-current="step"/);
});

test('progresso de cada etapa usa o arrecadado uma vez e expõe meta, percentual e saldo em texto e ARIA', () => {
  const project = campaign();
  const before = structuredClone(project);
  const stages = steps(renderProjectMilestones(project));
  assert.deepEqual(project, before);
  assert.equal(stages.length, 3);
  assert.match(stages[1].html, /role="progressbar"[^>]*aria-label="Progresso de Versão alpha"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="71"/);
  assert.match(stages[1].html, /aria-valuetext="[^"]*50\.000,00[^\"]*70\.000,00[^\"]*71%/);
  assert.match(stages[1].html, /71% desta meta/);
  assert.match(stages[1].html, /Faltam R\$\s*20\.000,00/);
  assert.match(stages[2].html, /63% desta meta/);
  assert.match(stages[0].html, /aria-valuenow="100"/);
  assert.doesNotMatch(stages[1].html, /aria-valuenow="100"/);
});

test('sequência acompanha os limites exatos e não tem próxima meta quando todas foram alcançadas', () => {
  assert.deepEqual(steps(renderProjectMilestones(campaign({ raisedCents: 3_000_000 }))).map(step => step.status), ['next', 'future', 'future']);
  assert.deepEqual(steps(renderProjectMilestones(campaign({ raisedCents: 7_000_000 }))).map(step => step.status), ['reached', 'reached', 'next']);
  const complete = renderProjectMilestones(campaign({ raisedCents: 9_000_000 }));
  assert.deepEqual(steps(complete).map(step => step.status), ['reached', 'reached', 'reached']);
  assert.doesNotMatch(complete, /aria-current="step"|aria-valuenow="1\d\d"[^>]*aria-valuenow/);
});

test('conteúdo das metas é escapado como texto na sequência e nos campos de edição', () => {
  const unsafe = canonical({ id: '\" onclick=\"alert(1)', title: '<script>alpha()</script>', description: '</textarea><img src=x onerror=alert(1)> & "texto"' });
  const html = renderProjectMilestones(campaign({ milestones: [unsafe] }));
  assert.equal(typeof html, 'string');
  assert.match(html, /&lt;script&gt;alpha\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /data-milestone-id="&quot; onclick=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /<script>|<img|" onclick="/);
  const draft = renderMilestoneDraft(2, unsafe);
  assert.match(draft, /value="&lt;script&gt;alpha\(\)&lt;\/script&gt;"/);
  assert.match(draft, /&lt;\/textarea&gt;&lt;img/);
  assert.doesNotMatch(draft, /<script>|<img/);
});

test('formulário de meta fornece rótulos, limites e valores em reais para criar ou editar', () => {
  const draft = renderMilestoneDraft(2, canonical());
  assert.equal(typeof draft, 'string');
  assert.match(draft, /<fieldset[^>]*class="milestone-draft"[^>]*data-milestone-draft/);
  assert.match(draft, /<label for="milestone-draft-2-title">/);
  assert.match(draft, /<input[^>]*id="milestone-draft-2-title"[^>]*data-milestone-title[^>]*required[^>]*minlength="3"[^>]*maxlength="100"[^>]*value="Versão alpha"/);
  assert.match(draft, /<textarea[^>]*data-milestone-description[^>]*maxlength="600"[^>]*>Uma versão para testes da comunidade\.<\/textarea>/);
  assert.match(draft, /<input[^>]*data-milestone-amount[^>]*inputmode="decimal"[^>]*value="70000,00"/);
  assert.match(draft, /<button type="button"[^>]*data-action="remove-milestone"/);
  assert.match(renderMilestoneDraft(0), /data-milestone-amount[^>]*value=""/);
});
