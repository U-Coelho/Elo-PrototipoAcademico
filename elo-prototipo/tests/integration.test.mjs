import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createEmbeddedPool } from '../server/db/embedded.mjs';
import { createPostgresRepository } from '../server/repository/postgres.js';
import { createApp } from '../server/http/app.mjs';
import { buildRevenueReport } from '../src/domain/revenue-report.js';

let pool,repository,server,base;
const secret='teste-local-ficticio-com-mais-de-32-caracteres';
before(async()=>{
  pool=await createEmbeddedPool(); repository=createPostgresRepository(pool); await repository.initialize();
  server=createApp({repository,sessionSecret:secret,health:()=>pool.query('SELECT 1'),logger:{error(){}}});
  server.listen(0,'127.0.0.1'); await once(server,'listening'); base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{ if(server?.listening) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); } await pool?.end(); });

async function client(apiBase=base) {
  let cookie='',csrfToken='',state;
  async function request(path,options={}) {
    const response=await fetch(apiBase+path,{...options,headers:{...(cookie?{Cookie:cookie}:{}),...options.headers}});
    const set=response.headers.get('set-cookie'); if(set) cookie=set.split(';')[0];
    let body;try{body=await response.json();}catch{body=null;}
    if(body?.state) state=body.state;if(body?.csrfToken) csrfToken=body.csrfToken;
    return {response,body};
  }
  await request('/api/state');
  return {request,get state(){return state;},get cookie(){return cookie;},get csrfToken(){return csrfToken;},command:(command,payload={},headers={})=>request('/api/commands',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken,...headers},body:JSON.stringify({command,payload})})};
}

test('migrações são idempotentes e criam tabelas relacionais com restrições',async()=>{
  await createPostgresRepository(pool).initialize();
  const tables=(await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(r=>r.table_name);
  for(const table of ['demo_workspaces','demo_users','campaigns','contributions','ledger_entries','payouts','audit_events','favorites','idempotency_records','creator_profiles','project_updates','project_comments','account_moderations','direct_messages']) assert.ok(tables.includes(table));
  const c=await client(); const id=c.state.contributions[0].id;
  const result=await c.command('createContribution',{campaignId:'c1',amountCents:-1,idempotencyKey:'bad'});
  assert.equal(result.response.status,400); assert.equal(result.body.error.code,'INVALID_AMOUNT');
  assert.ok(c.state.contributions.some(s=>s.id===id));
});

test('API inicia sessão HttpOnly e retorna somente o estado permitido',async()=>{
  const c=await client();assert.ok(c.cookie.startsWith('elo_demo='));assert.equal(c.state.persistence,'postgresql');
  assert.equal(c.state.actorId,'supporter1');assert.equal(c.state.campaigns.length,6);assert.equal(c.state.idempotency,undefined);assert.equal(c.state.sequence,undefined);
  assert.ok(c.state.contributions.every(s=>s.supporterId==='supporter1'));assert.ok(c.state.ledger.every(l=>l.ownerId==='supporter1'));assert.deepEqual(c.state.auditLog,[]);
  const r=await fetch(base+'/api/state');assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
});

test('CSRF, origem externa, JSON inválido e operações desconhecidas são rejeitados',async()=>{
  const c=await client();
  assert.equal((await c.command('reset',{}, {'X-CSRF-Token':'incorreto'})).response.status,403);
  assert.equal((await c.command('reset',{}, {Origin:'https://outro-site.example'})).response.status,403);
  assert.equal((await c.command('constructor',{})).response.status,400);
  const malformed=await c.request('/api/commands',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':c.csrfToken},body:'{'});
  assert.equal(malformed.response.status,400);assert.equal(malformed.body.error.code,'INVALID_JSON');
  const oversized=await c.request('/api/commands',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':c.csrfToken},body:JSON.stringify({command:'reset',payload:{text:'x'.repeat(33000)}})});
  assert.equal(oversized.response.status,413);
});

test('um apoio pendente só entra na arrecadação depois de confirmação pela API',async()=>{
  const c=await client(),before=c.state.campaigns.find(p=>p.id==='c1').raisedCents;
  const created=await c.command('createContribution',{campaignId:'c1',amountCents:7550,mode:'once',idempotencyKey:'support-new',actorId:'admin1'});
  assert.equal(created.response.status,200);assert.equal(created.body.result.supporterId,'supporter1');
  assert.equal(c.state.campaigns.find(p=>p.id==='c1').raisedCents,before);
  const confirmed=await c.command('simulatePayment',{id:created.body.result.id,outcome:'confirmed'});
  assert.equal(confirmed.response.status,200);assert.equal(c.state.campaigns.find(p=>p.id==='c1').raisedCents,before+7550);
});

test('confirmações HTTP simultâneas geram um único crédito no banco embarcado',async()=>{
  const c=await client(); const created=await c.command('createContribution',{campaignId:'c1',amountCents:5000,mode:'once',idempotencyKey:'same-confirm'});
  const id=created.body.result.id,before=c.state.campaigns.find(p=>p.id==='c1').raisedCents;
  const responses=await Promise.all([c.command('simulatePayment',{id,outcome:'confirmed'}),c.command('simulatePayment',{id,outcome:'confirmed'})]);
  assert.ok(responses.every(r=>r.response.status===200));assert.equal(responses.filter(r=>r.body.result.duplicate).length,1);
  await c.request('/api/state');assert.equal(c.state.campaigns.find(p=>p.id==='c1').raisedCents,before+5000);
  assert.equal(c.state.ledger.filter(l=>l.contributionId===id).length,1);
});

test('retentativa com mesma chave retorna o apoio e mudança de valor gera conflito',async()=>{
  const c=await client();const payload={campaignId:'c1',amountCents:5000,mode:'once',idempotencyKey:'same-key'};
  const a=await c.command('createContribution',payload),b=await c.command('createContribution',payload);
  assert.equal(a.body.result.id,b.body.result.id);
  assert.equal((await c.command('createContribution',{...payload,amountCents:10000})).response.status,409);
  await c.request('/api/state');assert.equal(c.state.contributions.filter(s=>s.id===a.body.result.id).length,1);
});

test('personagem vem da sessão e a criadora não pode alterar apoio da apoiadora',async()=>{
  const c=await client();const swapped=await c.command('switchActor',{id:'creator1'});assert.equal(swapped.response.status,200);
  assert.equal((await c.command('simulatePayment',{id:'support-3',outcome:'confirmed',actorId:'supporter1'})).response.status,403);
  assert.ok(c.state.contributions.every(s=>s.creatorId==='creator1'));
  assert.ok(c.state.ledger.every(l=>l.ownerId==='creator1'));
});

test('repasses simultâneos respeitam o saldo e erros fazem rollback',async()=>{
  const c=await client();await c.command('switchActor',{id:'creator1'});const before=c.state.summary.availableBalanceCents;
  const responses=await Promise.all([c.command('requestPayout',{amountCents:150000,idempotencyKey:'payout-a'}),c.command('requestPayout',{amountCents:150000,idempotencyKey:'payout-b'})]);
  assert.deepEqual(responses.map(r=>r.response.status).sort(),[200,409]);await c.request('/api/state');
  assert.equal(c.state.summary.availableBalanceCents,before-150000);assert.equal(c.state.payouts.length,1);
});

test('cada renovação tem ciclo próprio; cancelar invalida apenas pendências futuras',async()=>{
  const c=await client(),before=c.state.summary.totalSupportedCents;
  const renewal=await c.command('renewSubscription',{contributionId:'support-2',idempotencyKey:'cycle-2'});
  assert.equal(renewal.response.status,200);assert.equal(renewal.body.result.billingCycle,2);assert.equal(renewal.body.result.status,'pending');assert.equal(c.state.summary.activeSubscriptions,1);
  await c.command('simulatePayment',{id:renewal.body.result.id,outcome:'confirmed'});assert.equal(c.state.summary.totalSupportedCents,before+3500);
  const next=await c.command('renewSubscription',{contributionId:'support-2',idempotencyKey:'cycle-3'});assert.equal(next.body.result.billingCycle,3);
  assert.equal((await c.command('cancelSubscription',{id:'support-2'})).response.status,200);
  assert.equal(c.state.contributions.find(s=>s.id===next.body.result.id).status,'failed');assert.equal(c.state.summary.activeSubscriptions,0);
  assert.equal((await c.command('simulatePayment',{id:next.body.result.id,outcome:'confirmed'})).response.status,409);
  assert.equal(c.state.summary.totalSupportedCents,before+3500);
});

test('navegadores têm cenários isolados e a auditoria é exclusiva da administração',async()=>{
  const a=await client(),b=await client();
  await a.command('createContribution',{campaignId:'c1',amountCents:5000,mode:'once',idempotencyKey:'isolated'});
  await b.request('/api/state');assert.equal(b.state.contributions.length,3);
  await a.command('switchActor',{id:'admin1'});assert.ok(a.state.auditLog.some(e=>e.action==='contribution.created'));
  await a.command('switchActor',{id:'supporter1'});assert.deepEqual(a.state.auditLog,[]);
});

test('persistência continua disponível para outra instância da API com o mesmo segredo',async()=>{
  const c=await client();await c.command('switchActor',{id:'creator1'});
  const created=await c.command('createCampaign',{title:'Projeto persistente fictício',description:'Uma ideia demonstrativa que deve continuar registrada no banco.',category:'Educação',goalCents:500000,daysLeft:30,monthly:true});
  assert.equal(created.response.status,200);const id=created.body.result.id;
  const second=createApp({repository:createPostgresRepository(pool),sessionSecret:secret,logger:{error(){}}});second.listen(0,'127.0.0.1');await once(second,'listening');
  try { const r=await fetch(`http://127.0.0.1:${second.address().port}/api/state`,{headers:{Cookie:c.cookie}});const body=await r.json();assert.equal(r.status,200);assert.equal(body.state.actorId,'creator1');assert.ok(body.state.campaigns.some(p=>p.id===id)); }
  finally {second.closeAllConnections();await new Promise(resolve=>second.close(resolve));}
});

test('arquivos privados não são servidos e erros não revelam caminhos locais',async()=>{
  for(const resource of ['/.env','/server/index.mjs','/inexistente.js']) {
    const r=await fetch(base+resource);const body=await r.text();assert.equal(r.status,404);assert.doesNotMatch(body,/Users|croft|ENOENT|DATABASE_URL/);
  }
  const health=await fetch(base+'/api/health');assert.equal(health.status,200);
  const root=await fetch(base+'/');assert.equal(root.status,200);assert.match(root.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(root.headers.get('content-security-policy'),/img-src 'self' data: blob:/,'A prévia de foto local usa uma URL blob sem permitir imagens externas.');
  assert.match(await root.text(),/img-src 'self' data: blob:/,'A política no HTML também precisa permitir a prévia local.');
});

test('gráfico e lista de apoios usam os mesmos créditos persistidos e filtram por projeto',async()=>{
  const c=await client();
  const first=await c.command('createContribution',{campaignId:'c1',amountCents:5000,mode:'once',idempotencyKey:'revenue-c1'});
  const second=await c.command('createContribution',{campaignId:'c4',amountCents:3500,mode:'monthly',idempotencyKey:'revenue-c4'});
  await c.command('simulatePayment',{id:first.body.result.id,outcome:'confirmed'});
  await c.command('simulatePayment',{id:first.body.result.id,outcome:'confirmed'});
  await c.command('simulatePayment',{id:second.body.result.id,outcome:'confirmed'});
  await c.command('createContribution',{campaignId:'c1',amountCents:9900,mode:'once',idempotencyKey:'revenue-pending'});
  await c.command('switchActor',{id:'creator1'});
  const build=campaignId=>buildRevenueReport({...c.state,creatorId:'creator1',campaignId,days:7,now:new Date()});
  const all=build(null),project=build('c1');
  assert.equal(all.totalCents,8500);assert.equal(all.paymentCount,2);
  assert.equal(all.points.reduce((total,p)=>total+p.amountCents,0),all.totalCents);
  assert.equal(all.entries.reduce((total,e)=>total+e.amountCents,0),all.totalCents);
  assert.equal(project.totalCents,5000);assert.equal(project.entries.length,1);assert.equal(project.entries[0].campaignId,'c1');
  assert.equal(build('c4').totalCents,3500);
  await c.command('requestPayout',{amountCents:5000,idempotencyKey:'revenue-payout'});
  await c.request('/api/state');
  assert.equal(build(null).totalCents,8500,'Repasse altera o saldo da conta, não a arrecadação bruta do período.');
});

test('perfil, atualizações e comentários persistem na API e respeitam a persona da sessão',async()=>{
  const c=await client();await c.command('switchActor',{id:'creator1'});
  const joinedAt=c.state.creatorProfiles.find(p=>p.creatorId==='creator1').joinedAt;
  const saved=await c.command('updateCreatorProfile',{bio:'Criadora de projetos de arte e educação.',links:[{label:'Portfólio',url:'https://portfolio.example/marina'}]});
  assert.equal(saved.response.status,200);
  const profile=c.state.creatorProfiles.find(p=>p.creatorId==='creator1');
  assert.equal(profile.bio,'Criadora de projetos de arte e educação.');assert.equal(profile.joinedAt,joinedAt);
  assert.deepEqual(profile.links,[{label:'Portfólio',url:'https://portfolio.example/marina'}]);
  const update=await c.command('createProjectUpdate',{campaignId:'c1',title:'Etapa de implantação',body:'O planejamento das três hortas está concluído.',creatorId:'creator2'});
  assert.equal(update.response.status,200);assert.equal(update.body.result.creatorId,'creator1');
  assert.equal((await c.command('createProjectUpdate',{campaignId:'c2',title:'Sem permissão',body:'Esta campanha pertence a outra pessoa.'})).response.status,403);
  const invalid=await c.command('updateCreatorProfile',{bio:profile.bio,links:[{label:'Link inválido',url:'javascript:alert(1)'}]});
  assert.equal(invalid.response.status,400);assert.equal(invalid.body.error.code,'INVALID_LINK');
  await c.command('switchActor',{id:'supporter1'});
  const comment=await c.command('createProjectComment',{campaignId:'c1',body:'Como serão escolhidos os espaços de cultivo?',authorId:'creator1',authorName:'Identidade forjada'});
  assert.equal(comment.response.status,200);assert.equal(comment.body.result.authorId,'supporter1');assert.equal(comment.body.result.authorName,'Ana Souza');
  assert.equal((await c.command('updateCreatorProfile',{bio:'Bio da apoiadora',links:[]})).response.status,200);
  assert.equal((await c.command('createProjectUpdate',{campaignId:'c1',title:'Sem permissão',body:'Comentário não é atualização.'})).response.status,403);
  const second=createApp({repository:createPostgresRepository(pool),sessionSecret:secret,logger:{error(){}}});second.listen(0,'127.0.0.1');await once(second,'listening');
  try {
    const response=await fetch(`http://127.0.0.1:${second.address().port}/api/state`,{headers:{Cookie:c.cookie}});const {state}=await response.json();
    assert.equal(response.status,200);assert.equal(state.creatorProfiles.find(p=>p.creatorId==='creator1').bio,profile.bio);
    assert.ok(state.projectUpdates.some(u=>u.id===update.body.result.id&&u.body==='O planejamento das três hortas está concluído.'));
    assert.ok(state.projectComments.some(m=>m.id===comment.body.result.id&&m.authorName==='Ana Souza'));
  } finally {second.closeAllConnections();await new Promise(resolve=>second.close(resolve));}
  const isolated=await client();assert.ok(!isolated.state.projectComments.some(m=>m.body==='Como serão escolhidos os espaços de cultivo?'));
  assert.ok(!isolated.state.creatorProfiles.some(p=>p.bio===profile.bio));
});

test('recompensas opcionais financiam uma única vez e persistem separadas dos apoios diretos',async()=>{
  const c=await client();await c.command('switchActor',{id:'creator1'});
  const baseCampaign={title:'Ateliê comunitário',description:'Oficinas para ampliar o acesso à criação artística na comunidade.',category:'Arte e cultura',goalCents:500000,daysLeft:30,monthly:true};
  const noRewards=await c.command('createCampaign',{...baseCampaign,title:'Projeto sem recompensas'});
  assert.equal(noRewards.response.status,200);assert.deepEqual(noRewards.body.result.rewards,[]);
  const created=await c.command('createCampaign',{...baseCampaign,rewards:[{title:'Guia de criação',description:'Um guia digital das oficinas realizadas pelo projeto.',amountCents:5000,monthly:false}]});
  assert.equal(created.response.status,200);assert.equal(created.body.result.rewards.length,1);
  const campaignId=created.body.result.id,rewardId=created.body.result.rewards[0].id,balance=c.state.summary.availableBalanceCents;
  await c.command('switchActor',{id:'supporter1'});
  const rewardPayload={campaignId,amountCents:5000,mode:'once',rewardId,idempotencyKey:'reward-funding'};
  const below=await c.command('createContribution',{...rewardPayload,amountCents:4999,idempotencyKey:'reward-below'});
  assert.equal(below.response.status,400);assert.equal(below.body.error.code,'INVALID_REWARD_AMOUNT');
  assert.equal((await c.command('createContribution',{...rewardPayload,rewardId:'missing-reward',idempotencyKey:'reward-missing'})).response.status,400);
  const support=await c.command('createContribution',rewardPayload);assert.equal(support.response.status,200);assert.equal(support.body.result.rewardId,rewardId);
  assert.equal(c.state.campaigns.find(p=>p.id===campaignId).raisedCents,0);
  await c.command('simulatePayment',{id:support.body.result.id,outcome:'confirmed'});
  await c.command('simulatePayment',{id:support.body.result.id,outcome:'confirmed'});
  const direct=await c.command('createContribution',{campaignId,amountCents:2500,mode:'once',idempotencyKey:'direct-funding'});
  await c.command('simulatePayment',{id:direct.body.result.id,outcome:'confirmed'});
  const refused=await c.command('createContribution',{...rewardPayload,idempotencyKey:'reward-refused'});
  await c.command('simulatePayment',{id:refused.body.result.id,outcome:'failed'});
  await c.request('/api/state');
  const persisted=c.state.campaigns.find(p=>p.id===campaignId);
  assert.equal(persisted.raisedCents,7500);assert.equal(persisted.rewardRaisedCents,5000);
  const persistedSupport=c.state.contributions.find(p=>p.id===support.body.result.id);
  assert.equal(persistedSupport.rewardId,rewardId);assert.equal(persistedSupport.rewardTitle,'Guia de criação');
  await c.command('switchActor',{id:'creator1'});
  assert.equal(c.state.summary.availableBalanceCents,balance+7500);
  const credits=c.state.ledger.filter(l=>l.campaignId===campaignId&&l.direction==='in');
  assert.equal(credits.length,2);assert.equal(credits.reduce((sum,l)=>sum+l.amountCents,0),7500);
  assert.equal(credits.find(l=>l.contributionId===support.body.result.id).rewardId,rewardId);
});

async function withAdminApi(run,options={}) {
  // Keep this larger scenario independent of the shared app's request-rate budget.
  const app=createApp({repository:createPostgresRepository(pool),sessionSecret:secret,logger:{error(){}},...options});
  app.listen(0,'127.0.0.1');await once(app,'listening');
  try {await run(await client(`http://127.0.0.1:${app.address().port}`));}
  finally {app.closeAllConnections();await new Promise(resolve=>app.close(resolve));}
}

test('configuração e moderação preservam históricos, devolvem apoios e mantêm logs específicos',async()=>withAdminApi(async c=>{
  await c.command('switchActor',{id:'creator1'});
  const created=await c.command('createCampaign',{title:'Jogo da comunidade',description:'Um jogo cooperativo para encontros e aprendizagem no bairro.',category:'Jogos',goalCents:50000,daysLeft:30,monthly:false});
  assert.equal(created.response.status,200,'A migração deve permitir a categoria Jogos no PostgreSQL.');
  const id=created.body.result.id;
  const configured={campaignId:id,title:'Jogo cooperativo da comunidade',description:'Um jogo cooperativo para encontros e aprendizagem no bairro.',story:'As oficinas de criação vão produzir as peças e as regras do jogo.',category:'Jogos',goalCents:60000,daysLeft:25,monthly:false};
  const edited=await c.command('updateCampaign',{...configured,raisedCents:999999,creatorId:'admin1'});
  assert.equal(edited.response.status,200);assert.equal(edited.body.result.title,configured.title);
  assert.equal(c.state.campaigns.find(p=>p.id===id).raisedCents,0,'Campos financeiros fornecidos pelo cliente não podem ser encaminhados.');
  assert.equal((await c.command('updateCampaign',{...configured,campaignId:'c2'})).response.status,403);
  await c.command('switchActor',{id:'supporter1'});
  assert.equal((await c.command('updateCampaign',configured)).response.status,403);
  const support=await c.command('createContribution',{campaignId:id,amountCents:5000,idempotencyKey:'moderation-funding'});
  assert.equal(support.response.status,200);await c.command('simulatePayment',{id:support.body.result.id});
  const comment=await c.command('createProjectComment',{campaignId:id,body:'Como será organizada a primeira oficina?'});
  assert.equal(comment.response.status,200);
  assert.equal((await c.command('moderateCampaign',{campaignId:id,deleted:true,reason:'Sem permissão para excluir.'})).response.status,403);
  await c.command('switchActor',{id:'admin1'});
  const deleted=await c.command('moderateCampaign',{campaignId:id,deleted:true,reason:'Revisão da proposta publicada.'});
  assert.equal(deleted.response.status,200);assert.ok(c.state.campaigns.find(p=>p.id===id).deletedAt);
  assert.equal(c.state.campaigns.find(p=>p.id===id).raisedCents,0);
  assert.equal(deleted.body.result.deletionSummary.refundedCents,5000);
  assert.equal(c.state.ledger.filter(l=>l.contributionId===support.body.result.id&&l.direction==='in'&&l.type==='contribution').length,1);
  assert.equal(c.state.ledger.filter(l=>l.contributionId===support.body.result.id&&l.type==='refund').length,2);
  const removed=await c.command('moderateComment',{commentId:comment.body.result.id,removed:true,reason:'Comentário em revisão pela equipe.'});
  assert.equal(removed.response.status,200);assert.ok(c.state.projectComments.find(p=>p.id===comment.body.result.id).removedAt);
  const logs=await c.command('auditForAccount',{accountId:'creator1'});
  assert.equal(logs.response.status,200);assert.ok(logs.body.result.some(e=>e.resourceId===id));
  assert.ok(logs.body.result.every(e=>e.relatedAccountIds.includes('creator1')));
  await c.command('switchActor',{id:'supporter1'});
  assert.ok(!c.state.campaigns.some(p=>p.id===id));assert.ok(!c.state.projectComments.some(p=>p.id===comment.body.result.id));
  assert.ok(c.state.contributions.some(p=>p.id===support.body.result.id&&p.status==='confirmed'&&p.refundStatus==='completed'));
  const blocked=await c.command('createContribution',{campaignId:id,amountCents:5000,idempotencyKey:'removed-project'});
  assert.equal(blocked.response.status,409);assert.equal(blocked.body.error.code,'PROJECT_UNAVAILABLE');
  assert.equal((await c.command('auditForAccount',{accountId:'creator1'})).response.status,403);
  await c.command('switchActor',{id:'admin1'});
  assert.equal((await c.command('moderateCampaign',{campaignId:id,deleted:false,reason:'Proposta revisada e aprovada.'})).response.status,200);
  assert.equal((await c.command('moderateComment',{commentId:comment.body.result.id,removed:false,reason:'Comentário liberado após revisão.'})).response.status,200);
  await c.command('switchActor',{id:'creator1'});
  const second=createApp({repository:createPostgresRepository(pool),sessionSecret:secret,logger:{error(){}}});
  second.listen(0,'127.0.0.1');await once(second,'listening');
  try {
    const response=await fetch(`http://127.0.0.1:${second.address().port}/api/state`,{headers:{Cookie:c.cookie}});const {state}=await response.json();
    assert.equal(response.status,200);const project=state.campaigns.find(p=>p.id===id);
    assert.equal(project.title,configured.title);assert.equal(project.story,configured.story);assert.equal(project.category,'Jogos');
    assert.equal(project.raisedCents,0);assert.ok(!project.deletedAt);
    assert.ok(state.projectComments.some(p=>p.id===comment.body.result.id&&!p.removedAt));
    assert.equal(state.ledger.filter(l=>l.contributionId===support.body.result.id&&l.direction==='in').length,1);
  } finally {second.closeAllConnections();await new Promise(resolve=>second.close(resolve));}
}));

test('chat privado e banimento persistem sem permitir autoria forjada ou acesso entre participantes',async()=>withAdminApi(async c=>{
  await c.command('switchActor',{id:'admin1'});
  const message=await c.command('sendDirectMessage',{creatorId:'creator1',body:'Precisamos revisar o planejamento do projeto.',senderId:'creator1'});
  assert.equal(message.response.status,200);assert.equal(message.body.result.senderId,'admin1');
  const other=await c.command('sendDirectMessage',{creatorId:'creator2',body:'CONTEUDO_RESERVADO_AO_OUTRO_CRIADOR'});
  assert.equal(other.response.status,200);
  const banned=await c.command('moderateAccount',{accountId:'supporter1',banned:true,reason:'Conta em revisão pela administração.'});
  assert.equal(banned.response.status,200);assert.ok(c.state.accountModerations.some(m=>m.accountId==='supporter1'&&m.banned));
  assert.equal((await c.command('moderateAccount',{accountId:'admin1',banned:true,reason:'Não permitir auto bloqueio.'})).response.status,403);
  await c.command('switchActor',{id:'supporter1'});
  assert.equal(c.state.actor.banned,true);assert.deepEqual(c.state.directMessages,[]);
  assert.equal((await c.command('sendDirectMessage',{creatorId:'creator1',body:'Tentativa de acesso indevido.'})).response.status,403);
  const blocked=await c.command('createContribution',{campaignId:'c1',amountCents:5000,idempotencyKey:'banned-new-support'});
  assert.equal(blocked.response.status,403);assert.equal(blocked.body.error.code,'ACCOUNT_BANNED');
  assert.equal((await c.command('createProjectComment',{campaignId:'c1',body:'Comentário de conta bloqueada.'})).response.status,403);
  await c.command('switchActor',{id:'creator1'});
  assert.ok(c.state.directMessages.some(m=>m.id===message.body.result.id));
  assert.ok(c.state.directMessages.every(m=>m.creatorId==='creator1'));
  assert.doesNotMatch(JSON.stringify(c.state),/CONTEUDO_RESERVADO_AO_OUTRO_CRIADOR/);
  assert.ok(c.state.accountModerations.every(m=>m.accountId==='creator1'));
  const reply=await c.command('sendDirectMessage',{creatorId:'creator1',body:'O planejamento foi atualizado.',senderId:'admin1'});
  assert.equal(reply.response.status,200);assert.equal(reply.body.result.senderId,'creator1');
  assert.equal((await c.command('sendDirectMessage',{creatorId:'creator2',body:'Não sou participante desta conversa.'})).response.status,403);
  await c.command('switchActor',{id:'admin1'});
  assert.equal((await c.command('moderateAccount',{accountId:'creator1',banned:true,reason:'Perfil suspenso durante análise.'})).response.status,200);
  await c.command('switchActor',{id:'creator1'});
  assert.equal(c.state.actor.banned,true);
  assert.equal((await c.command('updateCreatorProfile',{bio:'Não permitido durante suspensão.',links:[]})).response.status,403);
  assert.equal((await c.command('sendDirectMessage',{creatorId:'creator1',body:'Envio suspenso.'})).response.status,403);
  const second=createApp({repository:createPostgresRepository(pool),sessionSecret:secret,logger:{error(){}}});
  second.listen(0,'127.0.0.1');await once(second,'listening');
  try {
    const response=await fetch(`http://127.0.0.1:${second.address().port}/api/state`,{headers:{Cookie:c.cookie}});const {state}=await response.json();
    assert.equal(response.status,200);assert.equal(state.actor.banned,true);
    assert.equal(state.accessBlocked,true);assert.deepEqual(state.accountModerations,[]);
    assert.deepEqual(state.directMessages,[]);
  } finally {second.closeAllConnections();await new Promise(resolve=>second.close(resolve));}
  await c.command('switchActor',{id:'admin1'});
  await c.command('moderateAccount',{accountId:'creator1',banned:false,reason:'Perfil liberado após a análise.'});
  await c.command('moderateAccount',{accountId:'supporter1',banned:false,reason:'Conta liberada após a análise.'});
  await c.command('switchActor',{id:'creator1'});
  assert.equal(c.state.actor.banned,false);
  assert.equal((await c.command('sendDirectMessage',{creatorId:'creator1',body:'Conversa retomada após liberação.'})).response.status,200);
  const isolated=await client();assert.deepEqual(isolated.state.directMessages,[]);assert.equal(isolated.state.actor.banned,false);
}));

test('suspensão temporária persiste, mantém leitura e expira no limite exato do relógio do servidor',async()=>{
  let currentTime=Date.now();const expiry=new Date(currentTime+3600000).toISOString();
  await withAdminApi(async c=>{
    await c.command('switchActor',{id:'admin1'});
    const reason='Suspensão temporária para revisão das publicações.';
    const punished=await c.command('moderateAccount',{accountId:'creator1',type:'suspension',expiresAt:expiry,reason});
    assert.equal(punished.response.status,200);
    const stored=(await pool.query('SELECT id, workspace_id, moderation_type, banned, expires_at FROM account_moderations WHERE reason=$1',[reason])).rows[0];
    assert.equal(stored.moderation_type,'suspension');assert.equal(stored.banned,false);assert.equal(new Date(stored.expires_at).toISOString(),expiry);
    await assert.rejects(pool.query('UPDATE account_moderations SET banned=true WHERE workspace_id=$1 AND id=$2',[stored.workspace_id,stored.id]));
    await c.command('switchActor',{id:'creator1'});
    const financial={...c.state.summary};
    assert.equal(c.state.actor.suspended,true);assert.equal(c.state.actor.banned,false);assert.equal(c.state.actor.restricted,true);
    assert.equal(c.state.actor.moderationExpiresAt,expiry);assert.ok(c.state.campaigns.some(p=>p.id==='c1'));
    const blocked=await c.command('updateCreatorProfile',{bio:'Alteração durante suspensão.',links:[]});
    assert.equal(blocked.response.status,403);assert.equal(blocked.body.error.code,'ACCOUNT_SUSPENDED');
    assert.equal((await c.request('/api/export')).response.status,200,'A suspensão conserva acesso de leitura ao próprio histórico.');
    const second=createApp({repository:createPostgresRepository(pool),sessionSecret:secret,logger:{error(){}},clock:()=>currentTime});
    second.listen(0,'127.0.0.1');await once(second,'listening');
    try {
      const response=await fetch(`http://127.0.0.1:${second.address().port}/api/state`,{headers:{Cookie:c.cookie}});const body=await response.json();
      assert.equal(response.status,200);assert.equal(body.state.actor.suspended,true);assert.equal(body.state.actor.moderationExpiresAt,expiry);
    } finally {second.closeAllConnections();await new Promise(resolve=>second.close(resolve));}
    currentTime=Date.parse(expiry)-1;await c.request('/api/state');assert.equal(c.state.actor.suspended,true);
    currentTime=Date.parse(expiry);await c.request('/api/state');assert.equal(c.state.actor.restricted,false);assert.equal(c.state.actor.moderationType,'none');
    assert.deepEqual(c.state.summary,financial);
    assert.equal((await c.command('updateCreatorProfile',{bio:'Alteração após o prazo encerrado.',links:[]})).response.status,200);
    await c.command('switchActor',{id:'admin1'});
    assert.ok(c.state.accountModerations.some(m=>m.type==='suspension'&&m.expiresAt===expiry),'O registro histórico não desaparece ao expirar.');
  },{clock:()=>currentTime});
});

test('banimento restringe todo conteúdo e comandos da conta, permitindo revisão e liberação administrativa',async()=>withAdminApi(async c=>{
  await c.command('switchActor',{id:'creator1'});const financial={...c.state.summary};
  await c.command('switchActor',{id:'admin1'});
  await c.command('sendDirectMessage',{creatorId:'creator1',body:'CONTEUDO_PRIVADO_NAO_DEVE_APARECER_NO_BANIMENTO'});
  const banned=await c.command('moderateAccount',{accountId:'creator1',type:'ban',expiresAt:null,reason:'Banimento por revisão das condições da conta.'});
  assert.equal(banned.response.status,200);
  await c.command('switchActor',{id:'creator1'});
  assert.equal(c.state.accessBlocked,true);assert.equal(c.state.actor.moderationType,'ban');assert.equal(c.state.actor.moderationExpiresAt,null);
  for(const collection of ['campaigns','contributions','ledger','payouts','creatorProfiles','projectUpdates','projectComments','directMessages','accountModerations','auditLog'])assert.deepEqual(c.state[collection],[],collection);
  assert.doesNotMatch(JSON.stringify(c.state),/CONTEUDO_PRIVADO_NAO_DEVE_APARECER/);
  for(const [command,payload] of [['diagnostics',{}],['reset',{}],['cancelSubscription',{id:'support-2'}],['createProjectComment',{campaignId:'c1',body:'Sem acesso.'}]]){
    const result=await c.command(command,payload);assert.equal(result.response.status,403);assert.equal(result.body.error.code,'ACCOUNT_BANNED');
  }
  const exported=await c.request('/api/export');assert.equal(exported.response.status,403);assert.equal(exported.body.error.code,'ACCOUNT_BANNED');
  await c.command('switchActor',{id:'admin1'});
  const changed=await c.command('moderateAccount',{accountId:'creator1',type:'suspension',expiresAt:null,reason:'Revisão alterou a medida para suspensão.'});
  assert.equal(changed.response.status,200);assert.equal(changed.body.result.moderationType,'suspension');
  await c.command('switchActor',{id:'creator1'});assert.notEqual(c.state.accessBlocked,true);assert.equal(c.state.actor.suspended,true);assert.ok(c.state.directMessages.length);
  await c.command('switchActor',{id:'admin1'});
  assert.equal((await c.command('moderateAccount',{accountId:'creator1',type:'none',expiresAt:null,reason:'Análise concluída e acesso liberado.'})).response.status,200);
  await c.command('switchActor',{id:'creator1'});assert.equal(c.state.actor.restricted,false);assert.deepEqual(c.state.summary,financial);
}));

test('edição de perfil é exclusiva do dono, incluindo contas apoiadoras',async()=>withAdminApi(async c=>{
  await c.command('switchActor',{id:'admin1'});
  const before=c.state.creatorProfiles;
  for(const creatorId of ['creator2','supporter1'])assert.equal((await c.command('updateCreatorProfile',{creatorId,bio:'Tentativa de administração',links:[]})).response.status,403);
  await c.request('/api/state');assert.deepEqual(c.state.creatorProfiles,before);
  await c.command('switchActor',{id:'supporter1'});
  assert.equal((await c.command('updateCreatorProfile',{bio:'Meu perfil apoiador.',links:[]})).response.status,200);
  await c.request('/api/state');assert.equal(c.state.creatorProfiles.find(p=>p.creatorId==='supporter1').bio,'Meu perfil apoiador.');
  assert.equal((await c.command('updateCreatorProfile',{creatorId:'creator2',bio:'Tentativa indevida',links:[]})).response.status,403);
}));
