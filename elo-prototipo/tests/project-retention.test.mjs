import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEmbeddedPool} from '../server/db/embedded.mjs';
import {createPostgresRepository} from '../server/repository/postgres.js';
import {createPlatform,createSeedState} from '../server/domain/platform.js';
import {createProjectCleanup} from '../server/projects/cleanup.mjs';

test('limpeza persistente respeita o prazo, remove capa e conteúdo, conserva recibos e é idempotente',async t=>{
  const pool=await createEmbeddedPool();t.after(()=>pool.end());const repo=createPostgresRepository(pool);await repo.initialize();
  const id=await repo.createWorkspace(createSeedState());let time=Date.parse('2026-11-25T12:00:00Z');
  await repo.transact(id,state=>{const p=createPlatform({initialState:state,clock:()=>time});p.switchActor('creator1');p.moderateCampaign({campaignId:'c1',deleted:true,reason:'Encerramento da campanha de teste.',idempotencyKey:'deletar'});return {state:p.getState()};});
  await pool.query("INSERT INTO project_images(workspace_id,campaign_id,image) VALUES($1,'c1',$2)",[id,Buffer.from([1,2,3])]);
  const before=await repo.read(id),cleanup=createProjectCleanup({pool,repository:repo,clock:()=>time});
  assert.deepEqual(await cleanup.run(),[]);time+=30*86400000;
  assert.deepEqual(await cleanup.run(),['c1']);const after=await repo.read(id);
  assert.equal(after.campaigns.find(c=>c.id==='c1').title,'Projeto removido');assert.deepEqual(after.contributions,before.contributions);assert.deepEqual(after.ledger,before.ledger);
  assert.equal((await pool.query('SELECT count(*) FROM project_images WHERE workspace_id=$1',[id])).rows[0].count,0);
  assert.doesNotThrow(()=>createPlatform({initialState:after}));assert.deepEqual(await cleanup.run(),[]);
  assert.equal(after.auditLog.filter(e=>e.action==='campaign.content_purged').length,1);assert.equal(after.auditLog[0].actorId,'system');
});

test('projeto recuperado antes do prazo e exclusão legada sem agendamento não são expurgados',async t=>{
  const pool=await createEmbeddedPool();t.after(()=>pool.end());const repo=createPostgresRepository(pool);await repo.initialize();
  const seed=createSeedState();Object.assign(seed.campaigns[1],{deletedAt:'2026-10-01T12:00:00Z',deletedBy:'admin1',deletionReason:'Ocultação antiga, sem prazo novo.'});
  const id=await repo.createWorkspace(seed);let time=Date.parse('2026-11-25T12:00:00Z');
  await repo.transact(id,state=>{const p=createPlatform({initialState:state,clock:()=>time});p.switchActor('creator1');p.moderateCampaign({campaignId:'c1',deleted:true,reason:'Exclusão temporária para teste.',idempotencyKey:'remover'});p.moderateCampaign({campaignId:'c1',deleted:false,reason:'Recuperação dentro do prazo.',idempotencyKey:'recuperar'});return {state:p.getState()};});
  time+=31*86400000;assert.deepEqual(await createProjectCleanup({pool,repository:repo,clock:()=>time}).run(),[]);
  assert.ok((await repo.read(id)).campaigns.every(c=>!c.purgedAt));
});

test('prazo de retenção usa 720 horas mesmo quando a conexão atravessa horário de verão',async t=>{
  const pool=await createEmbeddedPool();t.after(()=>pool.end());const repo=createPostgresRepository(pool);await repo.initialize();
  await pool.query("SET TIME ZONE 'America/New_York'");const id=await repo.createWorkspace(createSeedState()),clock=()=>Date.parse('2027-10-15T12:00:00Z');
  await repo.transact(id,state=>{const p=createPlatform({initialState:state,clock});p.switchActor('creator1');p.moderateCampaign({campaignId:'c1',deleted:true,reason:'Encerramento na mudança de horário.',idempotencyKey:'dst'});return {state:p.getState()};});
  assert.equal((await repo.read(id)).campaigns.find(c=>c.id==='c1').purgeAfter,'2027-11-14T12:00:00.000Z');
});

test('auditoria cheia não retém conteúdo expirado nem impede a limpeza dos outros cenários',async t=>{
  const pool=await createEmbeddedPool();t.after(()=>pool.end());const repo=createPostgresRepository(pool);await repo.initialize();
  const start=Date.parse('2026-11-25T12:00:00Z'),p=createPlatform({clock:()=>start});p.switchActor('creator1');p.moderateCampaign({campaignId:'c1',deleted:true,reason:'Encerramento com histórico extenso.',idempotencyKey:'cheio'});
  const state=p.getState(),event=state.auditLog.find(e=>e.action==='demo.initialized');while(state.auditLog.length<10000)state.auditLog.push({...event,id:'historical-'+state.auditLog.length});
  const full=await repo.createWorkspace(state);await repo.createWorkspace(p.getState());
  const ids=await createProjectCleanup({pool,repository:repo,clock:()=>start+30*86400000}).run();assert.equal(ids.filter(id=>id==='c1').length,2);
  const after=await repo.read(full);assert.equal(after.auditLog.length,10001);assert.equal(after.auditLog.filter(e=>e.action==='campaign.content_purged').length,1);
  assert.deepEqual(after.auditLog.slice(1),state.auditLog);assert.deepEqual(after.ledger,state.ledger);
  const domain=createPlatform({initialState:after});domain.switchActor('creator1');assert.throws(()=>domain.updateCreatorProfile({bio:'Nova alteração bloqueada por capacidade.',links:[]}),e=>e.code==='DEMO_LIMIT');
  await repo.transact(full,state=>({state}));
});
