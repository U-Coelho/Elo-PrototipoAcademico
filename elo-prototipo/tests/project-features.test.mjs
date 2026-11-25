import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,createSeedState,STORAGE_KEY} from '../server/domain/platform.js';

const code = expected => error => error.code === expected;
const campaignPayload = overrides => ({title:'Oficina de criação coletiva',description:'Um espaço de criação com oficinas e atividades abertas à comunidade.',category:'Arte e cultura',goalCents:100000,daysLeft:30,...overrides});
const reward = overrides => ({title:'Caderno digital',description:'Um caderno com as atividades realizadas no projeto.',amountCents:5000,...overrides});
const creator = () => {const p=createPlatform();p.switchActor('creator1');return p;};
const contribute = (p,project,overrides={}) => p.createContribution({campaignId:project.id,amountCents:5000,mode:'once',rewardId:project.rewards[0]?.id ?? null,idempotencyKey:'reward-support',...overrides});

test('projeto sem lista de recompensas permanece sem recompensas inclusive se aceitar mensalidade',()=>{
  const p=creator();
  const c=p.createCampaign(campaignPayload({monthly:true}));
  assert.deepEqual(c.rewards,[]);
  assert.equal(c.rewardRaisedCents,0);
  assert.equal(c.story,c.description);
});

test('criador configura recompensas com IDs próprios do servidor e campos normalizados',()=>{
  const p=creator();
  const c=p.createCampaign(campaignPayload({monthly:true,rewards:[reward({id:'client-id',title:'  Caderno digital  '}),reward({title:'Encontro mensal',monthly:true})]}));
  assert.equal(c.rewards.length,2);
  assert.notEqual(c.rewards[0].id,'client-id');
  assert.notEqual(c.rewards[0].id,c.rewards[1].id);
  assert.equal(c.rewards[0].title,'Caderno digital');
  assert.equal(c.rewards[0].monthly,false);
  assert.equal(c.rewards[1].monthly,true);
});

test('listas inválidas e recompensa mensal incompatível são rejeitadas antes de criar projeto',()=>{
  const p=creator(),before=p.listCampaigns().length;
  for(const rewards of [null,{},Array.from({length:21},()=>reward()),[reward({amountCents:499})],[reward({amountCents:500.5})],[reward({title:'<script>alert(1)</script>'})],[reward({monthly:'true'})]])
    assert.throws(()=>p.createCampaign(campaignPayload({rewards})),code('INVALID_REWARD'));
  assert.throws(()=>p.createCampaign(campaignPayload({rewards:[reward({monthly:true})]})),code('INVALID_REWARD_MODE'));
  assert.equal(p.listCampaigns().length,before);
});

test('um apoio com recompensa conta uma vez no total e na parcela de recompensas após confirmação',()=>{
  const p=creator(),c=p.createCampaign(campaignPayload({rewards:[reward()]}));
  p.switchActor('supporter1');
  const support=contribute(p,c);
  assert.equal(p.getCampaign(c.id).raisedCents,0);
  assert.equal(p.getCampaign(c.id).rewardRaisedCents,0);
  assert.equal(support.rewardTitle,'Caderno digital');
  p.simulatePayment(support.id);p.simulatePayment(support.id);
  assert.equal(p.getCampaign(c.id).raisedCents,5000);
  assert.equal(p.getCampaign(c.id).rewardRaisedCents,5000);
  const entries=p.getState().ledger.filter(e=>e.contributionId===support.id);
  assert.equal(entries.length,2);
  assert.ok(entries.every(e=>e.rewardId===support.rewardId));
  const direct=contribute(p,c,{rewardId:null,amountCents:2500,idempotencyKey:'direct'});p.simulatePayment(direct.id);
  assert.equal(p.getCampaign(c.id).raisedCents,7500);
  assert.equal(p.getCampaign(c.id).rewardRaisedCents,5000);
});

test('apoio superior ao preço da recompensa classifica todo o recebimento sem duplicar o preço',()=>{
  const p=createPlatform(),c=p.getCampaign('c1');
  const support=contribute(p,c,{amountCents:4000});p.simulatePayment(support.id);
  assert.equal(p.getCampaign('c1').raisedCents,c.raisedCents+4000);
  assert.equal(p.getCampaign('c1').rewardRaisedCents,4000);
});

test('recusa de recompensa preserva total e parcela sem gerar extrato',()=>{
  const p=createPlatform(),c=p.getCampaign('c1'),support=contribute(p,c),before=p.getState().ledger.length;
  p.simulatePayment(support.id,'failed');
  assert.equal(p.getCampaign(c.id).raisedCents,c.raisedCents);
  assert.equal(p.getCampaign(c.id).rewardRaisedCents,0);
  assert.equal(p.getState().ledger.length,before);
});

test('a recompensa precisa pertencer ao projeto, ter preço coberto e corresponder à modalidade',()=>{
  const p=createPlatform(),c=p.getCampaign('c1');
  assert.throws(()=>contribute(p,c,{rewardId:'c2-r1'}),code('INVALID_REWARD'));
  assert.throws(()=>contribute(p,c,{rewardId:''}),code('INVALID_REWARD'));
  assert.throws(()=>contribute(p,c,{amountCents:500}),code('INVALID_REWARD_AMOUNT'));
  assert.throws(()=>contribute(p,c,{mode:'monthly'}),code('INVALID_REWARD_MODE'));
  assert.throws(()=>contribute(p,c,{rewardId:'c1-r3',mode:'once'}),code('INVALID_REWARD_MODE'));
  assert.equal(p.getState().contributions.length,3);
});

test('idempotência distingue recompensa e apoio sem recompensa mesmo com mesmo valor',()=>{
  const p=createPlatform(),c=p.getCampaign('c1'),first=contribute(p,c);
  assert.equal(contribute(p,c).id,first.id);
  assert.throws(()=>contribute(p,c,{rewardId:null}),code('IDEMPOTENCY_CONFLICT'));
  assert.throws(()=>contribute(p,c,{rewardId:'c1-r2',amountCents:7500}),code('IDEMPOTENCY_CONFLICT'));
});

test('renovações de recompensa preservam vínculo e cada ciclo confirmado conta somente uma vez',()=>{
  const p=createPlatform(),c=p.getCampaign('c1');
  const root=contribute(p,c,{mode:'monthly',rewardId:'c1-r3',amountCents:3500});p.simulatePayment(root.id);
  const renewal=p.renewSubscription({contributionId:root.id,idempotencyKey:'reward-cycle2'});
  assert.equal(renewal.rewardId,root.rewardId);assert.equal(renewal.rewardTitle,root.rewardTitle);
  p.simulatePayment(renewal.id);p.simulatePayment(renewal.id);
  assert.equal(p.getCampaign(c.id).rewardRaisedCents,7000);
  assert.equal(p.getCampaign(c.id).raisedCents,c.raisedCents+7000);
  assert.equal(p.getSummary().activeSubscriptions,2);
  const pending=p.renewSubscription({contributionId:root.id,idempotencyKey:'reward-cycle3'});p.cancelSubscription(root.id);
  assert.throws(()=>p.simulatePayment(pending.id),code('INVALID_TRANSITION'));
  assert.equal(p.getCampaign(c.id).rewardRaisedCents,7000);
});

test('upgrade de cenário antigo preserva saldo, totais e chaves de idempotência sem inventar recompensas',()=>{
  const p=createPlatform();const pending=p.createContribution({campaignId:'c1',amountCents:5000,idempotencyKey:'old-key'});
  const old=p.getState();delete old.creatorProfiles;delete old.projectUpdates;delete old.projectComments;
  for(const c of old.campaigns)delete c.rewardRaisedCents;
  for(const c of old.contributions){delete c.rewardId;delete c.rewardTitle;}
  const before=old.campaigns.map(c=>c.raisedCents),ledger=JSON.stringify(old.ledger);
  const restored=createPlatform({initialState:old});
  assert.deepEqual(restored.listCampaigns().map(c=>c.raisedCents),before);
  assert.equal(JSON.stringify(restored.getState().ledger),ledger);
  assert.ok(restored.listCampaigns().every(c=>c.rewardRaisedCents===0));
  assert.equal(restored.getState().creatorProfiles.length,5);
  assert.equal(restored.createContribution({campaignId:'c1',amountCents:5000,idempotencyKey:'old-key'}).id,pending.id);
  assert.equal('creatorProfiles' in old,false);
});

test('upgrade das histórias remove avisos antigos somente na cópia exata do catálogo conhecido',()=>{
  const legacy='Um terreno vazio pode se tornar um ponto de encontro. O Verde no concreto é uma iniciativa fictícia que aproxima vizinhos para criar hortas comunitárias e oficinas de cultivo.\n\nO apoio financia ferramentas, mudas e encontros de formação. Nossa primeira etapa prevê três espaços de cultivo, com cuidado compartilhado e acesso gratuito à comunidade.\n\nCada apoio ajuda a construir uma cidade com mais verde, alimento e convivência. Nesta demonstração, todas as contribuições e todos os resultados são simulados.';
  const seed=createSeedState(),current=seed.campaigns.find(c=>c.id==='c1').story;
  seed.campaigns.find(c=>c.id==='c1').story=legacy;
  assert.equal(createPlatform({initialState:seed}).getCampaign('c1').story,current);
  const authored=legacy+'\n\nTexto adicional de autoria.';
  seed.campaigns.find(c=>c.id==='c1').story=authored;
  assert.equal(createPlatform({initialState:seed}).getCampaign('c1').story,authored);
});

test('perfil público preserva data de criação, limita vínculos e impede alterar outro criador',()=>{
  const p=creator(),before=p.getState().creatorProfiles.find(c=>c.creatorId==='creator1');
  const result=p.updateCreatorProfile({bio:'  Artes, cultura e projetos comunitários.  ',links:[{label:'  Portfólio  ',url:'https://example.org/perfil'}],joinedAt:'2000-01-01'});
  assert.throws(()=>p.updateCreatorProfile({creatorId:'creator2',bio:'Tentativa de alterar outro perfil',links:[]}),code('FORBIDDEN'));
  assert.equal(result.creatorId,'creator1');assert.equal(result.joinedAt,before.joinedAt);
  assert.equal(result.bio,'Artes, cultura e projetos comunitários.');assert.equal(result.links[0].label,'Portfólio');
  result.links[0].url='javascript:alert(1)';
  assert.equal(p.getPublicState('supporter1').creatorProfiles.find(c=>c.creatorId==='creator1').links[0].url,'https://example.org/perfil');
  p.switchActor('supporter1');assert.equal(p.updateCreatorProfile({bio:'Bio da apoiadora'}).creatorId,'supporter1');
});

test('perfil recusa HTML, URLs executáveis, credenciais, controles e links excessivos',()=>{
  const p=creator();
  assert.throws(()=>p.updateCreatorProfile({bio:'<img src=x onerror=alert(1)>'}),code('INVALID_PROFILE'));
  for(const url of ['javascript:alert(1)','data:text/html,test','https://name:secret@example.org','https://example.org/\nscript','nota-url'])
    assert.throws(()=>p.updateCreatorProfile({bio:'Bio válida',links:[{label:'Site',url}]}),code('INVALID_LINK'));
  assert.throws(()=>p.updateCreatorProfile({bio:'Bio válida',links:Array.from({length:6},(_,i)=>({label:'Site',url:`https://example.org/${i}`}))}),code('INVALID_LINK'));
  assert.throws(()=>p.updateCreatorProfile({bio:'Bio válida',links:[{label:'Um',url:'https://example.org'},{label:'Dois',url:'https://example.org/'}]}),code('INVALID_LINK'));
  assert.equal(p.getState().creatorProfiles.find(c=>c.creatorId==='creator1').bio,'');
});

test('somente dono do projeto publica atualizações, com título e corpo validados',()=>{
  const p=creator();
  assert.throws(()=>p.createProjectUpdate({campaignId:'c2',title:'Nova etapa',body:'Produção iniciada.'}),code('FORBIDDEN'));
  assert.throws(()=>p.createProjectUpdate({campaignId:'c1',title:'Ok',body:'Produção iniciada.'}),code('INVALID_UPDATE'));
  assert.throws(()=>p.createProjectUpdate({campaignId:'c1',title:'Nova etapa',body:'<script>alert(1)</script>'}),code('INVALID_UPDATE'));
  const update=p.createProjectUpdate({campaignId:'c1',title:'  Nova etapa  ',body:'  Iniciamos as oficinas.  ',creatorId:'creator2'});
  assert.equal(update.creatorId,'creator1');assert.equal(update.title,'Nova etapa');assert.equal(update.body,'Iniciamos as oficinas.');
  p.switchActor('supporter1');assert.equal(p.getPublicState().projectUpdates[0].id,update.id);
  assert.throws(()=>p.createProjectUpdate({campaignId:'c1',title:'Outra etapa',body:'Texto'}),code('FORBIDDEN'));
});

test('comentário deriva autoria da sessão, fica vinculado à campanha e é público',()=>{
  const p=createPlatform(),comment=p.createProjectComment({campaignId:'c1',body:'  Como participar das oficinas?  ',authorId:'creator1',authorName:'Outra pessoa'});
  assert.equal(comment.authorId,'supporter1');assert.equal(comment.authorName,'Ana Souza');assert.equal(comment.body,'Como participar das oficinas?');
  p.switchActor('creator1');assert.equal(p.getPublicState().projectComments[0].id,comment.id);
  assert.throws(()=>p.createProjectComment({campaignId:'c1',body:'<a href="javascript:test">link</a>'}),code('INVALID_COMMENT'));
  assert.throws(()=>p.createProjectComment({campaignId:'c1',body:' '}),code('INVALID_COMMENT'));
  assert.throws(()=>p.createProjectComment({campaignId:'inexistente',body:'Olá'}),code('NOT_FOUND'));
  p.switchActor('admin1');assert.throws(()=>p.createProjectComment({campaignId:'c1',body:'Olá'}),code('FORBIDDEN'));
});

test('perfis, atualizações, comentários e vínculo de recompensa sobrevivem a restauração sem mutação externa',()=>{
  const memory=new Map(),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
  const p=createPlatform({storage});p.switchActor('creator1');p.updateCreatorProfile({bio:'Criadora de oficinas.'});
  const update=p.createProjectUpdate({campaignId:'c1',title:'Oficinas abertas',body:'Novas atividades neste mês.'});
  p.switchActor('supporter1');const comment=p.createProjectComment({campaignId:'c1',body:'Quero participar.'}),support=contribute(p,p.getCampaign('c1'));p.simulatePayment(support.id);
  const restored=createPlatform({storage});
  assert.equal(restored.getState().creatorProfiles.find(c=>c.creatorId==='creator1').bio,'Criadora de oficinas.');
  assert.equal(restored.getState().projectUpdates[0].id,update.id);assert.equal(restored.getState().projectComments[0].id,comment.id);
  assert.equal(restored.getCampaign('c1').rewardRaisedCents,5000);
  assert.equal(restored.getState().contributions.find(c=>c.id===support.id).rewardId,support.rewardId);
  const corrupt=JSON.parse(memory.get(STORAGE_KEY));corrupt.projectComments[0].authorName='Autor forjado';
  assert.throws(()=>createPlatform({initialState:corrupt}),code('INVALID_STATE'));
});

test('corrupção em perfil, links, parcela de recompensa ou metadados não é normalizada silenciosamente',()=>{
  for(const corrupt of [s=>{s.creatorProfiles=null;},s=>{s.creatorProfiles[0].links=[{label:'Site',url:'javascript:alert(1)'}];},s=>{s.campaigns[0].rewardRaisedCents=s.campaigns[0].raisedCents+1;},s=>{s.projectUpdates=[{id:'x',campaignId:'c2',creatorId:'creator1',title:'Outra etapa',body:'Texto',createdAt:new Date().toISOString()}];}]){
    const s=createSeedState();corrupt(s);assert.throws(()=>createPlatform({initialState:s}),code('INVALID_STATE'));
  }
});
