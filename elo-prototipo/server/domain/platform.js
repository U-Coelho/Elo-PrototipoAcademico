import { actors, campaigns as campaignCatalog, categories } from './catalog.js';
import {formatProfileLocation, validProfileLocation} from '../../src/domain/profile-location.js';
import {buildPersonalExport} from '../../src/domain/personal-export.js';
import {normalizeMilestones,validMilestones} from '../../src/domain/project-milestones.js';
import {prepareRewardDelivery,acknowledgeRewardDelivery as acknowledgeDelivery,validRewardDelivery,canAccessRewardDelivery} from '../../src/domain/reward-deliveries.js';
export { actors, categories } from './catalog.js';

/**
 * Regras de domínio executadas pela API do protótipo acadêmico.
 * O chamador deve selecionar o ator da sessão no servidor e executar cada
 * mutação dentro de uma transação do repositório PostgreSQL. Este módulo puro
 * não fornece autenticação, conexão bancária ou persistência concorrente sozinho.
 * Os atores e os pagamentos são fictícios; nunca há dados de cartão ou gateway.
 */
export const STORAGE_KEY = 'elo-demo-v1';
export const MAX_AMOUNT_CENTS = 100_000_000;
const clone = value => JSON.parse(JSON.stringify(value));
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const money = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_AMOUNT_CENTS;
const validKey = key => typeof key === 'string' && /^[\w:-]{1,160}$/.test(key);
const sum = (items, selector) => items.reduce((total, item) => total + selector(item), 0);
const plainText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) && !/<\/?[a-z][^>]*>/i.test(value);
const safeLink = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 500 || /[\u0000-\u0020\u007f]/.test(value.trim())) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.href.length<=500 ? url.href : null; }
  catch { return null; }
};

const stateActors = state => [...actors,...(Array.isArray(state.registeredActors)?state.registeredActors:[])].filter((a,i,items)=>items.findIndex(b=>b.id===a.id)===i);
const knownAccounts = state => {
  const accounts = new Map(stateActors(state).map(a => [a.id,{id:a.id,name:a.name,role:a.role,avatarUrl:a.avatarUrl||null,joinedAt:a.joinedAt||null}]));
  for (const c of state.campaigns || []) if (c && !accounts.has(c.creatorId)) accounts.set(c.creatorId,{id:c.creatorId,name:c.creator,role:'creator'});
  return [...accounts.values()];
};
const resourceAccounts = (state,resourceId) => {
  const support = state.contributions?.find(item => item.id === resourceId);
  if (support) return [support.supporterId,support.creatorId];
  const project = state.campaigns?.find(item => item.id === resourceId);
  if (project) return [project.creatorId];
  const payout = state.payouts?.find(item => item.id === resourceId);
  if (payout) return [payout.creatorId];
  const profile = state.creatorProfiles?.find(item => item.id === resourceId);
  if (profile) return [profile.creatorId];
  const update = state.projectUpdates?.find(item => item.id === resourceId);
  if (update) return [update.creatorId];
  const comment = state.projectComments?.find(item => item.id === resourceId);
  if (comment) return [comment.authorId,state.campaigns.find(item => item.id === comment.campaignId)?.creatorId];
  const message = state.directMessages?.find(item => item.id === resourceId);
  if (message) return [message.creatorId,message.senderId];
  return knownAccounts(state).some(a => a.id === resourceId) ? [resourceId] : [];
};
const auditAccounts = (state,event) => [...new Set([event.actorId,...(event.relatedAccountIds || []),...resourceAccounts(state,event.resourceId)].filter(Boolean))];

// Only the fictitious catalog accounts have an initial public location.
const initialLocation = creatorId => {
  const label = campaignCatalog.find(c => c.creatorId === creatorId)?.location;
  if (!label) return null;
  const [city,region] = label.split(', ');
  return {city,region,countryCode:'BR'};
};
const profileFor = creatorId => ({ id: `profile-${creatorId}`, creatorId, bio: '', links: [], location:initialLocation(creatorId), joinedAt: '2026-10-01T12:00:00.000Z' });
function setCampaignLocation(campaign, location) {
  const label = formatProfileLocation(location);
  if (label) campaign.location = label;
  else delete campaign.location;
}
const legacySeedStories = {
  c1: 'Um terreno vazio pode se tornar um ponto de encontro. O Verde no concreto é uma iniciativa fictícia que aproxima vizinhos para criar hortas comunitárias e oficinas de cultivo.\n\nO apoio financia ferramentas, mudas e encontros de formação. Nossa primeira etapa prevê três espaços de cultivo, com cuidado compartilhado e acesso gratuito à comunidade.\n\nCada apoio ajuda a construir uma cidade com mais verde, alimento e convivência. Nesta demonstração, todas as contribuições e todos os resultados são simulados.',
  c2: 'Som que fica reúne canções autorais inspiradas nas pessoas e nos pequenos encontros da cidade. O projeto fictício vai da gravação à publicação de um álbum independente.\n\nO financiamento será destinado à produção musical, mixagem e distribuição digital. Apoiadores acompanham os bastidores e recebem novidades sobre o processo criativo.\n\nEste é um projeto demonstrativo. Não há cobrança, entrega de recompensas ou artista contratado.',
  c3: 'A biblioteca itinerante Aprender sem fronteiras é um cenário fictício para demonstrar financiamento coletivo com impacto educacional.\n\nA meta é montar um acervo compartilhado e organizar oficinas de leitura em espaços comunitários. O orçamento contempla livros, materiais e transporte.\n\nOs dados, as crianças e os locais apresentados são representações demonstrativas. Nenhuma informação pessoal real é solicitada.',
  c4: 'O Ateliê de possibilidades é uma campanha fictícia para um espaço de criação compartilhado. Queremos unir oficinas de cerâmica, materiais acessíveis e encontros entre pessoas que gostam de fazer.\n\nO valor arrecadado permitirá simular a compra de equipamentos e a organização das primeiras oficinas. O apoio recorrente representa a continuidade das atividades.\n\nEste protótipo não realiza oficinas ou entregas reais; ele permite experimentar a jornada de apoio.',
  c5: 'Tecnologia que aproxima é uma proposta fictícia de kits educativos de robótica com documentação aberta. A ideia é oferecer uma primeira experiência de montagem, programação e experimentação.\n\nA campanha representa desenvolvimento de protótipos, materiais didáticos e oficinas. Seu objetivo no Elo é demonstrar uma campanha de tecnologia com contribuição pontual.\n\nTodos os valores são simulados e nenhum produto real será comercializado.',
  c6: 'O futuro pedala é um cenário demonstrativo de uma oficina comunitária para recuperação de bicicletas. A proposta une mobilidade, aprendizado e reaproveitamento de materiais.\n\nOs apoios representam compra de ferramentas, peças e realização de encontros de manutenção. Um plano mensal mantém as atividades ao longo do tempo.\n\nNenhuma bicicleta, pessoa ou contribuição apresentada corresponde a uma operação real.',
};

/** Add new presentation data to old workspaces without inventing reward receipts
 * or changing historical balances. Existing invalid fields are not repaired. */
function upgradeState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const state = clone(input);
  if (state.creatorProfiles === undefined) state.creatorProfiles = [];
  if (state.projectUpdates === undefined) state.projectUpdates = [];
  if (state.projectComments === undefined) state.projectComments = [];
  if (state.accountModerations === undefined) state.accountModerations = [];
  if (state.directMessages === undefined) state.directMessages = [];
  if (state.rewardDeliveries === undefined) state.rewardDeliveries = [];
  if (Array.isArray(state.accountModerations)) for (const moderation of state.accountModerations) {
    if (!moderation || typeof moderation !== 'object') continue;
    if (moderation.type === undefined && typeof moderation.banned === 'boolean') moderation.type = moderation.banned ? 'ban' : 'none';
    if (moderation.expiresAt === undefined) moderation.expiresAt = null;
  }
  if (Array.isArray(state.campaigns)) {
    for (const campaign of state.campaigns) {
      if (!campaign || typeof campaign !== 'object') continue;
      if (campaign.story === legacySeedStories[campaign.id]) campaign.story = campaignCatalog.find(item => item.id === campaign.id)?.story ?? campaign.story;
      if (campaign.rewardRaisedCents === undefined) campaign.rewardRaisedCents = 0;
      if (campaign.milestones === undefined) campaign.milestones = [];
      if (Array.isArray(state.creatorProfiles) && typeof campaign.creatorId === 'string'
          && !state.creatorProfiles.some(profile => profile?.creatorId === campaign.creatorId)) state.creatorProfiles.push(profileFor(campaign.creatorId));
    }
  }
  if (Array.isArray(state.contributions)) for (const support of state.contributions) {
    if (!support || typeof support !== 'object') continue;
    if (support.rewardId === undefined) support.rewardId = null;
    if (support.rewardTitle === undefined) support.rewardTitle = null;
    if (support.isRenewal === undefined) support.isRenewal = false;
    if (support.parentContributionId === undefined) support.parentContributionId = null;
    if (support.billingCycle === undefined) support.billingCycle = 1;
    if (support.refundStatus === undefined) support.refundStatus = 'none';
  }
  if (Array.isArray(state.creatorProfiles) && Array.isArray(state.campaigns)) {
    const locations = new Map();
    for (const profile of state.creatorProfiles) {
      if (!profile || typeof profile !== 'object') continue;
      if (profile.location === undefined) profile.location = initialLocation(profile.creatorId);
      locations.set(profile.creatorId, profile.location);
    }
    for (const project of state.campaigns) if (project && typeof project === 'object' && !project.purgedAt) setCampaignLocation(project,locations.get(project.creatorId));
  }
  if (Array.isArray(state.auditLog)) for (const event of state.auditLog) if (event && event.relatedAccountIds === undefined) event.relatedAccountIds = auditAccounts(state,event);
  return state;
}

export function createSeedState() {
  const state = {
    schemaVersion: 1, actorId: 'supporter1', sequence: 20,
    campaigns: clone(campaignCatalog), savedCampaignIds: ['c3'], idempotency: {},
    contributions: [
      { id: 'support-1', campaignId: 'c1', campaignTitle: 'Verde no concreto', campaignImage: 'assets/campaign-1.svg', supporterId: 'supporter1', supporterName: 'Ana Souza', creatorId: 'creator1', amountCents: 7500, mode: 'once', status: 'confirmed', subscriptionStatus: null, createdAt: '2026-11-15T14:30:00.000Z', confirmedAt: '2026-11-15T14:30:10.000Z', transactionId: 'SIM-001' },
      { id: 'support-2', campaignId: 'c4', campaignTitle: 'Ateliê de possibilidades', campaignImage: 'assets/campaign-4.svg', supporterId: 'supporter1', supporterName: 'Ana Souza', creatorId: 'creator1', amountCents: 3500, mode: 'monthly', status: 'confirmed', subscriptionStatus: 'active', createdAt: '2026-11-17T11:00:00.000Z', confirmedAt: '2026-11-17T11:00:10.000Z', transactionId: 'SIM-002' },
      { id: 'support-3', campaignId: 'c2', campaignTitle: 'Som que fica', campaignImage: 'assets/campaign-2.svg', supporterId: 'supporter1', supporterName: 'Ana Souza', creatorId: 'creator2', amountCents: 5000, mode: 'once', status: 'pending', subscriptionStatus: null, createdAt: '2026-11-19T16:20:00.000Z', confirmedAt: null, transactionId: 'SIM-003' },
    ],
    ledger: [
      { id: 'ledger-1', ownerId: 'creator1', type: 'opening_balance', direction: 'in', amountCents: 248000, description: 'Saldo inicial fictício', status: 'confirmed', createdAt: '2026-11-14T09:00:00.000Z' },
      { id: 'ledger-2', ownerId: 'supporter1', type: 'contribution', direction: 'out', amountCents: 7500, contributionId: 'support-1', campaignId: 'c1', description: 'Apoio a Verde no concreto', status: 'confirmed', createdAt: '2026-11-15T14:30:10.000Z' },
      { id: 'ledger-3', ownerId: 'supporter1', type: 'contribution', direction: 'out', amountCents: 3500, contributionId: 'support-2', campaignId: 'c4', description: 'Apoio mensal a Ateliê de possibilidades', status: 'confirmed', createdAt: '2026-11-17T11:00:10.000Z' },
    ],
    payouts: [],
    auditLog: [{ id: 'event-1', actorId: 'system', action: 'demo.initialized', resourceId: 'sandbox', description: 'Ambiente fictício iniciado. Nenhum dado real.', createdAt: '2026-11-20T09:00:00.000Z' }],
  };
  state.contributions.forEach(support => { support.isRenewal = false; support.parentContributionId = null; support.billingCycle = 1; });
  return upgradeState(state);
}

function isValidState(value) {
  if (!value || value.schemaVersion !== 1 || !stateActors(value).some(actor => actor.id === value.actorId)) return false;
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) return false;
  for (const key of ['campaigns', 'contributions', 'ledger', 'payouts', 'auditLog', 'savedCampaignIds', 'creatorProfiles', 'projectUpdates', 'projectComments', 'accountModerations', 'directMessages','rewardDeliveries']) {
    if (!Array.isArray(value[key])) return false;
    // Older writers could persist a final entry past the admission limit.
    if (key!=='ledger' && key!=='auditLog' && value[key].length>10000) return false;
  }
  if (!value.idempotency || typeof value.idempotency !== 'object' || Array.isArray(value.idempotency)) return false;
  const text = (item, max = 1000) => typeof item === 'string' && item.length > 0 && item.length <= max;
  const date = item => typeof item === 'string' && Number.isFinite(Date.parse(item));
  const integer = item => Number.isSafeInteger(item) && item >= 0;
  const accounts = knownAccounts(value);
  if(value.registeredActors!==undefined&&(!Array.isArray(value.registeredActors)||value.registeredActors.length>10000||!value.registeredActors.every(a=>a&&text(a.id,160)&&plainText(a.name,1,100)&&['creator','supporter','admin'].includes(a.role))))return false;
  if(value.savedByAccount!==undefined&&(!value.savedByAccount||typeof value.savedByAccount!=='object'||Array.isArray(value.savedByAccount)||Object.keys(value.savedByAccount).length>10000||!Object.entries(value.savedByAccount).every(([id,items])=>accounts.some(a=>a.id===id)&&Array.isArray(items)&&items.length<=10000&&items.every(item=>value.campaigns.some(c=>c.id===item)))))return false;
  const account = id => accounts.find(item => item.id === id);
  const moderationFields = (item,at,by,reason,ownerId=null) => item[at] == null ? item[by] == null && item[reason] == null : date(item[at]) && (account(item[by])?.role === 'admin' || (ownerId && item[by]===ownerId && account(ownerId)?.role==='creator')) && plainText(item[reason],5,500);
  if (!value.campaigns.every(c => c && text(c.id, 160) && text(c.title, 90) && text(c.creator, 100) && text(c.creatorId, 160)
      && categories.includes(c.category) && text(c.description, 600) && text(c.story, 10000) && text(c.image, 200)
      && money(c.goalCents) && integer(c.raisedCents) && integer(c.rewardRaisedCents) && c.rewardRaisedCents <= c.raisedCents && integer(c.backers) && Number.isInteger(c.daysLeft) && c.daysLeft >= 1 && c.daysLeft <= 90
      && typeof c.monthly === 'boolean' && typeof c.featured === 'boolean' && moderationFields(c,'deletedAt','deletedBy','deletionReason',c.creatorId)
      && validMilestones(c.milestones,c.goalCents)
      && (c.purgeAfter===undefined || (date(c.purgeAfter)&&date(c.deletedAt)&&Date.parse(c.purgeAfter)===Date.parse(c.deletedAt)+30*86400000))
      && (c.purgedAt===undefined || (date(c.purgedAt)&&date(c.purgeAfter)&&Date.parse(c.purgedAt)>=Date.parse(c.purgeAfter)))
      && (c.location === undefined || text(c.location, 200)) && Array.isArray(c.rewards) && c.rewards.length <= 20
      && c.rewards.every(r => r && text(r.id, 160) && text(r.title, 100) && text(r.description, 600) && money(r.amountCents) && typeof r.monthly === 'boolean'))) return false;
  if (!value.contributions.every(c => c && text(c.id, 160) && money(c.amountCents) && ['pending', 'confirmed', 'failed','canceled'].includes(c.status)
      && ['once', 'monthly'].includes(c.mode) && text(c.supporterId, 160) && text(c.supporterName, 100) && text(c.creatorId, 160)
      && text(c.campaignTitle, 90) && text(c.campaignImage, 200) && text(c.transactionId, 160) && date(c.createdAt)
      && (c.confirmedAt === null || date(c.confirmedAt)) && (c.canceledAt === undefined || date(c.canceledAt))
      && [null, 'active', 'canceled'].includes(c.subscriptionStatus)
      && (c.isRenewal === undefined || typeof c.isRenewal === 'boolean')
      && (c.billingCycle === undefined || (Number.isInteger(c.billingCycle) && c.billingCycle >= 1))
      && (c.parentContributionId === undefined || c.parentContributionId === null || text(c.parentContributionId, 160))
      && (c.cancellationReason === undefined || ['subscription_canceled','project_deleted'].includes(c.cancellationReason))
      && ((c.rewardId === null && c.rewardTitle === null) || (text(c.rewardId,160) && text(c.rewardTitle,100)
        && value.campaigns.some(p => p.id === c.campaignId && (p.purgedAt || p.rewards.some(r => r.id === c.rewardId && r.amountCents <= c.amountCents && r.monthly === (c.mode === 'monthly'))))))
      && value.campaigns.some(p => p.id === c.campaignId && p.creatorId === c.creatorId))) return false;
  if (!value.contributions.every(c => !c.isRenewal || (c.mode === 'monthly' && c.subscriptionStatus === null && c.billingCycle > 1
      && value.contributions.some(parent => parent.id === c.parentContributionId && !parent.isRenewal && parent.mode === 'monthly'
        && parent.campaignId === c.campaignId && parent.supporterId === c.supporterId && parent.amountCents === c.amountCents
        && parent.rewardId === c.rewardId && parent.rewardTitle === c.rewardTitle)))) return false;
  if (new Set(value.contributions.filter(c => c.isRenewal).map(c => `${c.parentContributionId}:${c.billingCycle}`)).size !== value.contributions.filter(c => c.isRenewal).length) return false;
  if (!value.ledger.every(l => l && text(l.id, 160) && text(l.type, 100) && money(l.amountCents) && ['in', 'out'].includes(l.direction)
      && text(l.ownerId, 160) && text(l.description, 300) && date(l.createdAt))) return false;
  if (!value.payouts.every(p => p && text(p.id, 160) && money(p.amountCents) && text(p.creatorId, 160) && date(p.createdAt) && p.status === 'completed')) return false;
  if (!value.auditLog.every(a => a && text(a.id, 160) && text(a.actorId, 160) && text(a.action, 100) && text(a.resourceId, 160) && text(a.description, 500) && date(a.createdAt) && Array.isArray(a.relatedAccountIds) && a.relatedAccountIds.length <= 20 && a.relatedAccountIds.every(id => text(id,160)) && (a.reason === undefined || plainText(a.reason,5,500)))) return false;
  const cleanupEvents=value.auditLog.filter(e=>e.action==='campaign.content_purged');
  if(new Set(cleanupEvents.map(e=>e.resourceId)).size!==cleanupEvents.length
      || !cleanupEvents.every(e=>e.actorId==='system'&&value.campaigns.some(c=>c.id===e.resourceId&&c.purgedAt===e.createdAt))
      || !value.campaigns.every(c=>!c.purgedAt||cleanupEvents.some(e=>e.resourceId===c.id)))return false;
  if (!value.creatorProfiles.every(p => p && text(p.id,160) && text(p.creatorId,160) && plainText(p.bio,0,2000)
      && date(p.joinedAt) && (p.location===null || validProfileLocation(p.location)) && Array.isArray(p.links) && p.links.length <= 5
      && p.links.every(link => link && plainText(link.label,1,60) && safeLink(link.url)))) return false;
  if (new Set(value.creatorProfiles.map(p => p.creatorId)).size !== value.creatorProfiles.length) return false;
  if(!value.rewardDeliveries.every(d=>validRewardDelivery(d)&&value.contributions.some(c=>c.id===d.contributionId&&c.campaignId===d.campaignId&&c.creatorId===d.creatorId&&c.supporterId===d.supporterId&&c.status==='confirmed'&&c.rewardId)))return false;
  if(new Set(value.rewardDeliveries.map(d=>d.contributionId)).size!==value.rewardDeliveries.length || new Set(value.rewardDeliveries.map(d=>d.id)).size!==value.rewardDeliveries.length)return false;
  if (!value.projectUpdates.every(u => u && text(u.id,160) && plainText(u.title,3,100) && plainText(u.body,1,5000) && date(u.createdAt)
      && value.campaigns.some(p => p.id === u.campaignId && p.creatorId === u.creatorId))) return false;
  if (!value.projectComments.every(c => c && text(c.id,160) && plainText(c.body,1,2000) && date(c.createdAt)
      && knownAccounts(value).some(a => a.id === c.authorId && a.name === c.authorName) && value.campaigns.some(p => p.id === c.campaignId) && moderationFields(c,'removedAt','removedBy','removalReason'))) return false;
  if (!value.accountModerations.every(m => m && text(m.id,160) && account(m.accountId) && account(m.accountId).role !== 'admin' && ['ban','suspension','none'].includes(m.type) && m.banned === (m.type === 'ban') && (m.expiresAt === null || (date(m.expiresAt) && Date.parse(m.expiresAt) > Date.parse(m.updatedAt))) && (m.type !== 'none' || m.expiresAt === null) && plainText(m.reason,5,500) && date(m.updatedAt) && account(m.updatedBy)?.role === 'admin')) return false;
  if (new Set(value.accountModerations.map(m => m.accountId)).size !== value.accountModerations.length) return false;
  if (!value.directMessages.every(m => m && text(m.id,160) && account(m.creatorId)?.role === 'creator' && text(m.senderId,160) && (account(m.senderId)?.role === 'admin' || m.senderId === m.creatorId) && plainText(m.body,1,2000) && date(m.createdAt))) return false;
  if (!value.savedCampaignIds.every(id => text(id, 160) && value.campaigns.some(c => c.id === id))) return false;
  if (Object.keys(value.idempotency).length > 10000 || !Object.values(value.idempotency).every(i => i && text(i.fingerprint, 2000) && text(i.resourceId, 160))) return false;
  for (const key of ['campaigns', 'contributions', 'ledger', 'payouts', 'auditLog', 'creatorProfiles', 'projectUpdates', 'projectComments', 'accountModerations', 'directMessages']) if (new Set(value[key].map(item => item.id)).size !== value[key].length) return false;
  return validFinancialLinks(value, account, date);
}

// The two seed receipts were funded by the opening balance. Their original
// supporter debits exist, but creating matching historical credits would inflate it.
const openingReceipts = new Map([['support-1',['SIM-001','c1',7500]],['support-2',['SIM-002','c4',3500]]]);
const settlementCounts=['refundedCents','refundCount','canceledPendingCount','canceledSubscriptionsCount'];
function validSettlements(state) {
  const batches=new Map(),projects=new Map(state.campaigns.map(c=>[c.id,c]));
  for (const event of state.auditLog) {
    if (event.action!=='campaign.deleted' || event.deletionSummary===undefined) continue;
    const summary=event.deletionSummary;
    if (!summary || !validKey(summary.batchId) || batches.has(summary.batchId) || !projects.has(event.resourceId)) return false;
    batches.set(summary.batchId,{event,refundedCents:0,refundCount:0,canceledPendingCount:0,canceledSubscriptionsCount:0});
  }
  for (const c of state.contributions) {
    if (c.refundStatus==='completed') {
      const batch=batches.get(c.refundBatchId);
      if (!batch || batch.event.resourceId!==c.campaignId || batch.event.actorId!==c.refundedBy || batch.event.reason!==c.refundReason) return false;
      batch.refundedCents+=c.amountCents;batch.refundCount++;
    }
    if (c.cancellationReason==='project_deleted') {
      const batch=batches.get(c.cancellationBatchId);
      if (!batch || batch.event.resourceId!==c.campaignId) return false;
      if (c.status==='canceled') batch.canceledPendingCount++;
      else batch.canceledSubscriptionsCount++;
    }
    if (projects.get(c.campaignId).deletionSummary && (c.status==='pending' || (c.status==='confirmed' && c.refundStatus!=='completed'))) return false;
  }
  for (const batch of batches.values()) if (settlementCounts.some(k=>batch.event.deletionSummary[k]!==batch[k])) return false;
  const matchesBatch=(summary,projectId)=>{
    const batch=batches.get(summary?.batchId);
    return batch?.event.resourceId===projectId && settlementCounts.every(k=>summary[k]===batch[k]);
  };
  for (const c of projects.values()) if (c.deletionSummary!==undefined && (!c.deletedAt || !matchesBatch(c.deletionSummary,c.id))) return false;
  return Object.values(state.idempotency).every(key=>key.deletionSummary===undefined || matchesBatch(key.deletionSummary,key.resourceId));
}
function validFinancialLinks(state, account, date) {
  const supports = new Map(state.contributions.map(c=>[c.id,c]));
  const payouts = new Map(state.payouts.map(p=>[p.id,p]));
  const recorded = new Set(), refundIds = new Set();
  const slot = (id,type,direction) => JSON.stringify([id,type,direction]);
  for (const entry of state.ledger) {
    if (entry.type==='opening_balance') {
      if (entry.direction!=='in' || entry.contributionId || entry.payoutId || entry.campaignId) return false;
      continue;
    }
    if (entry.type==='payout') {
      const p=payouts.get(entry.payoutId);
      if (!p || p.creatorId!==entry.ownerId || p.amountCents!==entry.amountCents || entry.direction!=='out' || entry.contributionId || entry.campaignId) return false;
    } else {
      const c=supports.get(entry.contributionId), refund=entry.type==='refund';
      if ((!refund && entry.type!=='contribution') || !c || c.status!=='confirmed' || entry.campaignId!==c.campaignId || entry.amountCents!==c.amountCents || entry.payoutId) return false;
      const creatorSide = refund ? entry.direction==='out' : entry.direction==='in';
      if (entry.ownerId!==(creatorSide ? c.creatorId : c.supporterId)) return false;
      if (refund && (c.refundStatus!=='completed' || entry.refundId!==c.refundId || entry.refundBatchId!==c.refundBatchId || entry.createdAt!==c.refundedAt)) return false;
    }
    const key=slot(entry.contributionId ?? entry.payoutId,entry.type,entry.direction);
    if (recorded.has(key)) return false;
    recorded.add(key);
  }
  for (const c of supports.values()) {
    if (c.creatorId===c.supporterId || (c.status==='confirmed')!==(c.confirmedAt!==null)) return false;
    if (c.subscriptionStatus!==null && (c.status!=='confirmed' || c.mode!=='monthly' || c.isRenewal)) return false;
    if (c.status==='canceled' && (c.cancellationReason!=='project_deleted' || !date(c.canceledAt))) return false;
    if (c.cancellationReason==='project_deleted' && (c.status!=='canceled' && c.subscriptionStatus!=='canceled' || !date(c.canceledAt))) return false;
    if (c.cancellationReason==='subscription_canceled' && (c.status!=='failed' || !date(c.canceledAt))) return false;
    if (c.status==='confirmed') {
      const seed=openingReceipts.get(c.id);
      const opening=seed && seed[0]===c.transactionId && seed[1]===c.campaignId && seed[2]===c.amountCents && c.supporterId==='supporter1';
      if (!recorded.has(slot(c.id,'contribution','out')) || (!opening && !recorded.has(slot(c.id,'contribution','in')))) return false;
    }
    if (c.refundStatus==='none') {
      if (['refundId','refundBatchId','refundedAt','refundedBy','refundReason'].some(k=>c[k]!=null)) return false;
    } else {
      if (c.refundStatus!=='completed' || c.status!=='confirmed' || c.subscriptionStatus==='active'
          || !validKey(c.refundId) || !validKey(c.refundBatchId) || refundIds.has(c.refundId) || !date(c.refundedAt)
          || !(c.refundedBy===c.creatorId || account(c.refundedBy)?.role==='admin') || !plainText(c.refundReason,5,500)
          || !recorded.has(slot(c.id,'refund','in')) || !recorded.has(slot(c.id,'refund','out'))) return false;
      refundIds.add(c.refundId);
    }
  }
  return [...payouts.keys()].every(id=>recorded.has(slot(id,'payout','out'))) && validSettlements(state);
}

export function assertValidState(state, existingHistory = {}) {
  if (!isValidState(state)) fail('INVALID_STATE','O cenário persistido é inválido. Nenhum dado foi alterado.');
  // Maintenance may append exactly one validated event per purged project even
  // when user operations reached their quota. Existing audit is never trimmed.
  const cleanups=state.auditLog.filter(e=>e.action==='campaign.content_purged').length;
  const newCleanups=Math.max(0,cleanups-(existingHistory.cleanupEvents||0));
  for (const name of ['ledger','auditLog']) if (state[name].length>Math.max(10000,existingHistory[name] ?? 0)+(name==='auditLog'?newCleanups:0))
    fail('DEMO_LIMIT','O cenário atingiu o limite de registros da demonstração.');
}

export function createPlatform({ storage = null, initialState, clock = Date.now } = {}) {
  const currentTime = () => { const value = new Date(clock()).getTime(); if (!Number.isFinite(value)) throw new TypeError('Relógio inválido.'); return value; };
  const now = () => new Date(currentTime()).toISOString();
  let state = createSeedState();
  let persistenceAvailable = Boolean(storage);
  if (storage) {
    try { const saved = upgradeState(JSON.parse(storage.getItem(STORAGE_KEY))); if (isValidState(saved)) state = saved; }
    catch { persistenceAvailable = false; }
  }
  if (initialState !== undefined) {
    const upgraded = upgradeState(initialState);
    if (!isValidState(upgraded)) fail('INVALID_STATE', 'O cenário persistido é inválido. Nenhum dado foi alterado.');
    state = upgraded;
    persistenceAvailable = true;
  }
  // Compatibilidade com o primeiro cenário demonstrativo, anterior à cobrança por ciclo.
  state.contributions.forEach(support => { support.isRenewal ??= false; support.parentContributionId ??= null; support.billingCycle ??= 1; });
  const save = () => { if (storage) { try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); persistenceAvailable = true; } catch { persistenceAvailable = false; } } };
  const nextId = prefix => `${prefix}-${++state.sequence}`;
  const ensureCapacity = ({auditLog=1,...growth}={}) => {
    for (const [name,count] of Object.entries({...growth,auditLog})) {
      const size = name==='idempotency' ? Object.keys(state.idempotency).length : state[name].length;
      if (count && size+count>10000) fail('DEMO_LIMIT','O cenário atingiu o limite de registros da demonstração.');
    }
  };
  const activeModeration = id => state.accountModerations.find(item => item.accountId === id && item.type !== 'none' && (item.expiresAt === null || Date.parse(item.expiresAt) > currentTime()));
  const isBanned = id => activeModeration(id)?.type === 'ban';
  const isRestricted = id => Boolean(activeModeration(id));
  const accountStatus = (id, includeReason = false) => {
    const moderation = activeModeration(id), type = moderation?.type ?? 'none';
    return {banned:type==='ban',suspended:type==='suspension',restricted:type!=='none',moderationType:type,moderationExpiresAt:moderation?.expiresAt ?? null,...(includeReason?{moderationReason:moderation?.reason ?? null,banReason:moderation?.reason ?? null}:{})};
  };
  const actor = () => ({...stateActors(state).find(item => item.id === state.actorId),...accountStatus(state.actorId,true)});
  const requireAccountAccess = () => { if (isBanned(state.actorId)) fail('ACCOUNT_BANNED','O acesso a esta conta está bloqueado por banimento.'); };
  const requireActiveActor = () => { requireAccountAccess();if (actor().suspended) fail('ACCOUNT_SUSPENDED','Esta conta está suspensa e pode apenas visualizar o conteúdo.'); };
  const requireAdmin = () => { requireActiveActor();if (actor().role !== 'admin') fail('FORBIDDEN','Esta ação é exclusiva da administração.'); };
  const account = id => { const item=knownAccounts(state).find(a=>a.id===id);if(!item)fail('NOT_FOUND','Conta não encontrada.');return item; };
  const availableProject = project => { if(project.deletedAt || isRestricted(project.creatorId)) fail('PROJECT_UNAVAILABLE','Este projeto não está disponível para novas operações.'); };
  const visibleCampaigns = viewer => state.campaigns.filter(c => !c.purgedAt && (viewer.role === 'admin' || c.creatorId === viewer.id || (!c.deletedAt && !isBanned(c.creatorId))));
  const moderationReason = value => { if(!plainText(value,5,500)) fail('INVALID_MODERATION','Informe um motivo entre 5 e 500 caracteres, sem HTML.');return value.trim(); };
  const record = (action, resourceId, description, relatedAccountIds = [], extra = {}) => { const event={id:nextId('event'),actorId:state.actorId,action,resourceId,description,createdAt:now(),relatedAccountIds,...extra};event.relatedAccountIds=auditAccounts(state,event);state.auditLog.unshift(event); };
  const campaign = id => { const result = state.campaigns.find(item => item.id === id); if (!result) fail('NOT_FOUND', 'Campanha não encontrada.'); return result; };
  const contribution = id => { const result = state.contributions.find(item => item.id === id); if (!result) fail('NOT_FOUND', 'Apoio não encontrado.'); return result; };
  const balance = ownerId => sum(state.ledger.filter(item => item.ownerId === ownerId
    && !(item.type==='contribution' && item.direction==='out') && !(item.type==='refund' && item.direction==='in')), item => item.direction === 'in' ? item.amountCents : -item.amountCents);
  const requireSupporter = () => { requireActiveActor(); if (!['supporter','creator'].includes(actor().role)) fail('FORBIDDEN', 'Use uma conta de criador ou apoiador para registrar um apoio.'); };
  const requireCreator = () => { requireActiveActor(); if (actor().role !== 'creator') fail('FORBIDDEN', 'Somente a personagem criadora pode solicitar repasses.'); };
  const requireOwner = support => { if (support.supporterId !== state.actorId && actor().role !== 'admin') fail('FORBIDDEN', 'Você não tem permissão para alterar este apoio.'); };
  const useKey = (scope, key, payload) => {
    if (!validKey(key)) fail('INVALID_KEY', 'Informe uma identificação válida para esta operação simulada.');
    const fullKey = `${state.actorId}:${scope}:${key}`;
    const fingerprint = JSON.stringify(payload);
    const previous = state.idempotency[fullKey];
    if (previous && previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Esta identificação já foi utilizada com outros dados.');
    return { fullKey, fingerprint, previous };
  };
  const visibleContributions = viewer => state.contributions.filter(item => viewer.role === 'admin'
    || item.creatorId===viewer.id || item.supporterId===viewer.id);
  const visibleLedger = viewer => state.ledger.filter(item => viewer.role === 'admin' || item.ownerId === viewer.id);
  const savedFor = id => state.savedByAccount?.[id] || (id==='supporter1'?state.savedCampaignIds:[]);
  const requireProjectManager = project => {
    requireActiveActor();
    if (actor().role!=='admin' && !(actor().role==='creator' && state.actorId===project.creatorId)) fail('FORBIDDEN','Somente o responsável pelo projeto ou a administração pode excluí-lo.');
  };
  const deletionPlan = project => {
    const supports=state.contributions.filter(c=>c.campaignId===project.id);
    const confirmed=supports.filter(c=>c.status==='confirmed' && c.refundStatus==='none');
    const pending=supports.filter(c=>c.status==='pending');
    const subscriptions=supports.filter(c=>c.subscriptionStatus==='active');
    const requiredCents=sum(confirmed,c=>c.amountCents),availableCents=balance(project.creatorId);
    const shortfallCents=Math.max(0,requiredCents-availableCents);
    return {confirmed,pending,subscriptions,preview:{campaignId:project.id,requiredCents,availableCents,shortfallCents,
      confirmedCount:confirmed.length,pendingCount:pending.length,subscriptionCount:subscriptions.length,canDelete:shortfallCents===0}};
  };
  const summaryFor = viewer => {
    const supports = visibleContributions(viewer);
    const projects = viewer.role==='admin'?state.campaigns:viewer.role==='creator'?state.campaigns.filter(item=>item.creatorId===viewer.id):visibleCampaigns(viewer);
    const received=supports.filter(item=>(item.creatorId===viewer.id || viewer.role==='admin')&&item.status==='confirmed');
    const sent=viewer.role==='admin'?supports:supports.filter(item=>item.supporterId===viewer.id);
    const confirmed = sent.filter(item => item.status === 'confirmed');
    const totalSupportedCents=sum(confirmed,c=>c.amountCents), totalReceivedCents=sum(received,c=>c.amountCents);
    const totalRefundedCents=sum(confirmed.filter(c=>c.refundStatus==='completed'),c=>c.amountCents);
    const totalRefundedByCreatorCents=sum(received.filter(c=>c.refundStatus==='completed'),c=>c.amountCents);
    const subscriptions = sent.filter(item => !item.isRenewal && item.subscriptionStatus === 'active');
    return {
      totalRaisedCents: sum(projects, item => item.raisedCents),
      totalSupportedCents,totalReceivedCents,totalRefundedCents,totalRefundedByCreatorCents,
      netSupportedCents:totalSupportedCents-totalRefundedCents, netReceivedCents:totalReceivedCents-totalRefundedByCreatorCents,
      availableBalanceCents: viewer.role === 'admin' ? sum([...new Set(state.campaigns.map(item => item.creatorId))], ownerId => balance(ownerId)) : viewer.role === 'creator' ? balance(viewer.id) : 0,
      totalPayoutCents: sum(state.payouts.filter(item => viewer.role === 'admin' || item.creatorId === viewer.id), item => item.amountCents),
      activeSubscriptions: subscriptions.length, activeCampaigns: projects.filter(c=>!c.deletedAt&&!isBanned(c.creatorId)).length, contributionCount: viewer.role==='creator'?received.length:confirmed.length,
      savedCount: savedFor(viewer.id).filter(id=>visibleCampaigns(viewer).some(c=>c.id===id)).length, pendingCount: sent.filter(item => item.status === 'pending').length,
      monthlyTotalCents: sum(subscriptions, item => item.amountCents),
    };
  };

  const api = {
    getState: () => ({ ...clone(state), actors: clone(stateActors(state)), persistenceAvailable }),
    getActor: () => clone(actor()),
    switchActor(id) {
      if (!stateActors(state).some(item => item.id === id)) fail('INVALID_ACTOR', 'Personagem de demonstração não encontrada.');
      state.actorId = id; save(); return api.getActor();
    },
    listCampaigns() { requireAccountAccess();return clone(visibleCampaigns(actor())); },
    getCampaign(id) { requireAccountAccess();const project=visibleCampaigns(actor()).find(c=>c.id===id);if(!project)fail('NOT_FOUND','Campanha não encontrada.');return clone(project); },
    toggleSaved(id) {
      requireActiveActor();availableProject(campaign(id));
      state.savedByAccount ??= {};
      const saved=state.savedByAccount[state.actorId] ??= [...savedFor(state.actorId)];
      const index=saved.indexOf(id);if(index>=0)saved.splice(index,1);else saved.push(id);
      if(state.actorId==='supporter1')state.savedCampaignIds=[...saved];
      save();return saved.includes(id);
    },
    createContribution({ campaignId, amountCents, mode = 'once', rewardId = null, idempotencyKey } = {}) {
      requireSupporter();
      if (!money(amountCents) || amountCents < 500) fail('INVALID_AMOUNT', 'Escolha um apoio entre R$ 5,00 e R$ 1.000.000,00.');
      if (!['once', 'monthly'].includes(mode)) fail('INVALID_MODE', 'Escolha apoio único ou mensal.');
      const project = campaign(campaignId);
      if(project.creatorId===state.actorId)fail('SELF_SUPPORT_UNAVAILABLE','Você pode apoiar projetos de outros criadores.');
      const { fullKey, fingerprint, previous } = useKey('contribution', idempotencyKey, { campaignId, amountCents, mode, ...(rewardId!==null ? {rewardId} : {}) });
      if (previous) return clone(contribution(previous.resourceId));
      availableProject(project);
      if (mode === 'monthly' && !project.monthly) fail('MONTHLY_UNAVAILABLE', 'Esta campanha aceita apenas apoios únicos.');
      const reward = rewardId === null ? null : project.rewards.find(item => item.id === rewardId);
      if (rewardId !== null && (!validKey(rewardId) || !reward)) fail('INVALID_REWARD', 'Selecione uma recompensa deste projeto.');
      if (reward && amountCents < reward.amountCents) fail('INVALID_REWARD_AMOUNT', 'O apoio deve cobrir o valor da recompensa selecionada.');
      if (reward && reward.monthly !== (mode === 'monthly')) fail('INVALID_REWARD_MODE', 'A modalidade do apoio deve corresponder à recompensa selecionada.');
      ensureCapacity({contributions:1,idempotency:1});
      const support = { id: nextId('support'), campaignId, campaignTitle: project.title, campaignImage: project.image, supporterId: state.actorId, supporterName: actor().name, creatorId: project.creatorId, amountCents, mode, rewardId:reward?.id ?? null, rewardTitle:reward?.title ?? null, status: 'pending', subscriptionStatus: null, isRenewal: false, parentContributionId: null, billingCycle: 1, createdAt: now(), confirmedAt: null, transactionId: `SIM-${state.sequence}` };
      support.refundStatus='none';
      state.contributions.unshift(support);
      state.idempotency[fullKey] = { fingerprint, resourceId: support.id };
      record('contribution.created', support.id, `Apoio ${mode === 'monthly' ? 'mensal' : 'único'} simulado criado.`);
      save(); return clone(support);
    },
    renewSubscription({ contributionId, idempotencyKey } = {}) {
      const root = contribution(contributionId); requireOwner(root);requireActiveActor();
      if (root.mode !== 'monthly' || root.isRenewal || root.parentContributionId) fail('INVALID_SUBSCRIPTION', 'Selecione o apoio mensal original para simular a próxima cobrança.');
      const { fullKey, fingerprint, previous } = useKey('renewal', idempotencyKey, { contributionId });
      if (previous) return clone(contribution(previous.resourceId));
      availableProject(campaign(root.campaignId));
      if(isRestricted(root.supporterId))fail(isBanned(root.supporterId)?'ACCOUNT_BANNED':'ACCOUNT_SUSPENDED','A conta apoiadora está impedida de realizar novas operações.');
      if (root.status !== 'confirmed' || root.subscriptionStatus !== 'active') fail('INACTIVE_SUBSCRIPTION', 'A assinatura deve estar confirmada e ativa para gerar outra cobrança.');
      const children = state.contributions.filter(item => item.parentContributionId === root.id);
      if (children.some(item => item.status === 'pending')) fail('RENEWAL_PENDING', 'Confirme ou recuse a cobrança pendente antes de simular o próximo ciclo.');
      ensureCapacity({contributions:1,idempotency:1});
      const billingCycle = Math.max(1, ...children.map(item => item.billingCycle)) + 1;
      const support = { ...clone(root), id: nextId('support'), isRenewal: true, parentContributionId: root.id, billingCycle,
        status: 'pending', subscriptionStatus: null, createdAt: now(), confirmedAt: null, transactionId: `SIM-${state.sequence}` };
      delete support.canceledAt; delete support.cancellationReason;
      state.contributions.unshift(support);
      state.idempotency[fullKey] = { fingerprint, resourceId: support.id };
      record('subscription.renewal_created', support.id, `Cobrança fictícia do ciclo ${billingCycle} criada; nenhum valor foi creditado.`);
      save(); return clone(support);
    },
    simulatePayment(id, outcome = 'confirmed') {
      requireActiveActor();const support = contribution(id); requireOwner(support);
      if (!['confirmed', 'failed'].includes(outcome)) fail('INVALID_OUTCOME', 'Resultado de pagamento inválido.');
      if (support.status === outcome) return { ...clone(support), duplicate: true };
      if (support.status !== 'pending') fail('INVALID_TRANSITION', 'Este pagamento já foi finalizado. Crie outro apoio para uma nova simulação.');
      if (support.isRenewal && contribution(support.parentContributionId).subscriptionStatus !== 'active') fail('INACTIVE_SUBSCRIPTION', 'A recorrência foi cancelada. Esta cobrança não pode ser confirmada.');
      const project = campaign(support.campaignId);
      if (outcome==='confirmed') {
        if (isRestricted(support.supporterId)) fail(isBanned(support.supporterId)?'ACCOUNT_BANNED':'ACCOUNT_SUSPENDED','A conta apoiadora está impedida de realizar novas operações.');
        availableProject(project);
        if (support.mode==='monthly' && !project.monthly) fail('MONTHLY_UNAVAILABLE','Reative os apoios mensais antes de confirmar esta cobrança.');
      }
      if (outcome === 'confirmed' && (!Number.isSafeInteger(project.raisedCents + support.amountCents)
          || (support.rewardId && !Number.isSafeInteger(project.rewardRaisedCents + support.amountCents)))) fail('AMOUNT_OVERFLOW', 'O valor excede o limite da demonstração.');
      ensureCapacity({ledger:outcome==='confirmed'?2:0});
      support.status = outcome;
      if (outcome === 'confirmed') {
        support.confirmedAt = now();
        support.subscriptionStatus = support.mode === 'monthly' && !support.isRenewal ? 'active' : null;
        project.raisedCents += support.amountCents;
        if (support.rewardId) project.rewardRaisedCents += support.amountCents;
        project.backers += 1;
        const createdAt = now();
        state.ledger.unshift(
          { id: nextId('ledger'), ownerId: support.supporterId, type: 'contribution', direction: 'out', amountCents: support.amountCents, contributionId: support.id, campaignId: project.id, campaignTitle: project.title, ...(support.rewardId ? {rewardId:support.rewardId,rewardTitle:support.rewardTitle} : {}), description: `Apoio ${support.mode === 'monthly' ? 'mensal a' : 'a'} ${project.title}`, status: 'confirmed', createdAt },
          { id: nextId('ledger'), ownerId: support.creatorId, type: 'contribution', direction: 'in', amountCents: support.amountCents, contributionId: support.id, campaignId: project.id, campaignTitle: project.title, ...(support.rewardId ? {rewardId:support.rewardId,rewardTitle:support.rewardTitle} : {}), description: `Apoio recebido: ${project.title}`, status: 'confirmed', createdAt },
        );
      }
      record(`payment.${outcome}`, support.id, outcome === 'confirmed' ? 'Confirmação fictícia processada uma única vez.' : 'Pagamento fictício recusado; nenhum saldo foi alterado.');
      save(); return { ...clone(support), duplicate: false };
    },
    cancelSubscription(id) {
      // Uma suspensão permite encerrar uma recorrência existente, sem criar débitos.
      requireAccountAccess();const support = contribution(id); requireOwner(support);
      if (support.mode !== 'monthly' || support.isRenewal || support.parentContributionId || support.status !== 'confirmed') fail('INVALID_SUBSCRIPTION', 'Selecione o apoio mensal original para cancelar a assinatura.');
      if (support.subscriptionStatus === 'canceled') return { ...clone(support), duplicate: true };
      const children=state.contributions.filter(item => item.parentContributionId === support.id && item.status === 'pending');
      ensureCapacity({auditLog:1+children.length});
      support.subscriptionStatus = 'canceled'; support.canceledAt = now();
      for (const child of children) {
        child.status = 'failed'; child.canceledAt = support.canceledAt; child.cancellationReason = 'subscription_canceled';
        record('payment.canceled_with_subscription', child.id, 'Cobrança fictícia pendente cancelada junto com a recorrência; nenhum saldo foi alterado.');
      }
      record('subscription.canceled', support.id, 'Renovações simuladas canceladas. O apoio já confirmado foi preservado.');
      save(); return clone(support);
    },
    requestPayout({ amountCents, idempotencyKey } = {}) {
      requireCreator();
      if (!money(amountCents)) fail('INVALID_AMOUNT', 'Informe um valor de repasse válido.');
      const { fullKey, fingerprint, previous } = useKey('payout', idempotencyKey, { amountCents });
      if (previous) return clone(state.payouts.find(item => item.id === previous.resourceId));
      if (amountCents > balance(state.actorId)) fail('INSUFFICIENT_BALANCE', 'O valor solicitado excede o saldo disponível.');
      ensureCapacity({payouts:1,ledger:1,idempotency:1});
      // O repositório deve manter a transação e o bloqueio do workspace durante
      // validação de saldo e persistência, inclusive entre conexões da API.
      const payout = { id: nextId('payout'), creatorId: state.actorId, amountCents, status: 'completed', createdAt: now(), destination: 'Conta fictícia • 0001' };
      state.payouts.unshift(payout);
      state.ledger.unshift({ id: nextId('ledger'), ownerId: state.actorId, type: 'payout', direction: 'out', amountCents, description: 'Repasse simulado para conta fictícia', status: 'confirmed', createdAt: payout.createdAt, payoutId: payout.id });
      state.idempotency[fullKey] = { fingerprint, resourceId: payout.id };
      record('payout.completed', payout.id, 'Repasse fictício realizado. Nenhum valor real foi movimentado.');
      save(); return clone(payout);
    },
    updateCreatorProfile({ creatorId = state.actorId, bio, links = [], location } = {}) {
      requireActiveActor();
      if(!['creator','supporter'].includes(actor().role)||creatorId!==state.actorId)fail('FORBIDDEN','Somente o dono da conta pode editar o perfil.');
      account(creatorId);
      if (!plainText(bio,0,2000)) fail('INVALID_PROFILE', 'Escreva uma bio de até 2.000 caracteres, sem marcação HTML.');
      if (!Array.isArray(links) || links.length > 5) fail('INVALID_LINK', 'Adicione até cinco links ao perfil.');
      const normalized = links.map(link => {
        const url = safeLink(link?.url);
        if (!link || !plainText(link.label,1,60) || !url) fail('INVALID_LINK', 'Informe um nome e um endereço HTTP ou HTTPS válido de até 500 caracteres após normalização, sem credenciais.');
        return {label:link.label.trim(),url};
      });
      if (new Set(normalized.map(link => link.url)).size !== normalized.length) fail('INVALID_LINK', 'Adicione cada endereço apenas uma vez.');
      let profile = state.creatorProfiles.find(item => item.creatorId === creatorId);
      let nextLocation=profile?.location ?? null;
      if (location!==undefined && location!==null) {
        nextLocation={city:typeof location.city==='string'?location.city.trim().normalize('NFC'):null,region:location.region,countryCode:location.countryCode};
        if (!validProfileLocation(nextLocation)) fail('INVALID_LOCATION','Informe uma cidade e uma UF válidas do Brasil.');
      } else if(location===null) nextLocation=null;
      ensureCapacity({creatorProfiles:profile?0:1});
      if (!profile) { profile = {...profileFor(creatorId),joinedAt:now()}; state.creatorProfiles.push(profile); }
      profile.bio = bio.trim(); profile.links = normalized; profile.location = nextLocation;
      for (const project of state.campaigns) if (project.creatorId===creatorId) setCampaignLocation(project,nextLocation);
      record('creator.profile_updated',profile.id,'Apresentação pública do perfil atualizada.',[creatorId]);
      save(); return clone(profile);
    },
    profilePhotoChanged(removed=false){
      requireActiveActor();if(!['creator','supporter'].includes(actor().role))fail('FORBIDDEN','Somente o dono de um perfil de criador ou apoiador pode alterar a foto.');
      ensureCapacity();
      record(removed?'profile.photo_removed':'profile.photo_updated',state.actorId,removed?'Foto do perfil removida.':'Foto do perfil atualizada.',[state.actorId]);save();return {ok:true};
    },
    campaignImageChanged(campaignId,removed=false){
      requireActiveActor();
      const project=campaign(campaignId);
      if (actor().role!=='creator' || project.creatorId!==state.actorId) fail('FORBIDDEN','Somente o criador deste projeto pode alterar a capa.');
      availableProject(project);ensureCapacity();
      record(removed?'campaign.image_removed':'campaign.image_updated',project.id,removed?'Capa do projeto removida.':'Capa do projeto atualizada.');
      save();return {ok:true};
    },
    createProjectUpdate({ campaignId, title, body } = {}) {
      requireActiveActor();const project = campaign(campaignId);availableProject(project);
      if (actor().role !== 'creator' || project.creatorId !== state.actorId) fail('FORBIDDEN', 'Somente o criador deste projeto pode publicar atualizações.');
      if (!plainText(title,3,100) || !plainText(body,1,5000)) fail('INVALID_UPDATE', 'Informe um título entre 3 e 100 caracteres e um texto de até 5.000 caracteres, sem HTML.');
      if (state.projectUpdates.length >= 1000) fail('DEMO_LIMIT','O limite de atualizações deste ambiente foi atingido.');
      ensureCapacity();
      const update = {id:nextId('update'),campaignId:project.id,creatorId:state.actorId,title:title.trim(),body:body.trim(),createdAt:now()};
      state.projectUpdates.unshift(update); record('project.update_created',update.id,'Atualização do projeto publicada.');
      save(); return clone(update);
    },
    createProjectComment({ campaignId, body } = {}) {
      requireActiveActor();const project = campaign(campaignId);availableProject(project);
      if (!['creator','supporter'].includes(actor().role)) fail('FORBIDDEN','Selecione um perfil de apoiador ou criador para comentar.');
      if (!plainText(body,1,2000)) fail('INVALID_COMMENT','Escreva um comentário de até 2.000 caracteres, sem HTML.');
      if (state.projectComments.length >= 1000) fail('DEMO_LIMIT','O limite de comentários deste ambiente foi atingido.');
      ensureCapacity();
      const comment = {id:nextId('comment'),campaignId:project.id,authorId:state.actorId,authorName:actor().name,body:body.trim(),createdAt:now()};
      state.projectComments.unshift(comment); record('project.comment_created',comment.id,'Comentário publicado no projeto.');
      save(); return clone(comment);
    },
    createCampaign({ title, description, category, goalCents, daysLeft = 30, monthly = false, rewards = [], milestones = [] } = {}) {
      requireActiveActor();
      if (actor().role!=='creator') fail('FORBIDDEN', 'Use uma conta de criador para publicar uma campanha.');
      if (!plainText(title,5,90)) fail('INVALID_TITLE', 'Escreva um título entre 5 e 90 caracteres, sem HTML.');
      if (!plainText(description,20,600)) fail('INVALID_DESCRIPTION', 'Escreva uma descrição entre 20 e 600 caracteres, sem HTML.');
      if (!categories.includes(category)) fail('INVALID_CATEGORY', 'Selecione uma categoria válida.');
      if (!money(goalCents) || goalCents < 10000) fail('INVALID_AMOUNT', 'A meta deve ser de pelo menos R$ 100,00.');
      if (!Number.isInteger(daysLeft) || daysLeft < 1 || daysLeft > 90) fail('INVALID_DURATION', 'Escolha uma duração entre 1 e 90 dias.');
      if (typeof monthly !== 'boolean') fail('INVALID_MODE','Informe se o projeto aceita apoios mensais.');
      const normalizedMilestones=normalizeMilestones(milestones,goalCents);
      if (!Array.isArray(rewards) || rewards.length > 20) fail('INVALID_REWARD','Adicione até vinte recompensas ao projeto.');
      const normalizedRewards = rewards.map(reward => {
        if (!reward || !plainText(reward.title,2,100) || !plainText(reward.description,1,600)
            || !money(reward.amountCents) || reward.amountCents < 500 || (reward.monthly !== undefined && typeof reward.monthly !== 'boolean')) fail('INVALID_REWARD','Cada recompensa precisa de título, descrição e valor de pelo menos R$ 5,00.');
        if (reward.monthly && !monthly) fail('INVALID_REWARD_MODE','Ative os apoios mensais para oferecer uma recompensa mensal.');
        return {title:reward.title.trim(),description:reward.description.trim(),amountCents:reward.amountCents,monthly:reward.monthly ?? false};
      });
      const profile=state.creatorProfiles.find(p=>p.creatorId===state.actorId);
      ensureCapacity({campaigns:1,creatorProfiles:profile?0:1});
      const projectId = nextId('campaign');
      const project = { id: projectId, title: title.trim(), description: description.trim(), category, goalCents, daysLeft, monthly: Boolean(monthly), creator: actor().name, creatorId: state.actorId, image: 'assets/campaign-4.svg', raisedCents: 0, rewardRaisedCents:0, backers: 0, featured: false, story: description.trim(), rewards: normalizedRewards.map((reward,index) => ({id:`reward-${projectId}-${index+1}`,...reward})) };
      project.milestones=normalizedMilestones;
      setCampaignLocation(project,profile?.location);
      if (!profile) state.creatorProfiles.push({...profileFor(state.actorId),joinedAt:now()});
      state.campaigns.unshift(project); record('campaign.created', project.id, 'Campanha fictícia publicada.');
      save(); return clone(project);
    },

    updateCampaign({campaignId,title,description,story,category,goalCents,daysLeft,monthly,milestones} = {}) {
      requireActiveActor();const project=campaign(campaignId);
      if(actor().role!=='creator'||project.creatorId!==state.actorId) fail('FORBIDDEN','Somente o responsável pelo projeto pode editar suas configurações.');
      availableProject(project);
      const fields={title,description,story,category,goalCents,daysLeft,monthly};
      const next=Object.fromEntries(Object.entries(fields).map(([name,value])=>[name,value===undefined?project[name]:value]));
      if(!plainText(next.title,5,90))fail('INVALID_TITLE','Escreva um título entre 5 e 90 caracteres, sem HTML.');
      if(!plainText(next.description,20,600))fail('INVALID_DESCRIPTION','Escreva uma descrição entre 20 e 600 caracteres, sem HTML.');
      if(!plainText(next.story,1,10000))fail('INVALID_PROJECT_UPDATE','Escreva a apresentação do projeto em até 10.000 caracteres, sem HTML.');
      if(!categories.includes(next.category))fail('INVALID_CATEGORY','Selecione uma categoria válida.');
      if(!money(next.goalCents)||next.goalCents<10000)fail('INVALID_AMOUNT','A meta deve ser de pelo menos R$ 100,00.');
      next.milestones=normalizeMilestones(milestones===undefined?project.milestones:milestones,next.goalCents);
      if(!Number.isInteger(next.daysLeft)||next.daysLeft<1||next.daysLeft>90)fail('INVALID_DURATION','Escolha uma duração entre 1 e 90 dias.');
      if(typeof next.monthly!=='boolean')fail('INVALID_MODE','Informe se o projeto aceita apoios mensais.');
      if(!next.monthly && (project.rewards.some(r=>r.monthly)||state.contributions.some(c=>c.campaignId===project.id && (c.subscriptionStatus==='active' || (c.mode==='monthly' && !c.isRenewal && c.status==='pending'))))) fail('INVALID_MODE','Há recompensas, assinaturas ou apoios mensais pendentes neste projeto.');
      next.title=next.title.trim();next.description=next.description.trim();next.story=next.story.trim();
      const changedFields=Object.keys(next).filter(name=>JSON.stringify(next[name])!==JSON.stringify(project[name]));
      if(!changedFields.length)return {...clone(project),duplicate:true};
      ensureCapacity();
      Object.assign(project,next,{updatedAt:now()});
      record('campaign.updated',project.id,'Configurações do projeto atualizadas.',[project.creatorId],{changedFields});
      save();return clone(project);
    },
    getCampaignDeletionPreview(campaignId) {
      const project=campaign(campaignId);requireProjectManager(project);
      return deletionPlan(project).preview;
    },
    moderateCampaign({campaignId,deleted,reason,idempotencyKey} = {}) {
      const project=campaign(campaignId);requireProjectManager(project);
      if (project.purgedAt || (deleted===false && project.purgeAfter && currentTime()>=Date.parse(project.purgeAfter))) fail('PROJECT_EXPIRED','O prazo de recuperação deste projeto terminou.');
      if (deleted===false && actor().role!=='admin' && project.deletedAt && project.deletedBy!==state.actorId) fail('FORBIDDEN','Somente a administração pode recuperar um projeto removido pela moderação.');
      if (typeof deleted!=='boolean') fail('INVALID_MODERATION','Informe se o projeto deve ser excluído ou restaurado.');
      const explanation=moderationReason(reason);
      // Legacy administrator clients had no key. New commands bind the decision
      // and its settlement to the key even if it was already in effect.
      const key=idempotencyKey===undefined && actor().role==='admin' ? null
        : useKey('moderate-campaign',idempotencyKey,{campaignId,deleted,reason:explanation});
      if (key?.previous) return {...clone(project),...(deleted?{deletionSummary:clone(key.previous.deletionSummary)}:{}),duplicate:true};
      const duplicate=deleted ? Boolean(project.deletedAt && project.deletionSummary && project.purgeAfter) : !project.deletedAt;
      if (duplicate) {
        if (key) {
          ensureCapacity({auditLog:0,idempotency:1});
          state.idempotency[key.fullKey]={resourceId:project.id,fingerprint:key.fingerprint,...(deleted?{deletionSummary:clone(project.deletionSummary)}:{})};
          save();
        }
        return {...clone(project),duplicate:true};
      }
      if (deleted) {
        const {confirmed,pending,subscriptions,preview}=deletionPlan(project);
        if (!preview.canDelete) fail('REFUND_INSUFFICIENT_BALANCE','Saldo insuficiente para devolver integralmente os apoios registrados.');
        const rewardCents=sum(confirmed.filter(c=>c.rewardId),c=>c.amountCents);
        if (project.raisedCents-preview.requiredCents<project.rewardRaisedCents-rewardCents || project.rewardRaisedCents<rewardCents || project.backers<confirmed.length)
          fail('INVALID_STATE','Os totais do projeto são incompatíveis com os apoios registrados.');
        ensureCapacity({idempotency:key?1:0,ledger:2*confirmed.length});
        const at=now(),batchId=nextId('refund-batch');
        for (const c of confirmed) {
          const refundId=nextId('refund');
          Object.assign(c,{refundStatus:'completed',refundId,refundBatchId:batchId,refundedAt:at,refundedBy:state.actorId,refundReason:explanation});
          const common={type:'refund',amountCents:c.amountCents,contributionId:c.id,campaignId:project.id,campaignTitle:project.title,
            refundId,refundBatchId:batchId,status:'confirmed',createdAt:at,description:`Devolução de apoio a ${project.title}`};
          state.ledger.unshift({...common,id:nextId('ledger'),ownerId:c.creatorId,direction:'out'}, {...common,id:nextId('ledger'),ownerId:c.supporterId,direction:'in'});
        }
        for (const c of pending) Object.assign(c,{status:'canceled',canceledAt:at,cancellationReason:'project_deleted',cancellationBatchId:batchId});
        for (const c of subscriptions) Object.assign(c,{subscriptionStatus:'canceled',canceledAt:at,cancellationReason:'project_deleted',cancellationBatchId:batchId});
        project.raisedCents-=preview.requiredCents;
        project.rewardRaisedCents-=rewardCents;
        project.backers-=confirmed.length;
        const deletionSummary={batchId,refundedCents:preview.requiredCents,refundCount:confirmed.length,canceledPendingCount:pending.length,canceledSubscriptionsCount:subscriptions.length};
        // Settling a legacy moderation cannot turn it into a creator deletion
        // and grant the owner permission to undo the administrative decision.
        const moderation=project.deletedAt&&account(project.deletedBy).role==='admin'
          ? {deletedBy:project.deletedBy,deletionReason:project.deletionReason}
          : {deletedBy:state.actorId,deletionReason:explanation};
        Object.assign(project,{deletedAt:at,...moderation,deletionSummary,purgeAfter:new Date(Date.parse(at)+30*86400000).toISOString()});
        record('campaign.deleted',project.id,'Projeto excluído e apoios registrados liquidados.',[project.creatorId],{reason:explanation,deletionSummary});
      } else {
        ensureCapacity({idempotency:key?1:0});
        delete project.deletedAt;delete project.deletedBy;delete project.deletionReason;delete project.deletionSummary;delete project.purgeAfter;
        record('campaign.restored',project.id,'Projeto restaurado na área pública.',[project.creatorId],{reason:explanation});
      }
      if (key) state.idempotency[key.fullKey]={resourceId:project.id,fingerprint:key.fingerprint,...(deleted?{deletionSummary:clone(project.deletionSummary)}:{})};
      save();return clone(project);
    },
    publishRewardDelivery({contributionId,message,url=''}={}) {
      requireActiveActor();const support=contribution(contributionId),project=campaign(support.campaignId);
      const previous=state.rewardDeliveries.find(d=>d.contributionId===support.id);
      const result=prepareRewardDelivery({contribution:support,campaign:project,actor:actor(),previous,message,url,now:now(),id:'pending'});
      if(result.duplicate)return {...clone(result.delivery),duplicate:true};
      availableProject(project);ensureCapacity({rewardDeliveries:previous?0:1});
      if(previous)Object.assign(previous,result.delivery);
      else {result.delivery.id=nextId('delivery');state.rewardDeliveries.unshift(result.delivery);}
      record(previous?'reward.delivery_updated':'reward.delivered',result.delivery.id,previous?'Entrega digital da recompensa atualizada.':'Entrega digital da recompensa disponibilizada.',[support.creatorId,support.supporterId],{contributionId:support.id,campaignId:project.id,version:result.delivery.version});
      save();return clone(result.delivery);
    },
    acknowledgeRewardDelivery({deliveryId}={}) {
      requireActiveActor();const delivery=state.rewardDeliveries.find(d=>d.id===deliveryId);
      if(!delivery)fail('NOT_FOUND','Entrega não encontrada.');
      const support=contribution(delivery.contributionId),project=campaign(delivery.campaignId);
      const result=acknowledgeDelivery({delivery,contribution:support,campaign:project,actor:actor(),now:now()});
      if(result.duplicate)return {...clone(result.delivery),duplicate:true};
      ensureCapacity();Object.assign(delivery,result.delivery);
      record('reward.received',delivery.id,'Recebimento da recompensa confirmado pelo apoiador.',[support.creatorId,support.supporterId],{contributionId:support.id,campaignId:project.id});
      save();return clone(delivery);
    },
    // Internal maintenance only: never exposed as an HTTP command. Financial
    // parent rows remain as minimal references for receipts, refunds and audit.
    purgeExpiredProjects() {
      const due=state.campaigns.filter(p=>p.deletedAt&&p.purgeAfter&&!p.purgedAt&&Date.parse(p.purgeAfter)<=currentTime()
        && !state.contributions.some(c=>c.campaignId===p.id&&(c.status==='pending'||c.subscriptionStatus==='active'||(c.status==='confirmed'&&c.refundStatus!=='completed'))));
      if(!due.length)return [];
      const ids=new Set(due.map(p=>p.id)),at=now();
      for(const project of due){
        Object.assign(project,{title:'Projeto removido',description:'Conteúdo removido permanentemente.',story:'Conteúdo removido permanentemente.',image:'assets/campaign-4.svg',rewards:[],milestones:[],featured:false,monthly:false,goalCents:10000,raisedCents:0,rewardRaisedCents:0,backers:0,daysLeft:1,purgedAt:at});
        delete project.location;delete project.updatedAt;
        record('campaign.content_purged',project.id,'Conteúdo do projeto removido após o prazo de recuperação. Histórico financeiro preservado.',[project.creatorId],{actorId:'system'});
      }
      for(const key of ['projectUpdates','projectComments','rewardDeliveries'])state[key]=state[key].filter(item=>!ids.has(item.campaignId));
      state.savedCampaignIds=state.savedCampaignIds.filter(id=>!ids.has(id));
      for(const [owner,items] of Object.entries(state.savedByAccount||{}))state.savedByAccount[owner]=items.filter(id=>!ids.has(id));
      save();return [...ids];
    },
    moderateAccount({accountId,type,banned,expiresAt=null,reason} = {}) {
      requireAdmin();const target=account(accountId),explanation=moderationReason(reason);
      if(target.role==='admin'||accountId===state.actorId)fail('FORBIDDEN','Não é permitido punir uma conta administrativa.');
      const requestedType = type === undefined && typeof banned === 'boolean' ? (banned?'ban':'none') : type;
      if(!['ban','suspension','none'].includes(requestedType))fail('INVALID_MODERATION','Selecione banimento, suspensão ou liberação da conta.');
      const decisionTime=currentTime();let deadline=null;
      if(expiresAt !== null){
        if(typeof expiresAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(expiresAt) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt)<=decisionTime || new Date(`${expiresAt.slice(0,10)}T00:00:00.000Z`).toISOString().slice(0,10)!==expiresAt.slice(0,10) || Number(expiresAt.slice(11,13))>23)fail('INVALID_MODERATION','Escolha uma data de término futura ou duração indefinida.');
        deadline=new Date(expiresAt).toISOString();
      }
      if(requestedType==='none'&&deadline!==null)fail('INVALID_MODERATION','A liberação da conta não possui prazo.');
      let moderation=state.accountModerations.find(m=>m.accountId===accountId);
      const previousType=activeModeration(accountId)?.type ?? 'none';
      if(previousType===requestedType && (requestedType==='none' || (moderation?.expiresAt===deadline && moderation?.reason===explanation)))return {...clone(target),...accountStatus(accountId,true),duplicate:true};
      ensureCapacity({accountModerations:moderation?0:1});
      if(!moderation){moderation={id:`moderation-${accountId}`,accountId};state.accountModerations.push(moderation);}
      Object.assign(moderation,{type:requestedType,expiresAt:deadline,banned:requestedType==='ban',reason:explanation,updatedAt:new Date(decisionTime).toISOString(),updatedBy:state.actorId});
      const actions={ban:'account.banned',suspension:'account.suspended',none:previousType==='suspension'?'account.unsuspended':'account.unbanned'};
      const descriptions={ban:'Acesso à conta bloqueado por banimento.',suspension:'Conta suspensa para novas operações; leitura permanece disponível.',none:'Punição removida e conta liberada para novas operações.'};
      record(actions[requestedType],accountId,descriptions[requestedType],[accountId],{reason:explanation,type:requestedType,expiresAt:deadline,previousType});
      save();return {...clone(target),...accountStatus(accountId,true)};
    },
    moderateComment({commentId,removed,reason} = {}) {
      requireAdmin();const comment=state.projectComments.find(c=>c.id===commentId),explanation=moderationReason(reason);
      if(!comment)fail('NOT_FOUND','Comentário não encontrado.');
      if(typeof removed!=='boolean')fail('INVALID_MODERATION','Informe se o comentário deve ser removido ou restaurado.');
      if(Boolean(comment.removedAt)===removed)return {...clone(comment),duplicate:true};
      ensureCapacity();
      if(removed)Object.assign(comment,{removedAt:now(),removedBy:state.actorId,removalReason:explanation});
      else{delete comment.removedAt;delete comment.removedBy;delete comment.removalReason;}
      record(removed?'comment.removed':'comment.restored',comment.id,removed?'Comentário removido da área pública.':'Comentário restaurado na área pública.',[comment.authorId],{reason:explanation});
      save();return clone(comment);
    },
    sendDirectMessage({creatorId,body} = {}) {
      requireActiveActor();const target=account(creatorId);
      if(target.role!=='creator')fail('FORBIDDEN','A conversa direta deve ter um criador como destinatário.');
      if(actor().role!=='admin' && (actor().role!=='creator'||state.actorId!==creatorId))fail('FORBIDDEN','Esta conversa está disponível somente à administração e ao criador participante.');
      if(!plainText(body,1,2000))fail('INVALID_MESSAGE','Escreva uma mensagem de até 2.000 caracteres, sem HTML.');
      if(state.directMessages.length>=5000)fail('DEMO_LIMIT','O limite de mensagens deste ambiente foi atingido.');
      ensureCapacity();
      const message={id:nextId('message'),creatorId,senderId:state.actorId,body:body.trim(),createdAt:now()};
      state.directMessages.push(message);
      record('message.sent',message.id,'Mensagem direta enviada na conversa do criador.',[creatorId]);
      save();return clone(message);
    },
    auditForAccount(accountId) {
      requireAdmin();account(accountId);return clone(state.auditLog.filter(event=>auditAccounts(state,event).includes(accountId)));
    },
    getLedger() { requireAccountAccess();return clone(visibleLedger(actor())); },
    audit() { requireAccountAccess();if (actor().role !== 'admin') fail('FORBIDDEN', 'A trilha completa é exclusiva da personagem administradora.'); return clone(state.auditLog); },
    getSummary() { requireAccountAccess();return summaryFor(actor()); },
    getPublicState(actorId = state.actorId) {
      const identity=stateActors(state).find(item=>item.id===actorId);if(!identity)fail('INVALID_ACTOR','Personagem de demonstração não encontrada.');
      const viewer={...identity,...accountStatus(identity.id,true)};
      const visibleActors=stateActors(state).map(a=>({...a,...accountStatus(a.id,a.id===viewer.id||viewer.role==='admin')}));
      if(viewer.banned)return clone({schemaVersion:state.schemaVersion,actorId:viewer.id,actor:viewer,actors:visibleActors,accessBlocked:true,categories:[],accounts:[],campaigns:[],creatorProfiles:[],projectUpdates:[],projectComments:[],accountModerations:[],directMessages:[],rewardDeliveries:[],contributions:[],ledger:[],payouts:[],auditLog:[],savedCampaignIds:[],summary:{totalRaisedCents:0,totalSupportedCents:0,totalReceivedCents:0,availableBalanceCents:0,totalPayoutCents:0,activeSubscriptions:0,activeCampaigns:0,contributionCount:0,savedCount:0,pendingCount:0,monthlyTotalCents:0},persistenceAvailable});
      const projects=visibleCampaigns(viewer),projectIds=new Set(projects.map(c=>c.id));
      const publicAccounts=knownAccounts(state).map(a=>({...a,...accountStatus(a.id,a.id===viewer.id||viewer.role==='admin')}));
      return clone({schemaVersion:state.schemaVersion,actorId:viewer.id,actor:viewer,actors:visibleActors,accessBlocked:false,categories,
        accounts:publicAccounts,campaigns:projects,creatorProfiles:state.creatorProfiles.filter(p=>viewer.role==='admin'||p.creatorId===viewer.id||!isBanned(p.creatorId)),
        projectUpdates:state.projectUpdates.filter(u=>projectIds.has(u.campaignId)),projectComments:state.projectComments.filter(c=>viewer.role==='admin'||(projectIds.has(c.campaignId)&&!c.removedAt&&!isBanned(c.authorId))),
        accountModerations:state.accountModerations.filter(m=>viewer.role==='admin'||m.accountId===viewer.id),directMessages:state.directMessages.filter(m=>viewer.role==='admin'||(viewer.role==='creator'&&m.creatorId===viewer.id)),
        rewardDeliveries:state.rewardDeliveries.filter(d=>canAccessRewardDelivery({contribution:state.contributions.find(c=>c.id===d.contributionId),campaign:state.campaigns.find(c=>c.id===d.campaignId),actor:viewer})),
        contributions:visibleContributions(viewer),ledger:visibleLedger(viewer),payouts:state.payouts.filter(p=>viewer.role==='admin'||p.creatorId===viewer.id),
        auditLog:viewer.role==='admin'?state.auditLog:[],savedCampaignIds:savedFor(viewer.id).filter(id=>projectIds.has(id)),summary:summaryFor(viewer),persistenceAvailable});
    },
    reset() { requireActiveActor();state = createSeedState(); save(); return api.getState(); },
    exportSnapshot() {
      requireAccountAccess();return JSON.stringify(buildPersonalExport(api.getPublicState(),now()), null, 2);
    },
    securityDiagnostics() { requireAccountAccess();return securityDiagnostics(); },
  };
  save();
  return api;
}

/** Exercícios isolados de regras locais; não equivalem a um teste de uma API real. */
export function securityDiagnostics() {
  const checks = [];
  const check = (name, detail, run) => { try { if (!run()) throw new Error('Resultado inesperado'); checks.push({ name, passed: true, detail }); } catch (error) { checks.push({ name, passed: false, detail: error.message }); } };
  const expectCode = (fn, code) => { try { fn(); return false; } catch (error) { return error.code === code; } };
  check('Permissões por personagem', 'A personagem criadora não pode confirmar um apoio da apoiadora.', () => {
    const p = createPlatform(); p.switchActor('creator1'); return expectCode(() => p.simulatePayment('support-3'), 'FORBIDDEN');
  });
  check('Valor íntegro', 'Valores negativos e frações de centavo são rejeitados.', () => {
    const p = createPlatform(); return [-100, 500.5, NaN].every(amountCents => expectCode(() => p.createContribution({ campaignId: 'c1', amountCents, idempotencyKey: 'invalid' }), 'INVALID_AMOUNT'));
  });
  check('Confirmação sem duplicação', 'Receber a mesma confirmação duas vezes gera um único crédito.', () => {
    const p = createPlatform(); const support = p.createContribution({ campaignId: 'c1', amountCents: 5000, idempotencyKey: 'diagnostic-support' });
    const before = p.getCampaign('c1').raisedCents; p.simulatePayment(support.id); const second = p.simulatePayment(support.id);
    return second.duplicate && p.getCampaign('c1').raisedCents === before + 5000 && p.getState().ledger.filter(item => item.contributionId === support.id && item.ownerId === 'creator1').length === 1;
  });
  check('Identificação da operação', 'Uma chave repetida não pode ser reutilizada com outro valor.', () => {
    const p = createPlatform(); p.createContribution({ campaignId: 'c1', amountCents: 5000, idempotencyKey: 'same-key' });
    return expectCode(() => p.createContribution({ campaignId: 'c1', amountCents: 6000, idempotencyKey: 'same-key' }), 'IDEMPOTENCY_CONFLICT');
  });
  check('Repasse limitado ao saldo', 'Solicitações sucessivas não podem utilizar o mesmo saldo.', () => {
    const p = createPlatform(); p.switchActor('creator1'); const initial = p.getSummary().availableBalanceCents;
    p.requestPayout({ amountCents: initial, idempotencyKey: 'first' });
    return expectCode(() => p.requestPayout({ amountCents: 500, idempotencyKey: 'second' }), 'INSUFFICIENT_BALANCE') && p.getSummary().availableBalanceCents === 0;
  });
  check('Cancelamento preserva o histórico', 'Cancelar a recorrência mantém o apoio já confirmado.', () => {
    const p = createPlatform(); const before = p.getSummary().totalSupportedCents; p.cancelSubscription('support-2');
    return p.getSummary().activeSubscriptions === 0 && p.getSummary().totalSupportedCents === before && p.getState().contributions.find(item => item.id === 'support-2').status === 'confirmed';
  });
  check('Cobrança mensal sem assinatura duplicada', 'Cada ciclo tem pagamento próprio; confirmar a cobrança mantém uma única assinatura.', () => {
    const p = createPlatform(); const before = p.getSummary().monthlyTotalCents;
    const next = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'renew-check' });
    p.simulatePayment(next.id); p.simulatePayment(next.id);
    return p.getSummary().activeSubscriptions === 1 && p.getSummary().monthlyTotalCents === before
      && p.getState().ledger.filter(item => item.contributionId === next.id && item.direction === 'in').length === 1;
  });
  check('Cancelamento bloqueia a cobrança pendente', 'Cancelar a assinatura invalida seus ciclos pendentes e impede novas cobranças.', () => {
    const p = createPlatform(); const next = p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'cancel-next' });
    p.cancelSubscription('support-2');
    return p.getState().contributions.find(item => item.id === next.id).status === 'failed'
      && expectCode(() => p.renewSubscription({ contributionId: 'support-2', idempotencyKey: 'after-cancel' }), 'INACTIVE_SUBSCRIPTION')
      && expectCode(() => p.simulatePayment(next.id), 'INVALID_TRANSITION');
  });
  return checks;
}
