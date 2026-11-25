import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,createSeedState} from '../server/domain/platform.js';
const code=wanted=>error=>error.code===wanted;
const payload={title:'Jogo independente da comunidade',description:'Um jogo fictício para verificar metas e entrega de recompensas.',category:'Jogos',goalCents:4500000,monthly:false,rewards:[{title:'Cópia digital',description:'Uma cópia digital do jogo.',amountCents:2500,monthly:false}]};
const reason='Encerramento solicitado para verificar devoluções e prazo.';
test('somente criador publica campanha e rejeição administrativa não altera estado',()=>{
  const p=createPlatform();p.switchActor('admin1');const before=p.getState();
  assert.throws(()=>p.createCampaign(payload),code('FORBIDDEN'));assert.deepEqual(p.getState(),before);
});

test('links de perfil e entrega respeitam limite após normalização Unicode',()=>{
  const {p,support}=prepared();p.switchActor('creator1');const before=p.getState();
  assert.throws(()=>p.updateCreatorProfile({bio:'',links:[{label:'Meu site',url:'https://example.test/'+'á'.repeat(100)}]}),code('INVALID_LINK'));
  assert.deepEqual(p.getState(),before);
  assert.throws(()=>p.publishRewardDelivery({contributionId:support.id,message:'Sua cópia digital.',url:'https://example.test/'+'á'.repeat(180)}),code('INVALID_DELIVERY'));
  assert.deepEqual(p.getState(),before);
});
function prepared(clock=()=>Date.parse('2026-11-25T12:00:00Z')){
  const p=createPlatform({clock});p.switchActor('creator1');const c=p.createCampaign(payload);
  p.switchActor('supporter1');const support=p.createContribution({campaignId:c.id,rewardId:c.rewards[0].id,amountCents:2500,mode:'once',idempotencyKey:'apoio'});p.simulatePayment(support.id);
  return {p,c,support};
}
test('metas adicionais são cumulativas, editáveis pelo dono e persistem sem alterar arrecadação',()=>{
  const p=createPlatform();p.switchActor('creator1');
  const c=p.createCampaign({...payload,milestones:[{title:'Alpha pública',description:'Disponibilizar a versão alpha.',amountCents:7000000},{title:'Novos recursos',description:'Mais recursos no jogo.',amountCents:8000000}]});
  assert.equal(c.milestones.length,2);assert.equal(c.goalCents,4500000);assert.equal(c.raisedCents,0);
  const before=p.getState();assert.throws(()=>p.updateCampaign({campaignId:c.id,goalCents:7500000}),code('INVALID_MILESTONES'));assert.deepEqual(p.getState(),before);
  const reloaded=createPlatform({initialState:p.getState()});assert.equal(reloaded.getCampaign(c.id).milestones[1].amountCents,8000000);
});
test('entrega digital é privada, exige pagamento confirmado e permite confirmação idempotente',()=>{
  const {p,c,support}=prepared();
  assert.throws(()=>p.publishRewardDelivery({contributionId:support.id,message:'Sua cópia digital.',url:'https://example.test/jogo'}),code('FORBIDDEN'));
  p.switchActor('creator1');const delivery=p.publishRewardDelivery({contributionId:support.id,message:'Sua cópia digital.',url:'https://example.test/jogo'});
  assert.equal(delivery.status,'available');assert.equal(delivery.version,1);
  const before=p.getState();assert.equal(p.publishRewardDelivery({contributionId:support.id,message:delivery.message,url:delivery.url}).duplicate,true);assert.deepEqual(p.getState(),before);
  assert.equal(p.getPublicState('admin1').rewardDeliveries.length,0);
  p.switchActor('supporter1');assert.equal(p.getPublicState().rewardDeliveries[0].url,delivery.url);
  assert.equal(p.acknowledgeRewardDelivery({deliveryId:delivery.id}).status,'received');
  assert.equal(p.acknowledgeRewardDelivery({deliveryId:delivery.id}).duplicate,true);
  p.switchActor('creator1');p.moderateCampaign({campaignId:c.id,deleted:true,reason,idempotencyKey:'encerrar'});
  p.switchActor('supporter1');assert.deepEqual(p.getPublicState().rewardDeliveries,[]);assert.throws(()=>p.acknowledgeRewardDelivery({deliveryId:delivery.id}),code('REWARD_UNAVAILABLE'));
});
test('pendência e recusa não dão direito a entrega e URLs inválidas não alteram estado',()=>{
  const {p,c}=prepared();p.switchActor('supporter1');
  const pending=p.createContribution({campaignId:c.id,rewardId:c.rewards[0].id,amountCents:2500,mode:'once',idempotencyKey:'pendente'});
  p.switchActor('creator1');assert.throws(()=>p.publishRewardDelivery({contributionId:pending.id,message:'Uma entrega fictícia.'}),code('REWARD_UNAVAILABLE'));
  const before=p.getState();assert.throws(()=>p.publishRewardDelivery({contributionId:before.contributions.find(s=>s.campaignId===c.id&&s.status==='confirmed').id,message:'Sua cópia digital.',url:'javascript:alert(1)'}),code('INVALID_DELIVERY'));assert.deepEqual(p.getState(),before);
});
test('exclusão agenda trinta dias após a devolução e dono só recupera exclusão própria',()=>{
  const {p,c}=prepared();p.switchActor('creator1');
  const deleted=p.moderateCampaign({campaignId:c.id,deleted:true,reason,idempotencyKey:'excluir'});
  assert.equal(deleted.purgeAfter,'2026-12-25T12:00:00.000Z');assert.equal(deleted.deletionSummary.refundedCents,2500);
  assert.ok(!p.moderateCampaign({campaignId:c.id,deleted:false,reason,idempotencyKey:'recuperar'}).deletedAt);
  p.switchActor('admin1');p.moderateCampaign({campaignId:c.id,deleted:true,reason,idempotencyKey:'moderacao'});
  p.switchActor('creator1');assert.throws(()=>p.moderateCampaign({campaignId:c.id,deleted:false,reason,idempotencyKey:'sem-permissao'}),code('FORBIDDEN'));
});
test('limpeza no prazo remove conteúdo e entregas sem apagar pagamentos ou reembolsos',()=>{
  let time=Date.parse('2026-11-25T12:00:00Z');const {p,c,support}=prepared(()=>time);
  p.switchActor('creator1');p.publishRewardDelivery({contributionId:support.id,message:'Mensagem privada de entrega.',url:'https://example.test/privado'});
  p.createProjectUpdate({campaignId:c.id,title:'Uma atualização',body:'Conteúdo temporário do projeto.'});
  p.moderateCampaign({campaignId:c.id,deleted:true,reason,idempotencyKey:'remover-conteudo'});
  const before=p.getState();time+=30*86400000-1;assert.equal(p.purgeExpiredProjects().length,0);
  time+=1;assert.deepEqual(p.purgeExpiredProjects(),[c.id]);const after=p.getState();
  assert.equal(after.campaigns.find(x=>x.id===c.id).purgedAt,'2026-12-25T12:00:00.000Z');
  assert.doesNotMatch(JSON.stringify(after.campaigns.find(x=>x.id===c.id)),/Jogo independente|verificar metas|Cópia digital/);
  assert.equal(after.rewardDeliveries.length,0);assert.equal(after.projectUpdates.filter(x=>x.campaignId===c.id).length,0);
  assert.deepEqual(after.contributions,before.contributions);assert.deepEqual(after.ledger,before.ledger);
  assert.throws(()=>p.getCampaign(c.id),code('NOT_FOUND'));assert.deepEqual(p.purgeExpiredProjects(),[]);
  assert.doesNotThrow(()=>createPlatform({initialState:after}));
});

test('liquidação de exclusão administrativa legada conserva a autoria e não permite recuperação pelo criador',()=>{
  const seed=createSeedState();Object.assign(seed.campaigns.find(c=>c.id==='c1'),{deletedAt:'2026-10-01T12:00:00Z',deletedBy:'admin1',deletionReason:'Remoção por moderação administrativa.'});
  const p=createPlatform({initialState:seed,clock:()=>Date.parse('2026-11-25T12:00:00Z')});p.switchActor('creator1');
  assert.throws(()=>p.moderateCampaign({campaignId:'c1',deleted:false,reason,idempotencyKey:'recuperar-antes'}),code('FORBIDDEN'));
  const settled=p.moderateCampaign({campaignId:'c1',deleted:true,reason,idempotencyKey:'liquidar-legado'});
  assert.equal(settled.deletedBy,'admin1');assert.equal(settled.purgeAfter,'2026-12-25T12:00:00.000Z');
  assert.throws(()=>p.moderateCampaign({campaignId:'c1',deleted:false,reason,idempotencyKey:'recuperar-depois'}),code('FORBIDDEN'));
});
