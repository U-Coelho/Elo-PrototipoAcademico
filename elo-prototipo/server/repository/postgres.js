import { randomUUID } from 'node:crypto';
import { applyMigrations } from '../db/migrations.js';
import { assertValidState } from '../domain/platform.js';

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const workspaceError = () => Object.assign(new Error('Cenário de demonstração não encontrado.'), { code: 'NOT_FOUND' });
const extras = (item, keys) => Object.fromEntries(Object.entries(item).filter(([name]) => !keys.includes(name)));
const iso = value => value == null ? null : new Date(value).toISOString();
const integer = value => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0 || n > MAX_SAFE) throw new Error('Valor inteiro inválido retornado pelo banco.'); return n; };

// Identifiers and SQL types below are code-owned constants, never request input.
const definitions = {
  demo_users: { workspace_id: 'uuid', id: 'text', name: 'text', role: 'text' },
  campaigns: { workspace_id: 'uuid', id: 'text', creator_id: 'text', title: 'text', category: 'text', description: 'text', image: 'text', goal_cents: 'bigint', raised_cents: 'bigint', backers: 'integer', days_left: 'integer', monthly: 'boolean', featured: 'boolean', story: 'text', location: 'text', rewards: 'jsonb', extra: 'jsonb', position: 'integer' },
  contributions: { workspace_id: 'uuid', id: 'text', campaign_id: 'text', supporter_id: 'text', creator_id: 'text', amount_cents: 'bigint', mode: 'text', status: 'text', subscription_status: 'text', transaction_id: 'text', created_at: 'timestamptz', confirmed_at: 'timestamptz', refund_status:'text',refund_id:'text',refund_batch_id:'text',refunded_at:'timestamptz',refunded_by:'text',refund_reason:'text',extra: 'jsonb', position: 'integer' },
  payouts: { workspace_id: 'uuid', id: 'text', creator_id: 'text', amount_cents: 'bigint', status: 'text', destination: 'text', created_at: 'timestamptz', extra: 'jsonb', position: 'integer' },
  ledger_entries: { workspace_id: 'uuid', id: 'text', owner_id: 'text', type: 'text', direction: 'text', amount_cents: 'bigint', contribution_id: 'text', campaign_id: 'text', payout_id: 'text', description: 'text', created_at: 'timestamptz', extra: 'jsonb', position: 'integer' },
  audit_events: { workspace_id: 'uuid', id: 'text', actor_id: 'text', action: 'text', resource_id: 'text', description: 'text', created_at: 'timestamptz', extra: 'jsonb', position: 'integer' },
  favorites: { workspace_id: 'uuid', campaign_id: 'text', position: 'integer' },
  idempotency_records: { workspace_id: 'uuid', operation_key: 'text', fingerprint: 'text', resource_id: 'text', extra: 'jsonb' },
  creator_profiles: { workspace_id: 'uuid', id: 'text', creator_id: 'text', bio: 'text', links: 'jsonb', joined_at: 'timestamptz', extra: 'jsonb', position: 'integer' },
  project_updates: { workspace_id: 'uuid', id: 'text', campaign_id: 'text', creator_id: 'text', title: 'text', body: 'text', created_at: 'timestamptz', extra: 'jsonb', position: 'integer' },
  project_comments: { workspace_id: 'uuid', id: 'text', campaign_id: 'text', author_id: 'text', body: 'text', created_at: 'timestamptz', extra: 'jsonb', position: 'integer' },
  account_moderations: { workspace_id: 'uuid', id: 'text', account_id: 'text', banned: 'boolean', moderation_type: 'text', expires_at: 'timestamptz', reason: 'text', updated_at: 'timestamptz', updated_by: 'text', extra: 'jsonb', position: 'integer' },
  direct_messages: { workspace_id: 'uuid', id: 'text', creator_id: 'text', sender_id: 'text', body: 'text', created_at: 'timestamptz', extra: 'jsonb', position: 'integer' },
  reward_deliveries: { workspace_id:'uuid',id:'text',contribution_id:'text',campaign_id:'text',creator_id:'text',supporter_id:'text',message:'text',url:'text',status:'text',version:'integer',created_at:'timestamptz',updated_at:'timestamptz',acknowledged_at:'timestamptz',position:'integer' },
};

const campaignKeys = ['id','creatorId','creator','title','category','description','image','goalCents','raisedCents','backers','daysLeft','monthly','featured','story','location','rewards'];
const contributionKeys = ['id','campaignId','supporterId','creatorId','amountCents','mode','status','subscriptionStatus','transactionId','createdAt','confirmedAt','refundStatus','refundId','refundBatchId','refundedAt','refundedBy','refundReason'];
const payoutKeys = ['id','creatorId','amountCents','status','destination','createdAt'];
const ledgerKeys = ['id','ownerId','type','direction','amountCents','contributionId','campaignId','payoutId','description','createdAt'];
const auditKeys = ['id','actorId','action','resourceId','description','createdAt'];
const profileKeys = ['id','creatorId','bio','links','joinedAt'];
const updateKeys = ['id','campaignId','creatorId','title','body','createdAt'];
const commentKeys = ['id','campaignId','authorId','authorName','body','createdAt'];
const moderationKeys = ['id','accountId','banned','type','expiresAt','reason','updatedAt','updatedBy'];
const messageKeys = ['id','creatorId','senderId','body','createdAt'];

async function insertRows(client, table, rows) {
  if (!rows.length) return;
  const definition = definitions[table];
  if (!definition) throw new Error('Tabela não suportada pelo repositório.');
  const columns = Object.keys(definition);
  await client.query(`INSERT INTO ${table} (${columns.join(', ')})
    SELECT ${columns.join(', ')} FROM jsonb_to_recordset($1::jsonb)
    AS entries(${columns.map(name => `${name} ${definition[name]}`).join(', ')})`, [JSON.stringify(rows)]);
}

function usersFor(state) {
  const users = new Map([
    ['supporter1', { id: 'supporter1', name: 'Ana Souza', role: 'supporter' }],
    ['creator1', { id: 'creator1', name: 'Marina Costa', role: 'creator' }],
    ['admin1', { id: 'admin1', name: 'Rafael Lima', role: 'admin' }],
    ['system', { id: 'system', name: 'Sistema fictício', role: 'system' }],
  ]);
  for (const actor of state.actors || []) users.set(actor.id, { id: actor.id, name: actor.name, role: actor.role });
  for (const campaign of state.campaigns) if (!users.has(campaign.creatorId)) users.set(campaign.creatorId, { id: campaign.creatorId, name: campaign.creator, role: 'creator' });
  for (const support of state.contributions) if (!users.has(support.supporterId)) users.set(support.supporterId, { id: support.supporterId, name: support.supporterName || support.supporterId, role: 'supporter' });
  return [...users.values()];
}

/** The whole replacement is inside one row-locked transaction. It only touches
 * this isolated fictitious workspace. Production-scale workloads should persist
 * changes incrementally rather than replace a small demonstration aggregate. */
async function writeState(client, workspaceId, state, existingHistory) {
  assertValidState(state,existingHistory);
  for (const table of ['reward_deliveries','direct_messages','account_moderations','project_comments','project_updates','creator_profiles','favorites','idempotency_records','ledger_entries','audit_events','payouts','contributions','campaigns','demo_users']) {
    await client.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId]);
  }
  await insertRows(client, 'demo_users', usersFor(state).map(user => ({ workspace_id: workspaceId, ...user })));
  await insertRows(client, 'account_moderations', (state.accountModerations || []).map((m, position) => ({
    workspace_id:workspaceId,id:m.id,account_id:m.accountId,banned:m.banned,moderation_type:m.type ?? (m.banned?'ban':'none'),expires_at:m.expiresAt ?? null,reason:m.reason,
    updated_at:m.updatedAt,updated_by:m.updatedBy,extra:extras(m,moderationKeys),position,
  })));
  await insertRows(client, 'direct_messages', (state.directMessages || []).map((m, position) => ({
    workspace_id:workspaceId,id:m.id,creator_id:m.creatorId,sender_id:m.senderId,body:m.body,
    created_at:m.createdAt,extra:extras(m,messageKeys),position,
  })));
  await insertRows(client, 'campaigns', state.campaigns.map((c, position) => ({
    workspace_id: workspaceId, id: c.id, creator_id: c.creatorId, title: c.title, category: c.category,
    description: c.description, image: c.image, goal_cents: c.goalCents, raised_cents: c.raisedCents,
    backers: c.backers, days_left: c.daysLeft, monthly: c.monthly, featured: c.featured,
    story: c.story, location: c.location ?? null, rewards: c.rewards, extra: extras(c,campaignKeys), position,
  })));
  await insertRows(client, 'creator_profiles', (state.creatorProfiles || []).map((p, position) => ({
    workspace_id:workspaceId, id:p.id, creator_id:p.creatorId, bio:p.bio, links:p.links,
    joined_at:p.joinedAt, extra:extras(p,profileKeys), position,
  })));
  await insertRows(client, 'project_updates', (state.projectUpdates || []).map((u, position) => ({
    workspace_id:workspaceId, id:u.id, campaign_id:u.campaignId, creator_id:u.creatorId,
    title:u.title, body:u.body, created_at:u.createdAt, extra:extras(u,updateKeys), position,
  })));
  await insertRows(client, 'project_comments', (state.projectComments || []).map((c, position) => ({
    workspace_id:workspaceId, id:c.id, campaign_id:c.campaignId, author_id:c.authorId,
    body:c.body, created_at:c.createdAt, extra:extras(c,commentKeys), position,
  })));
  await insertRows(client, 'contributions', state.contributions.map((c, position) => ({
    workspace_id: workspaceId, id: c.id, campaign_id: c.campaignId, supporter_id: c.supporterId,
    creator_id: c.creatorId, amount_cents: c.amountCents, mode: c.mode, status: c.status,
    subscription_status: c.subscriptionStatus ?? null, transaction_id: c.transactionId,
    created_at: c.createdAt, confirmed_at: c.confirmedAt ?? null, extra: extras(c,contributionKeys), position,
    refund_status:c.refundStatus,refund_id:c.refundId,refund_batch_id:c.refundBatchId,
    refunded_at:c.refundedAt,refunded_by:c.refundedBy,refund_reason:c.refundReason,
  })));
  await insertRows(client,'reward_deliveries',(state.rewardDeliveries||[]).map((d,position)=>({
    workspace_id:workspaceId,id:d.id,contribution_id:d.contributionId,campaign_id:d.campaignId,creator_id:d.creatorId,supporter_id:d.supporterId,
    message:d.message,url:d.url,status:d.status,version:d.version,created_at:d.createdAt,updated_at:d.updatedAt,acknowledged_at:d.acknowledgedAt,position,
  })));
  for(const c of state.campaigns.filter(c=>c.purgedAt))await client.query('DELETE FROM project_images WHERE workspace_id=$1 AND campaign_id=$2',[workspaceId,c.id]);
  await insertRows(client, 'payouts', state.payouts.map((p, position) => ({
    workspace_id: workspaceId, id: p.id, creator_id: p.creatorId, amount_cents: p.amountCents,
    status: p.status, destination: p.destination, created_at: p.createdAt, extra: extras(p,payoutKeys), position,
  })));
  await insertRows(client, 'ledger_entries', state.ledger.map((l, position) => ({
    workspace_id: workspaceId, id: l.id, owner_id: l.ownerId, type: l.type, direction: l.direction,
    amount_cents: l.amountCents, contribution_id: l.contributionId ?? null,
    campaign_id: l.campaignId ?? null, payout_id: l.payoutId ?? null,
    description: l.description, created_at: l.createdAt, extra: extras(l,ledgerKeys), position,
  })));
  await insertRows(client, 'audit_events', state.auditLog.map((a, position) => ({
    workspace_id: workspaceId, id: a.id, actor_id: a.actorId, action: a.action,
    resource_id: a.resourceId, description: a.description, created_at: a.createdAt,
    extra: extras(a,auditKeys), position,
  })));
  await insertRows(client, 'favorites', state.savedCampaignIds.map((id, position) => ({ workspace_id: workspaceId, campaign_id: id, position })));
  await insertRows(client, 'idempotency_records', Object.entries(state.idempotency).map(([operationKey, item]) => ({
    workspace_id: workspaceId, operation_key: operationKey, fingerprint: item.fingerprint,
    resource_id: item.resourceId, extra: extras(item,['fingerprint','resourceId']),
  })));
  await client.query(`UPDATE demo_workspaces SET schema_version = $2, sequence = $3,
    version = version + 1, updated_at = now(), favorite_state = $4::jsonb WHERE id = $1`, [workspaceId, state.schemaVersion || 1, state.sequence, JSON.stringify(state.savedByAccount||{})]);
}

async function readState(client, workspaceId, metadata) {
  const workspace = metadata || (await client.query('SELECT * FROM demo_workspaces WHERE id = $1', [workspaceId])).rows[0];
  if (!workspace) throw workspaceError();
  const query = (table, ordered = true) => client.query(`SELECT * FROM ${table} WHERE workspace_id = $1${ordered ? ' ORDER BY position, id' : ''}`, [workspaceId]);
  // One connection and one transaction provide a consistent snapshot across all tables.
  const users = (await query('demo_users',false)).rows;
  const names = new Map(users.map(user => [user.id,user.name]));
  const campaigns = (await query('campaigns')).rows.map(c => ({
    ...c.extra, id:c.id, creatorId:c.creator_id, creator:names.get(c.creator_id), title:c.title,
    category:c.category, description:c.description, image:c.image, goalCents:integer(c.goal_cents),
    raisedCents:integer(c.raised_cents), backers:c.backers, daysLeft:c.days_left,
    monthly:c.monthly, featured:c.featured, story:c.story,
    ...(c.location == null ? {} : { location:c.location }), rewards:c.rewards,
  }));
  const contributions = (await query('contributions')).rows.map(c => ({
    ...c.extra, id:c.id, campaignId:c.campaign_id, supporterId:c.supporter_id, creatorId:c.creator_id,
    amountCents:integer(c.amount_cents), mode:c.mode, status:c.status,
    subscriptionStatus:c.subscription_status, transactionId:c.transaction_id,
    createdAt:iso(c.created_at), confirmedAt:iso(c.confirmed_at),
    refundStatus:c.refund_status,...(c.refund_status==='completed'?{refundId:c.refund_id,refundBatchId:c.refund_batch_id,
      refundedAt:iso(c.refunded_at),refundedBy:c.refunded_by,refundReason:c.refund_reason}:{}),
  }));
  const payouts = (await query('payouts')).rows.map(p => ({
    ...p.extra, id:p.id, creatorId:p.creator_id, amountCents:integer(p.amount_cents),
    status:p.status, destination:p.destination, createdAt:iso(p.created_at),
  }));
  const ledger = (await query('ledger_entries')).rows.map(l => ({
    ...l.extra, id:l.id, ownerId:l.owner_id, type:l.type, direction:l.direction,
    amountCents:integer(l.amount_cents), ...(l.contribution_id == null ? {} : { contributionId:l.contribution_id }),
    ...(l.campaign_id == null ? {} : { campaignId:l.campaign_id }),
    ...(l.payout_id == null ? {} : { payoutId:l.payout_id }), description:l.description, createdAt:iso(l.created_at),
  }));
  const auditLog = (await query('audit_events')).rows.map(a => ({
    ...a.extra, id:a.id, actorId:a.actor_id, action:a.action, resourceId:a.resource_id,
    description:a.description, createdAt:iso(a.created_at),
  }));
  const savedCampaignIds = (await client.query('SELECT campaign_id FROM favorites WHERE workspace_id = $1 ORDER BY position, campaign_id', [workspaceId])).rows.map(f=>f.campaign_id);
  const idempotency = Object.fromEntries((await query('idempotency_records',false)).rows.map(i=>[i.operation_key,{...i.extra,fingerprint:i.fingerprint,resourceId:i.resource_id}]));
  const creatorProfiles = (await query('creator_profiles')).rows.map(p=>({
    ...p.extra,id:p.id,creatorId:p.creator_id,bio:p.bio,links:p.links,joinedAt:iso(p.joined_at),
  }));
  const projectUpdates = (await query('project_updates')).rows.map(u=>({
    ...u.extra,id:u.id,campaignId:u.campaign_id,creatorId:u.creator_id,title:u.title,body:u.body,createdAt:iso(u.created_at),
  }));
  const projectComments = (await query('project_comments')).rows.map(c=>({
    ...c.extra,id:c.id,campaignId:c.campaign_id,authorId:c.author_id,authorName:names.get(c.author_id),body:c.body,createdAt:iso(c.created_at),
  }));
  const accountModerations = (await query('account_moderations')).rows.map(m=>({
    ...m.extra,id:m.id,accountId:m.account_id,banned:m.banned,type:m.moderation_type,expiresAt:iso(m.expires_at),reason:m.reason,updatedAt:iso(m.updated_at),updatedBy:m.updated_by,
  }));
  const directMessages = (await query('direct_messages')).rows.map(m=>({
    ...m.extra,id:m.id,creatorId:m.creator_id,senderId:m.sender_id,body:m.body,createdAt:iso(m.created_at),
  }));
  const rewardDeliveries=(await query('reward_deliveries')).rows.map(d=>({id:d.id,contributionId:d.contribution_id,campaignId:d.campaign_id,creatorId:d.creator_id,supporterId:d.supporter_id,message:d.message,url:d.url,status:d.status,version:d.version,createdAt:iso(d.created_at),updatedAt:iso(d.updated_at),acknowledgedAt:iso(d.acknowledged_at)}));
  return { schemaVersion:workspace.schema_version, actorId:'supporter1', savedByAccount:workspace.favorite_state||{}, sequence:integer(workspace.sequence), campaigns, contributions, payouts, ledger, auditLog, savedCampaignIds, idempotency, creatorProfiles, projectUpdates, projectComments, accountModerations, directMessages,rewardDeliveries };
}

export function createPostgresRepository(pool) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('O repositório exige um Pool PostgreSQL.');
  let initialization;
  return {
    initialize() {
      if (!initialization) initialization = applyMigrations(pool).catch(error=>{initialization=null;throw error;});
      return initialization;
    },
    async createWorkspace(seedState) {
      const id = randomUUID(), client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO demo_workspaces(id, schema_version, sequence) VALUES ($1,$2,$3)', [id,seedState.schemaVersion || 1,seedState.sequence]);
        await writeState(client,id,seedState);
        await client.query('COMMIT');
        return id;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async read(workspaceId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const state = await readState(client,workspaceId);
        await client.query('COMMIT');
        return state;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async transact(workspaceId, callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const workspace = (await client.query('SELECT * FROM demo_workspaces WHERE id = $1 FOR UPDATE', [workspaceId])).rows[0];
        if (!workspace) throw workspaceError();
        const state = await readState(client,workspaceId,workspace);
        const existingHistory={ledger:state.ledger.length,auditLog:state.auditLog.length,cleanupEvents:state.auditLog.filter(e=>e.action==='campaign.content_purged').length};
        const outcome = await callback(state,client);
        if (!outcome || !outcome.state) throw new TypeError('A transação deve retornar { state, result }.');
        await writeState(client,workspaceId,outcome.state,existingHistory);
        await client.query('COMMIT');
        return outcome.result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}
