import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFundingProgress, renderProjectDetail } from '../src/components/project-detail.js';

const campaign = overrides => ({
  id: 'c1', title: 'Projeto comunitário', creator: 'Marina Costa', creatorId: 'creator1',
  category: 'Impacto social', description: 'Uma descrição do projeto.', story: 'História do projeto.',
  image: 'assets/campaign-1.svg', goalCents: 10000, raisedCents: 4000, rewardRaisedCents: 1000,
  backers: 4, daysLeft: 18, rewards: [], ...overrides,
});
const render = options => renderProjectDetail({ campaign: campaign(), ...options });
const widths = html => ['direct', 'rewards'].map(kind => Number(html.match(new RegExp(`class="project-progress-${kind}" style="width:([\\d.]+)%"`))[1]));
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);

test('projeto mostra a localização pública atual do perfil e omite uma localização apagada',()=>{
  const project=campaign({location:'Localização anterior'});
  const html=render({campaign:project,profile:{location:{city:'Belo Horizonte',region:'MG',countryCode:'BR'}}});
  assert.equal(html.match(/Belo Horizonte, MG/g)?.length,2);
  assert.doesNotMatch(html,/Localização anterior/);
  assert.doesNotMatch(render({campaign:project,profile:{location:null}}),/Localização anterior|Brasil/);
});

test('imagem do projeto aceita a rota canônica e usa a capa padrão para origens externas',()=>{
  const ownImage='/api/project-images/project-123?v=1795521600000';
  assert.ok(render({campaign:campaign({image:ownImage})}).includes(`src="${ownImage}"`));
  for(const unsafe of ['https://example.com/capa.jpg','//example.com/capa.jpg','/api/project-images/../state?v=1','/api/project-images/c1?v=1&next=a','blob:preview','/api/profile/avatars/creator1?v=1']){
    assert.match(render({campaign:campaign({image:unsafe})}),/class="project-cover" src="assets\/campaign-4\.svg"/);
  }
});

test('dono ativo pode excluir o projeto e somente a administração pode restaurar',()=>{
  const owner={id:'creator1',role:'creator'},admin={id:'admin1',role:'admin'};
  for(const actor of [owner,admin])assert.match(render({actor}),/data-action="moderate-project" data-id="c1" data-value="delete"/);
  for(const actor of [{id:'creator2',role:'creator'},{...owner,suspended:true}])assert.doesNotMatch(render({actor}),/data-action="moderate-project"/);
  const deleted=campaign({deletedAt:'2026-11-23T12:00:00Z'});
  assert.doesNotMatch(render({actor:owner,campaign:deleted}),/data-action="moderate-project"/);
  assert.match(render({actor:admin,campaign:deleted}),/data-action="moderate-project" data-id="c1" data-value="restore"/);
});

test('engrenagem aparece somente para o criador responsável ativo',()=>{
  for(const actor of [{id:'creator1',role:'creator'}])assert.match(render({actor}),/data-action="project-settings"[^>]*data-id="c1"[^>]*aria-label="Configurar projeto"/);
  for(const actor of [{id:'admin1',role:'admin'},{id:'creator2',role:'creator'},{id:'supporter1',role:'supporter'},{id:'creator1',role:'creator',banned:true},{id:'creator1',role:'creator',suspended:true}])assert.doesNotMatch(render({actor}),/data-action="project-settings"/);
});

test('projeto excluído fica somente leitura sem esconder os valores históricos',()=>{
  const html=render({campaign:campaign({deletedAt:'2026-11-23T12:00:00Z',deletionReason:'Revisão administrativa.'}),actor:{id:'creator1',role:'creator'}});
  assert.match(html,/Projeto excluído da área pública/);
  assert.match(html,/data-action="support"[^>]*disabled/);
  assert.doesNotMatch(html,/data-action="project-settings"|data-action="create-project-update"|data-action="create-project-comment"/);
  assert.ok(html.includes(brl(4000)));
});

test('projeto sem recompensas não oferece aba ou seleção de recompensa', () => {
  const html = render({ selectedTab: 'recompensas' });
  assert.doesNotMatch(html, /data-tab="recompensas"|data-reward-id|id="project-c1-panel-recompensas"/);
  assert.match(html, /id="project-c1-tab-sobre"[^>]*aria-selected="true"/);
  assert.match(html, />Apoiar projeto<\/button>/);
});

test('perfil mostra data da conta, contagem e apenas links HTTP seguros', () => {
  const html = render({ projectCount: 3, profile: {
    bio: '<script>bio()</script>', joinedAt: '2026-11-01T12:00:00.000Z',
    links: [{ label: 'Portfólio', url: 'https://example.com/trabalho' },
      { label: 'Ataque', url: 'javascript:alert(1)' },
      { label: 'Credencial', url: 'https://usuario:senha@example.com/' }],
  } });
  assert.match(html, /Conta criada em/);
  assert.match(html, /01 de novembro de 2026/);
  assert.match(html, /Projetos criados<\/dt><dd>3<\/dd>/);
  assert.match(html, /href="https:\/\/example\.com\/trabalho" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /&lt;script&gt;bio\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /javascript:|usuario:senha|<script>/);
});

test('atualizações e comentários ficam no projeto correto e preservam conteúdo como texto', () => {
  const html = render({
    updates: [{ id: 'u1', campaignId: 'c1', title: '<script>titulo()</script>', body: '<iframe>novidade</iframe>', createdAt: '2026-11-20T12:00:00Z' },
      { id: 'u2', campaignId: 'c2', title: 'Atualização de outro projeto', body: 'Outro conteúdo' }],
    comments: [{ id: 'm1', campaignId: 'c1', authorName: '<script>autor()</script>', body: '<iframe>pergunta</iframe>', createdAt: '2026-11-21T12:00:00Z' },
      { id: 'm2', campaignId: 'c2', authorName: 'Outro autor', body: 'Comentário de outro projeto' }],
  });
  assert.match(html, /&lt;script&gt;titulo\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;iframe&gt;novidade&lt;\/iframe&gt;/);
  assert.match(html, /&lt;script&gt;autor\(\)&lt;\/script&gt;/);
  assert.match(html, /&lt;iframe&gt;pergunta&lt;\/iframe&gt;/);
  assert.doesNotMatch(html, /<script>|<iframe>|Atualização de outro projeto|Comentário de outro projeto/);
});

test('criador publica suas atualizações e administrador não edita o perfil', () => {
  const owner = render({ actor: { id: 'creator1', role: 'creator' } });
  assert.match(owner, /data-action="edit-creator-profile"/);
  assert.match(owner, /data-action="create-project-update"/);
  for (const actor of [{ id: 'creator2', role: 'creator' }, { id: 'supporter1', role: 'supporter' }]) {
    assert.doesNotMatch(render({ actor }), /data-action="edit-creator-profile"|data-action="create-project-update"/);
  }
  const admin=render({actor:{id:'admin1',role:'admin'}});
  assert.doesNotMatch(admin,/data-action="edit-creator-profile"/);
  assert.doesNotMatch(admin,/data-action="create-project-update"/);
});

test('ações do perfil ficam no cabeçalho do criador e respeitam a permissão de edição', () => {
  for (const actor of [
    { id: 'creator1', role: 'creator' },
    { id: 'creator2', role: 'creator' },
    { id: 'supporter1', role: 'supporter' },
    { id: 'admin1', role: 'admin' },
    { id: 'creator1', role: 'creator', suspended: true },
  ]) {
    const html = render({ actor, selectedTab: 'criador' });
    const panel = html.match(/<section[^>]*id="project-c1-panel-criador"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    const heading = panel?.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
    assert.ok(heading, 'O criador deve ter um cabeçalho com título e ações do perfil.');
    assert.match(heading, /<h2>Sobre o criador<\/h2>/);
    assert.match(heading, /role="group" aria-label="Ações do perfil do criador"/);
    assert.match(heading, /data-action="creator" data-id="creator1">Ver perfil completo<\/button>/);
    if (actor.id === 'creator1' && actor.role === 'creator' && !actor.suspended) {
      assert.match(heading, /data-action="edit-creator-profile" data-id="creator1">Editar perfil<\/button>/);
    } else {
      assert.doesNotMatch(heading, /data-action="edit-creator-profile"/);
    }
    assert.equal(panel.match(/>Ver perfil completo<\/button>/g)?.length, 1);
    assert.ok(panel.indexOf('</header>') < panel.indexOf('project-creator-avatar'));
  }
});

test('administração exclui projeto e remove comentários sem controles de conta ou logs',()=>{
  const options={comments:[{id:'m1',campaignId:'c1',authorId:'supporter1',authorName:'Ana',body:'Pergunta',createdAt:'2026-11-23T12:00:00Z'}],accounts:[{id:'supporter1',role:'supporter',suspended:true}],creatorAccount:{id:'creator1',role:'creator',banned:true},selectedTab:'comentarios'};
  const html=render({...options,actor:{id:'admin1',role:'admin'}});
  assert.match(html,/data-action="moderate-project" data-id="c1" data-value="delete"/);
  assert.match(html,/data-action="moderate-comment" data-id="m1" data-value="remove"/);
  assert.doesNotMatch(html,/data-action="moderate-account"/);
  assert.match(html,/data-action="account-profile" data-id="supporter1"/);
  assert.doesNotMatch(html,/Administrar criador|data-action="project-settings"/);
  assert.doesNotMatch(html,/data-action="account-logs"/);
  assert.doesNotMatch(render({...options,actor:{id:'supporter1',role:'supporter'}}),/data-action="moderate-|data-action="account-logs"/);
  const removed=render({...options,campaign:campaign({deletedAt:'2026-11-23T12:00:00Z'}),comments:[{...options.comments[0],removedAt:'2026-11-23T12:00:00Z'}],actor:{id:'admin1',role:'admin'}});
  assert.match(removed,/data-action="moderate-project" data-id="c1" data-value="restore"/);
  assert.match(removed,/data-action="moderate-comment" data-id="m1" data-value="restore"/);
});

test('suspensão permite ler o projeto sem oferecer ações de escrita',()=>{
  const html=render({actor:{id:'creator1',role:'creator',suspended:true},campaign:campaign({rewards:[{id:'r1',title:'Guia',description:'Material',amountCents:1000,monthly:false}]})});
  assert.match(html,/História do projeto/);
  assert.doesNotMatch(html,/data-action="create-project-comment"|data-action="create-project-update"|data-action="edit-creator-profile"|data-action="project-settings"/);
  assert.match(html,/data-action="support"[^>]*disabled/);
});

test('participantes podem comentar e a interface administrativa não oferece publicação', () => {
  for (const actor of [{ id: 'supporter1', role: 'supporter' }, { id: 'creator1', role: 'creator' }]) {
    assert.match(render({ actor }), /data-action="create-project-comment" data-id="c1"/);
  }
  assert.doesNotMatch(render({ actor: { id: 'admin1', role: 'admin' } }), /data-action="create-project-comment"/);
});

test('seleção de recompensa informa referência, preço e modalidade do contrato', () => {
  const html = render({ campaign: campaign({ rewards: [{ id: 'c1-r1', title: 'Guia', description: 'Uma publicação mensal.', amountCents: 2500, monthly: true }] }), selectedTab: 'recompensas' });
  assert.match(html, /id="project-c1-tab-recompensas"[^>]*aria-selected="true"/);
  assert.match(html, /data-action="support" data-id="c1" data-reward-id="c1-r1" data-amount="2500" data-mode="monthly"/);
  assert.match(html, />Apoiar sem recompensa<\/button>/);
});

test('recompensa integra o total: 40 de 100 contém 30 diretos e 10 de recompensas', () => {
  const html = renderFundingProgress(campaign());
  assert.deepEqual(widths(html), [30, 10]);
  assert.match(html, /aria-valuenow="40"/);
  assert.ok(html.includes(`${brl(4000)} arrecadados`));
  assert.ok(html.includes(`Apoios diretos: ${brl(3000)}`));
  assert.ok(html.includes(`Recompensas: ${brl(1000)}, incluídos no total`));
  assert.ok(html.includes(`Faltam ${brl(6000)}`));
});

test('acima da meta, a barra ocupa 100% e mantém a proporção sem duplicar receita', () => {
  const html = renderFundingProgress(campaign({ raisedCents: 15000, rewardRaisedCents: 6000 }));
  assert.deepEqual(widths(html), [60, 40]);
  assert.equal(widths(html).reduce((sum, value) => sum + value, 0), 100);
  assert.match(html, /aria-valuenow="100"/);
  assert.match(html, /150% da meta/);
  assert.ok(html.includes(`${brl(15000)} arrecadados`));
  assert.ok(html.includes(`Apoios diretos: ${brl(9000)}`));
  assert.ok(html.includes('Meta alcançada'));
});
