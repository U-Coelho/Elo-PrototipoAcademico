import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {authenticatedFixture,projectPayload} from './helpers/authenticated-fixture.mjs';
let app,owner,other,backer,admin,project,support;
before(async()=>{app=await authenticatedFixture();owner=await app.client('media_owner');other=await app.client('media_other');backer=await app.client('media_viewer');admin=await app.client('admin');
 project=(await owner.command('createCampaign',projectPayload({rewards:[{title:'Uma cópia',description:'Acesso ao jogo.',amountCents:500}],milestones:[{title:'Versão alpha',amountCents:2000000}]}))).body.result;
 support=(await backer.command('createContribution',{campaignId:project.id,rewardId:project.rewards[0].id,amountCents:500,mode:'once',idempotencyKey:'apoio'})).body.result;
});
after(async()=>app?.close());
const payload=()=>({contributionId:support.id,message:'Entrega privada da minha cópia digital.',url:'https://example.test/recompensa-individual'});
test('API valida metas adicionais e entrega sem converter erros de formulário em erro interno',async()=>{
 assert.equal((await admin.command('createCampaign',projectPayload())).status,403);
 const badProfile=await owner.command('updateCreatorProfile',{bio:'',links:[{label:'Site',url:'https://example.test/'+'á'.repeat(100)}]});assert.equal(badProfile.status,400);assert.equal(badProfile.body.error.code,'INVALID_LINK');
 assert.equal(project.milestones.length,1);
 const invalid=await owner.command('updateCampaign',{campaignId:project.id,milestones:[{title:'Meta inválida',amountCents:1}]});assert.equal(invalid.status,400);assert.equal(invalid.body.error.code,'INVALID_MILESTONES');
 assert.equal((await owner.command('publishRewardDelivery',payload())).status,409);
 assert.equal((await backer.command('simulatePayment',{id:support.id,outcome:'confirmed'})).status,200);
 const unsafe=await owner.command('publishRewardDelivery',{...payload(),url:'https://pessoa:senha@example.test/segredo'});assert.equal(unsafe.status,400);assert.equal(unsafe.body.error.code,'INVALID_DELIVERY');
 const expanded=await owner.command('publishRewardDelivery',{...payload(),url:'https://example.test/'+'á'.repeat(180)});assert.equal(expanded.status,400);assert.equal(expanded.body.error.code,'INVALID_DELIVERY');
});
test('dois envios iguais persistem uma entrega e apenas participantes recebem mensagem e link',async()=>{
 assert.equal((await other.command('publishRewardDelivery',payload())).status,403);assert.equal((await admin.command('publishRewardDelivery',payload())).status,403);
 const results=await Promise.all([owner.command('publishRewardDelivery',payload()),owner.command('publishRewardDelivery',payload())]);assert.ok(results.every(r=>r.status===200));assert.equal(results[0].body.result.id,results[1].body.result.id);
 for(const client of [other,admin]){await client.request('/api/state');assert.deepEqual(client.state.rewardDeliveries,[]);assert.doesNotMatch(JSON.stringify(client.state),/recompensa-individual|Entrega privada da minha/);}
 await backer.request('/api/state');const d=backer.state.rewardDeliveries[0];assert.equal(d.url,payload().url);
 assert.equal((await other.command('acknowledgeRewardDelivery',{deliveryId:d.id})).status,403);
 assert.equal((await backer.command('acknowledgeRewardDelivery',{deliveryId:d.id})).body.result.status,'received');
 assert.equal((await backer.command('acknowledgeRewardDelivery',{deliveryId:d.id})).body.result.duplicate,true);
 const exported=await backer.request('/api/export');assert.equal(exported.body.rewardDeliveries.length,1);
 assert.doesNotMatch(JSON.stringify(owner.state.auditLog),/recompensa-individual/);
 const workspace=await app.authentication.workspace();assert.equal(Number((await app.pool.query('SELECT count(*) FROM reward_deliveries WHERE workspace_id=$1',[workspace])).rows[0].count),1);
 const denied=await owner.raw('/api/commands',{body:JSON.stringify({command:'publishRewardDelivery',payload:payload()}),headers:{'Content-Type':'application/json','X-CSRF-Token':'incorreto'}});assert.equal(denied.status,403);
 assert.equal((await admin.command('purgeExpiredProjects')).status,400);
});
test('alteração exige nova confirmação; devolução revoga conteúdo da API e exportação',async()=>{
 const changed=await owner.command('publishRewardDelivery',{...payload(),message:'Uma entrega atualizada para este apoio.'});assert.equal(changed.status,200);assert.equal(changed.body.result.version,2);assert.equal(changed.body.result.acknowledgedAt,null);
 const deletion=await owner.command('moderateCampaign',{campaignId:project.id,deleted:true,reason:'Encerramento integral do projeto.',idempotencyKey:'excluir'});assert.equal(deletion.status,200);assert.ok(deletion.body.result.purgeAfter);
 await backer.request('/api/state');assert.deepEqual(backer.state.rewardDeliveries,[]);assert.deepEqual((await backer.request('/api/export')).body.rewardDeliveries,[]);
 assert.equal((await backer.command('acknowledgeRewardDelivery',{deliveryId:changed.body.result.id})).status,409);
 const restored=await owner.command('moderateCampaign',{campaignId:project.id,deleted:false,reason:'Recuperação dentro do prazo.',idempotencyKey:'recuperar'});assert.equal(restored.status,200);assert.equal(restored.body.result.purgeAfter,undefined);
 assert.equal((await owner.command('publishRewardDelivery',payload())).status,409);
});
