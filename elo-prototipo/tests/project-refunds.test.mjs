import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,createSeedState} from '../server/domain/platform.js';
import {createEmbeddedPool} from '../server/db/embedded.mjs';
import {createPostgresRepository} from '../server/repository/postgres.js';

const reason = 'Encerramento solicitado pelo responsável.';
const removal = (campaignId, idempotencyKey='excluir') => ({campaignId,deleted:true,reason,idempotencyKey});
const restore = (platform, campaignId) => {
  platform.switchActor('admin1');
  platform.moderateCampaign({...removal(campaignId,'restaurar'),deleted:false});
};
const code = wanted => error => error.code === wanted;

test('exclusão liquida ciclos confirmados uma vez, encerra assinatura e cancela pendências',()=>{
  const p=createPlatform();
  const renewed=p.renewSubscription({contributionId:'support-2',idempotencyKey:'ciclo2'});
  p.simulatePayment(renewed.id);
  const next={contributionId:'support-2',idempotencyKey:'ciclo3'};
  const pending=p.renewSubscription(next);
  p.switchActor('creator1');
  assert.deepEqual(p.getCampaignDeletionPreview('c4'),{campaignId:'c4',requiredCents:7000,availableCents:251500,shortfallCents:0,confirmedCount:2,pendingCount:1,subscriptionCount:1,canDelete:true});
  const result=p.moderateCampaign(removal('c4'));
  assert.deepEqual(result.deletionSummary,{batchId:result.deletionSummary.batchId,refundedCents:7000,refundCount:2,canceledPendingCount:1,canceledSubscriptionsCount:1});
  const state=p.getState();
  assert.equal(state.contributions.find(c=>c.id===pending.id).status,'canceled');
  assert.equal(state.contributions.find(c=>c.id===pending.id).cancellationReason,'project_deleted');
  const root=state.contributions.find(c=>c.id==='support-2');
  assert.equal(root.subscriptionStatus,'canceled');
  for(const id of ['support-2',renewed.id]){
    const support=state.contributions.find(c=>c.id===id);
    assert.equal(support.status,'confirmed');assert.equal(support.refundStatus,'completed');
    assert.equal(support.refundedBy,'creator1');assert.equal(support.refundReason,reason);
    assert.equal(support.refundBatchId,result.deletionSummary.batchId);
    const entries=state.ledger.filter(l=>l.type==='refund'&&l.contributionId===id);
    assert.equal(entries.length,2);
    assert.ok(entries.every(l=>l.amountCents===3500&&l.refundId===support.refundId));
    assert.ok(entries.some(l=>l.ownerId==='creator1'&&l.direction==='out'));
    assert.ok(entries.some(l=>l.ownerId==='supporter1'&&l.direction==='in'));
  }
  assert.equal(p.getSummary().availableBalanceCents,244500);
  p.switchActor('supporter1');assert.equal(p.renewSubscription(next).id,pending.id);
  restore(p,'c4');p.switchActor('supporter1');
  const fresh=p.createContribution({campaignId:'c4',amountCents:2000,idempotencyKey:'novo'});p.simulatePayment(fresh.id);
  p.switchActor('creator1');const before=p.getState(), replay=p.moderateCampaign(removal('c4'));
  assert.equal(replay.duplicate,true);assert.deepEqual(replay.deletionSummary,result.deletionSummary);
  assert.deepEqual(p.getState(),before);assert.equal(p.getCampaignDeletionPreview('c4').requiredCents,2000);
  assert.equal(p.moderateCampaign(removal('c4','nova-exclusao')).deletionSummary.refundedCents,2000);
  assert.doesNotThrow(()=>createPlatform({initialState:p.getState()}));
});

test('saldo insuficiente preserva integralmente estado, chave, pendência e assinatura',()=>{
  const p=createPlatform();
  p.renewSubscription({contributionId:'support-2',idempotencyKey:'pendente'});
  p.switchActor('creator1');p.requestPayout({amountCents:247000,idempotencyKey:'repasse'});
  assert.equal(p.getCampaignDeletionPreview('c4').shortfallCents,2500);
  assert.equal(p.getCampaignDeletionPreview('c4').canDelete,false);
  const before=p.getState();assert.throws(()=>p.moderateCampaign(removal('c4')),code('REFUND_INSUFFICIENT_BALANCE'));
  assert.deepEqual(p.getState(),before);
});

test('reembolso recebido como apoiador não aumenta a carteira sacável do criador',()=>{
  const p=createPlatform();p.switchActor('creator1');
  const request={campaignId:'c2',amountCents:3200,idempotencyKey:'outro-criador'};
  const sent=p.createContribution(request);p.simulatePayment(sent.id);
  assert.throws(()=>p.getCampaignDeletionPreview('c2'),code('FORBIDDEN'));
  p.switchActor('admin1');p.moderateCampaign(removal('c2'));p.switchActor('creator1');
  assert.equal(p.getSummary().availableBalanceCents,248000);
  assert.equal(p.getSummary().netSupportedCents,0);assert.equal(p.getSummary().totalRefundedCents,3200);
  assert.equal(p.createContribution(request).id,sent.id);
  assert.throws(()=>p.moderateCampaign({...removal('c2'),deleted:false}),code('FORBIDDEN'));
});

test('ocultação legada exige exclusão explícita para efetuar devolução',()=>{
  const seed=createSeedState();
  Object.assign(seed.campaigns[0],{deletedAt:'2026-11-20T12:00:00Z',deletedBy:'admin1',deletionReason:reason});
  const p=createPlatform({initialState:seed});p.switchActor('admin1');
  assert.equal(p.getState().ledger.length,3);
  assert.equal(p.moderateCampaign(removal('c1')).deletionSummary.refundedCents,7500);
  assert.equal(p.getState().ledger.filter(l=>l.type==='contribution'&&l.direction==='in').length,0);
});

test('perfil altera e limpa localização em todos os projetos inclusive após recarregar',()=>{
  const p=createPlatform();p.switchActor('creator1');
  assert.equal(p.getCampaign('c4').location,'São Paulo, SP');
  const location={city:'Belém',region:'PA',countryCode:'BR'};
  assert.deepEqual(p.updateCreatorProfile({bio:'',location}).location,location);
  assert.equal(p.getCampaign('c1').location,'Belém, PA');
  assert.equal(p.updateCreatorProfile({bio:'Nova bio'}).location.city,'Belém');
  for (const bad of [{...location,city:'<b>Belém</b>'},{...location,region:'99'},{...location,countryCode:'US'},{...location,city:'Rua 33, 120'}])
    assert.throws(()=>p.updateCreatorProfile({bio:'',location:bad}),code('INVALID_LOCATION'));
  p.updateCreatorProfile({bio:'',location:null});
  const restored=createPlatform({initialState:p.getState()});
  assert.equal(restored.getCampaign('c4').location,undefined);
  assert.equal(restored.getState().creatorProfiles.find(c=>c.creatorId==='creator1').location,null);
  const created=restored.createCampaign({title:'Oficinas livres',description:'Encontros e aulas para moradores do bairro.',category:'Educação',goalCents:100000,monthly:true});
  assert.equal(created.location,undefined);
  restored.switchActor('supporter1');
  restored.createContribution({campaignId:created.id,amountCents:1500,mode:'monthly',idempotencyKey:'raiz'});
  restored.switchActor('creator1');assert.throws(()=>restored.updateCampaign({campaignId:created.id,monthly:false}),code('INVALID_MODE'));
});

test('alteração de capa permite somente criador ativo e audita a remoção',()=>{
  const p=createPlatform();p.switchActor('admin1');
  assert.throws(()=>p.campaignImageChanged('c1'),code('FORBIDDEN'));
  p.switchActor('creator1');assert.throws(()=>p.campaignImageChanged('c2'),code('FORBIDDEN'));
  p.campaignImageChanged('c1',true);p.switchActor('admin1');
  assert.ok(p.audit().some(e=>e.action==='campaign.image_removed'&&e.resourceId==='c1'));
});

test('apoio mensal pendente legado aguarda reativação da modalidade para ser confirmado',()=>{
  const p=createPlatform();p.switchActor('creator1');
  const project=p.createCampaign({title:'Horta coletiva',description:'Uma horta coletiva para os moradores do bairro.',category:'Educação',goalCents:30000,monthly:true});
  p.switchActor('supporter1');
  const pending=p.createContribution({campaignId:project.id,mode:'monthly',amountCents:1500,idempotencyKey:'mensal'});
  const legacy=p.getState();legacy.campaigns.find(c=>c.id===project.id).monthly=false;
  const restored=createPlatform({initialState:legacy}),before=restored.getState();
  assert.throws(()=>restored.simulatePayment(pending.id),code('MONTHLY_UNAVAILABLE'));assert.deepEqual(restored.getState(),before);
  restored.switchActor('creator1');restored.updateCampaign({campaignId:project.id,monthly:true});
  restored.switchActor('supporter1');assert.equal(restored.simulatePayment(pending.id).subscriptionStatus,'active');
});

test('confirmação sem capacidade de extrato ou auditoria falha antes de alterar o apoio',()=>{
  for(const [collection,size] of [['ledger',9999],['auditLog',10000]]){
    const seed=createSeedState(),base=seed[collection][0];
    while(seed[collection].length<size)seed[collection].push({...base,id:'filler-'+seed[collection].length});
    const p=createPlatform({initialState:seed}),before=p.getState();
    assert.throws(()=>p.simulatePayment('support-3'),code('DEMO_LIMIT'));
    assert.deepEqual(p.getState(),before);
  }
});

test('persistência conserva metadados e rejeita vínculos de estorno inválidos antes do commit',async t=>{
  const pool=await createEmbeddedPool();t.after(()=>pool.end());
  const repo=createPostgresRepository(pool);await repo.initialize();
  const id=await repo.createWorkspace(createSeedState());
  await repo.transact(id,state=>{
    const p=createPlatform({initialState:state});p.switchActor('creator1');p.moderateCampaign(removal('c1'));
    return {state:p.getState()};
  });
  const before=await repo.read(id);
  const support=before.contributions.find(c=>c.id==='support-1');
  assert.equal(support.refundedBy,'creator1');assert.equal(support.refundStatus,'completed');
  for (const change of [
    state=>{state.ledger.find(l=>l.type==='refund').amountCents++;},
    state=>{state.ledger=state.ledger.filter(l=>l.type!=='refund'||l.direction!=='out');},
    state=>{state.contributions.find(c=>c.id==='support-1').creatorId='creator2';},
    state=>{state.campaigns.find(c=>c.id==='c1').deletionSummary.refundedCents=1;},
    state=>{state.contributions.find(c=>c.id==='support-1').refundBatchId='lote-inexistente';for(const e of state.ledger.filter(e=>e.type==='refund')) e.refundBatchId='lote-inexistente';},
  ]){
    await assert.rejects(repo.transact(id,state=>{change(state);return {state};}),code('INVALID_STATE'));
    assert.deepEqual(await repo.read(id),before);
  }
  await assert.rejects(pool.query("UPDATE contributions SET refund_status='none' WHERE workspace_id=$1 AND id='support-1'",[id]),code('23514'));
  await assert.rejects(repo.transact(id,state=>{
    const sample=state.auditLog.find(event=>event.action==='demo.initialized');
    while(state.auditLog.length<=10000)state.auditLog.push({...sample,id:'inflated-'+state.auditLog.length});
    return {state};
  }),code('DEMO_LIMIT'));
  assert.deepEqual(await repo.read(id),before);
  await repo.transact(id,state=>{
    const p=createPlatform({initialState:state});restore(p,'c1');return {state:p.getState()};
  });
  const active=await repo.read(id),p=createPlatform({initialState:active});p.switchActor('creator1');
  assert.equal(p.moderateCampaign(removal('c1')).duplicate,true);
  assert.equal(p.getCampaign('c1').deletedAt,undefined);
});

test('histórico legado acima do limite de escrita continua legível sem truncamento',()=>{
  const seed=createSeedState(),event=seed.auditLog[0];
  while(seed.auditLog.length<=10000)seed.auditLog.push({...event,id:'historical-'+seed.auditLog.length});
  const p=createPlatform({initialState:seed});
  assert.equal(p.getState().auditLog.length,10001);
  assert.throws(()=>p.simulatePayment('support-3'),code('DEMO_LIMIT'));
  assert.deepEqual(p.getState().auditLog,seed.auditLog);
});
