import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {authenticatedFixture,projectPayload} from './helpers/authenticated-fixture.mjs';

let app,owner,backer,admin;
before(async()=>{app=await authenticatedFixture();owner=await app.client('media_owner');backer=await app.client('media_viewer');admin=await app.client('admin');});
after(async()=>app?.close());
const reason='Encerramento verificado pela integração autenticada.';
const remove=(id,key)=>({campaignId:id,deleted:true,reason,idempotencyKey:key});
async function project(monthly=false){const result=await owner.command('createCampaign',projectPayload({monthly}));assert.equal(result.status,200);return result.body.result.id;}
async function support(id,amount,key,mode='once'){const result=await backer.command('createContribution',{campaignId:id,amountCents:amount,mode,idempotencyKey:key});assert.equal(result.status,200);assert.equal((await backer.command('simulatePayment',{id:result.body.result.id,outcome:'confirmed'})).status,200);return result.body.result.id;}

test('dono e admin devolvem uma vez, encerram recorrência e restauração não recria contratos',async()=>{
  const id=await project(true),root=await support(id,5000,'mensal','monthly');
  const pending=await backer.command('renewSubscription',{contributionId:root,idempotencyKey:'proximo'});assert.equal(pending.status,200);
  const preview=await owner.command('getCampaignDeletionPreview',{campaignId:id});assert.equal(preview.status,200);
  assert.equal(preview.body.result.requiredCents,5000);assert.equal(preview.body.result.pendingCount,1);assert.equal(preview.body.result.subscriptionCount,1);
  assert.equal((await backer.command('moderateCampaign',remove(id,'nao-dono'))).status,403);
  const deleted=await owner.command('moderateCampaign',remove(id,'excluir-dono'));assert.equal(deleted.status,200);
  assert.equal(deleted.body.result.deletionSummary.refundedCents,5000);
  await backer.request('/api/state');assert.ok(!backer.state.campaigns.some(c=>c.id===id));
  const paid=backer.state.contributions.find(c=>c.id===root),canceled=backer.state.contributions.find(c=>c.id===pending.body.result.id);
  assert.equal(paid.status,'confirmed');assert.equal(paid.refundStatus,'completed');assert.equal(paid.subscriptionStatus,'canceled');assert.ok(paid.transactionId);
  assert.equal(canceled.status,'canceled');assert.equal(canceled.cancellationReason,'project_deleted');
  const balance=(await owner.request('/api/state')).body.state.summary.availableBalanceCents;assert.equal(balance,0);
  assert.equal((await owner.command('moderateCampaign',remove(id,'excluir-dono'))).body.result.duplicate,true);
  assert.equal((await admin.command('moderateCampaign',{...remove(id,'restaurar-admin'),deleted:false})).status,200);
  await support(id,2000,'apoio-depois-restaurar');
  const replay=await owner.command('moderateCampaign',remove(id,'excluir-dono'));assert.equal(replay.status,200);assert.equal(replay.body.result.duplicate,true);
  assert.ok(!owner.state.campaigns.find(c=>c.id===id).deletedAt);
  const final=await admin.command('moderateCampaign',remove(id,'excluir-admin'));assert.equal(final.status,200);assert.equal(final.body.result.deletionSummary.refundedCents,2000);
  const refunds=(await app.pool.query("SELECT count(*) FROM ledger_entries WHERE workspace_id=$1 AND campaign_id=$2 AND type='refund'",[await app.authentication.workspace(),id])).rows[0];
  assert.equal(Number(refunds.count),4);
});

test('repasse prévio impede exclusão do dono e do admin sem cancelar apoios ou perder lançamentos',async()=>{
  const id=await project(),supportId=await support(id,1000,'retirada');
  assert.equal((await owner.command('requestPayout',{amountCents:1000,idempotencyKey:'repasse-previo'})).status,200);
  const before=(await owner.request('/api/state')).body.state;
  const preview=await owner.command('getCampaignDeletionPreview',{campaignId:id});assert.equal(preview.body.result.canDelete,false);assert.equal(preview.body.result.shortfallCents,1000);
  for(const actor of [owner,admin]){const result=await actor.command('moderateCampaign',remove(id,`sem-saldo-${actor===owner?'dono':'admin'}`));assert.equal(result.status,409);assert.equal(result.body.error.code,'REFUND_INSUFFICIENT_BALANCE');}
  await owner.request('/api/state');assert.deepEqual(owner.state.ledger,before.ledger);assert.deepEqual(owner.state.payouts,before.payouts);
  assert.ok(!owner.state.campaigns.find(c=>c.id===id).deletedAt);assert.equal(owner.state.contributions.find(c=>c.id===supportId).refundStatus,'none');
  const exported=await backer.request('/api/export');assert.equal(exported.status,200);assert.ok(exported.body.contributions.every(c=>c.supporterId===backer.state.actor.id));
});
