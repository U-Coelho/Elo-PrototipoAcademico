import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRepository } from '../server/repository/postgres.js';
import { createPlatform, createSeedState } from '../server/domain/platform.js';

const enabled = process.env.ELO_RUN_POSTGRES_TESTS === '1';
const connectionString = process.env.DATABASE_URL;
const skip = !enabled
  ? 'PostgreSQL real não executado: defina ELO_RUN_POSTGRES_TESTS=1 e DATABASE_URL para um banco de testes.'
  : !connectionString
    ? 'PostgreSQL real não executado: DATABASE_URL é obrigatório.'
    : false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const operation = (state, actorId, mutate) => {
  const domain = createPlatform({ initialState: state });
  domain.switchActor(actorId);
  const result = mutate(domain);
  return { state: domain.getState(), result };
};

/** Reserve two physical PostgreSQL connections and force the second request to
 * attempt its row lock while the first request still holds it. No timing sleep
 * or in-memory replacement is used to claim transaction concurrency. */
async function concurrentTransactions(pool, workspaceId, first, second) {
  const clientA = await pool.connect();
  let clientB;
  const firstLocked = deferred(), secondAttempted = deferred(), releaseFirst = deferred();
  const running = [];
  try {
    clientB = await pool.connect();
    const [pidA, pidB] = await Promise.all([
      clientA.query('SELECT pg_backend_pid() AS pid'),
      clientB.query('SELECT pg_backend_pid() AS pid'),
    ]);
    assert.notEqual(pidA.rows[0].pid, pidB.rows[0].pid, 'As operações precisam usar conexões PostgreSQL distintas.');
    const connection = (client, onLockAttempt) => ({
      connect: async () => ({
        query(sql, parameters) {
          if (String(sql).includes('FOR UPDATE')) onLockAttempt?.();
          return client.query(sql, parameters);
        },
        release() {}, // Physical clients are released once, by this fixture.
      }),
    });
    const repoA = createPostgresRepository(connection(clientA));
    const repoB = createPostgresRepository(connection(clientB, () => secondAttempted.resolve()));
    const pendingA = repoA.transact(workspaceId, async state => {
      firstLocked.resolve();
      await releaseFirst.promise;
      return first(state);
    });
    running.push(pendingA);
    // Also settle the gate on failure so a broken database cannot hang the test.
    pendingA.catch(error => firstLocked.resolve({ error }));
    const firstGate = await firstLocked.promise;
    if (firstGate?.error) throw firstGate.error;
    const pendingB = repoB.transact(workspaceId, state => second(state));
    running.push(pendingB);
    pendingB.catch(error => secondAttempted.resolve({ error }));
    const secondGate = await secondAttempted.promise;
    if (secondGate?.error) throw secondGate.error;
    releaseFirst.resolve();
    return await Promise.allSettled(running);
  } finally {
    releaseFirst.resolve();
    await Promise.allSettled(running);
    clientB?.release();
    clientA.release();
  }
}

test('integração PostgreSQL real: concorrência, idempotência e rollback', { skip, timeout: 90000 }, async t => {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 10000, statement_timeout: 15000, application_name: 'elo-real-postgres-tests' });
  const repo = createPostgresRepository(pool);
  const createdWorkspaces = new Set();
  t.after(async () => {
    try {
      // Only fresh UUIDs returned to this test are eligible for cleanup.
      // There is deliberately no schema/table truncation or database reset.
      for (const id of createdWorkspaces) {
        assert.match(id, UUID);
        await pool.query('DELETE FROM demo_workspaces WHERE id = $1', [id]);
      }
    } finally { await pool.end(); }
  });
  await repo.initialize();
  const freshWorkspace = async () => {
    const id = await repo.createWorkspace(createSeedState());
    assert.match(id, UUID);
    createdWorkspaces.add(id);
    return id;
  };

  await t.test('duas conexões confirmando o mesmo pagamento geram um único crédito', async () => {
    const workspaceId = await freshWorkspace();
    const before = await repo.read(workspaceId);
    const initialCampaign = before.campaigns.find(c => c.id === 'c2');
    const outcomes = await concurrentTransactions(pool, workspaceId,
      state => operation(state, 'supporter1', domain => domain.simulatePayment('support-3', 'confirmed')),
      state => operation(state, 'supporter1', domain => domain.simulatePayment('support-3', 'confirmed')),
    );
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 2);
    assert.equal(outcomes.filter(o => o.value?.duplicate === true).length, 1);
    const after = await repo.read(workspaceId);
    assert.equal(after.contributions.find(c => c.id === 'support-3').status, 'confirmed');
    assert.equal(after.campaigns.find(c => c.id === 'c2').raisedCents, initialCampaign.raisedCents + 5000);
    const credits = after.ledger.filter(l => l.contributionId === 'support-3' && l.direction === 'in');
    assert.equal(credits.length, 1);
    assert.equal(credits[0].amountCents, 5000);
    const persisted = await pool.query('SELECT count(*)::int AS count FROM ledger_entries WHERE workspace_id = $1 AND contribution_id = $2 AND direction = $3', [workspaceId, 'support-3', 'in']);
    assert.equal(persisted.rows[0].count, 1);
  });

  await t.test('dois pedidos concorrentes de repasse não reutilizam o mesmo saldo', async () => {
    const workspaceId = await freshWorkspace();
    const outcomes = await concurrentTransactions(pool, workspaceId,
      state => operation(state, 'creator1', domain => domain.requestPayout({ amountCents: 200000, idempotencyKey: 'pg-payout-a' })),
      state => operation(state, 'creator1', domain => domain.requestPayout({ amountCents: 200000, idempotencyKey: 'pg-payout-b' })),
    );
    assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
    const refusal = outcomes.find(o => o.status === 'rejected');
    assert.equal(refusal?.reason.code, 'INSUFFICIENT_BALANCE');
    const state = await repo.read(workspaceId);
    const domain = createPlatform({ initialState: state }); domain.switchActor('creator1');
    assert.equal(domain.getSummary().availableBalanceCents, 48000);
    assert.equal(state.payouts.length, 1);
    assert.equal(state.ledger.filter(l => l.type === 'payout').length, 1);
    const persisted = await pool.query('SELECT count(*)::int AS count FROM payouts WHERE workspace_id = $1', [workspaceId]);
    assert.equal(persisted.rows[0].count, 1);
  });

  await t.test('erro de domínio desfaz todas as alterações de uma operação composta', async () => {
    const workspaceId = await freshWorkspace();
    const before = await repo.read(workspaceId);
    await assert.rejects(repo.transact(workspaceId, state => operation(state, 'supporter1', domain => {
      domain.createContribution({ campaignId: 'c1', amountCents: 5000, idempotencyKey: 'will-rollback' });
      return domain.requestPayout({ amountCents: 500, idempotencyKey: 'wrong-role' });
    })), error => error.code === 'FORBIDDEN');
    assert.deepEqual(await repo.read(workspaceId), before);
  });

  await t.test('violação de restrição SQL preserva o estado anterior completo', async () => {
    const workspaceId = await freshWorkspace();
    const before = await repo.read(workspaceId);
    await assert.rejects(repo.transact(workspaceId, async (state,client) => {
      await client.query('UPDATE campaigns SET title=$1 WHERE workspace_id=$2',['Alteração que deve ser desfeita',workspaceId]);
      await client.query('UPDATE ledger_entries SET amount_cents=-1 WHERE workspace_id=$1',[workspaceId]);
      return {state,result:true};
    }), error => error.code === '23514');
    assert.deepEqual(await repo.read(workspaceId), before);
  });

  await t.test('chave idempotente persistida rejeita outro valor e não cria apoio adicional', async () => {
    const workspaceId = await freshWorkspace();
    const payload = { campaignId: 'c1', amountCents: 5000, mode: 'once', idempotencyKey: 'pg-same-operation' };
    const created = await repo.transact(workspaceId, state => operation(state, 'supporter1', domain => domain.createContribution(payload)));
    const replay = await repo.transact(workspaceId, state => operation(state, 'supporter1', domain => domain.createContribution(payload)));
    assert.equal(replay.id, created.id);
    const beforeConflict = await repo.read(workspaceId);
    await assert.rejects(repo.transact(workspaceId, state => operation(state, 'supporter1', domain => domain.createContribution({ ...payload, amountCents: 7000 }))), error => error.code === 'IDEMPOTENCY_CONFLICT');
    assert.deepEqual(await repo.read(workspaceId), beforeConflict);
    assert.equal(beforeConflict.contributions.filter(c => c.id === created.id).length, 1);
    const persisted = await pool.query('SELECT count(*)::int AS count FROM idempotency_records WHERE workspace_id = $1', [workspaceId]);
    assert.equal(persisted.rows[0].count, 1);
  });

  const deletion={campaignId:'c1',deleted:true,reason:'Encerrar projeto de teste.',idempotencyKey:'pg-excluir'};
  await t.test('entrega digital concorrente persiste uma única versão e é revogada pela devolução',async()=>{
    const id=await freshWorkspace();
    const c=await repo.transact(id,state=>operation(state,'creator1',p=>p.createCampaign({title:'Jogo com recompensa digital',description:'Projeto para verificar entrega privada e persistência no PostgreSQL.',category:'Jogos',goalCents:4500000,rewards:[{title:'Cópia digital',description:'Acesso ao jogo.',amountCents:2500}],milestones:[{title:'Versão alpha',amountCents:7000000}]})));
    const s=await repo.transact(id,state=>operation(state,'supporter1',p=>{const s=p.createContribution({campaignId:c.id,rewardId:c.rewards[0].id,amountCents:2500,idempotencyKey:'pg-reward'});return p.simulatePayment(s.id);}));
    const payload={contributionId:s.id,message:'Sua cópia digital de teste.',url:'https://example.test/privado'};
    const results=await concurrentTransactions(pool,id,state=>operation(state,'creator1',p=>p.publishRewardDelivery(payload)),state=>operation(state,'creator1',p=>p.publishRewardDelivery(payload)));
    assert.ok(results.every(r=>r.status==='fulfilled'));assert.equal(results[0].value.id,results[1].value.id);assert.equal(results.filter(r=>r.value.duplicate).length,1);
    const before=await repo.read(id);assert.equal(before.rewardDeliveries.length,1);assert.equal(before.campaigns.find(p=>p.id===c.id).milestones[0].amountCents,7000000);
    await repo.transact(id,state=>operation(state,'creator1',p=>p.moderateCampaign({...deletion,campaignId:c.id})));
    const p=createPlatform({initialState:await repo.read(id)});assert.deepEqual(p.getPublicState('supporter1').rewardDeliveries,[]);assert.deepEqual(p.getPublicState('admin1').rewardDeliveries,[]);
  });
  await t.test('dois expurgos concorrentes removem conteúdo uma vez e conservam registros financeiros',async()=>{
    const id=await freshWorkspace(),start=Date.parse('2026-11-25T12:00:00Z');
    await repo.transact(id,state=>{const p=createPlatform({initialState:state,clock:()=>start});p.switchActor('creator1');p.moderateCampaign(deletion);return {state:p.getState()};});
    await pool.query("INSERT INTO project_images(workspace_id,campaign_id,image) VALUES($1,'c1',$2)",[id,Buffer.from([1,2,3])]);
    const before=await repo.read(id);
    const execute=state=>{const p=createPlatform({initialState:state,clock:()=>start+30*86400000}),ids=p.purgeExpiredProjects();return {state:p.getState(),result:ids};};
    const results=await concurrentTransactions(pool,id,execute,execute);assert.ok(results.every(r=>r.status==='fulfilled'));assert.equal(results.flatMap(r=>r.value).length,1);
    const after=await repo.read(id);assert.deepEqual(after.ledger,before.ledger);assert.deepEqual(after.contributions,before.contributions);assert.equal(after.auditLog.filter(e=>e.action==='campaign.content_purged').length,1);
    assert.equal(Number((await pool.query('SELECT count(*) FROM project_images WHERE workspace_id=$1',[id])).rows[0].count),0);
    const p=createPlatform({initialState:after,clock:()=>start+30*86400000});p.switchActor('admin1');assert.throws(()=>p.moderateCampaign({...deletion,deleted:false}),e=>e.code==='PROJECT_EXPIRED');
  });
  await t.test('repasse em andamento consome saldo antes da exclusão concorrente',async()=>{
    const id=await freshWorkspace();
    const [paid,removed]=await concurrentTransactions(pool,id,
      state=>operation(state,'creator1',p=>p.requestPayout({amountCents:247000,idempotencyKey:'pg-retirar'})),
      state=>operation(state,'creator1',p=>p.moderateCampaign(deletion)));
    assert.equal(paid.status,'fulfilled');assert.equal(removed.reason?.code,'REFUND_INSUFFICIENT_BALANCE');
    const after=await repo.read(id);
    assert.equal(after.ledger.filter(e=>e.type==='refund').length,0);
    assert.equal(after.campaigns.find(c=>c.id==='c1').deletedAt,undefined);
  });
  await t.test('pagamento confirmado durante disputa entra no lote e a exclusão repetida mantém um par por apoio',async()=>{
    const id=await freshWorkspace();
    const pending=await repo.transact(id,state=>operation(state,'supporter1',p=>p.createContribution({campaignId:'c1',amountCents:2000,idempotencyKey:'pg-pendente'})));
    const [paid,removed]=await concurrentTransactions(pool,id,
      state=>operation(state,'supporter1',p=>p.simulatePayment(pending.id)),
      state=>operation(state,'creator1',p=>p.moderateCampaign(deletion)));
    assert.equal(paid.status,'fulfilled');assert.equal(removed.value?.deletionSummary.refundedCents,9500);
    const replay=await repo.transact(id,state=>operation(state,'creator1',p=>p.moderateCampaign(deletion)));
    assert.equal(replay.duplicate,true);assert.deepEqual(replay.deletionSummary,removed.value.deletionSummary);
    const after=await repo.read(id);
    assert.equal(after.ledger.filter(e=>e.type==='refund').length,4);
    assert.equal(after.contributions.find(c=>c.id===pending.id).refundStatus,'completed');
  });
});
