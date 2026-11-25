/** Personal portability view. Receives an already authorized public snapshot. */
export function buildPersonalExport(state, exportedAt = new Date().toISOString()) {
  const actor = state.actor;
  const own = (items, field) => (items || []).filter(item => item[field] === actor.id);
  const contributions = (state.contributions || []).filter(item => item.supporterId === actor.id || item.creatorId === actor.id);
  const projectUpdates = own(state.projectUpdates, 'creatorId');
  const projectComments = own(state.projectComments, 'authorId');
  const related = new Set([...(state.savedCampaignIds || []), ...contributions.map(item => item.campaignId), ...projectUpdates.map(item => item.campaignId), ...projectComments.map(item => item.campaignId)]);
  const conversations = new Set((state.directMessages || []).filter(item => item.creatorId === actor.id || item.senderId === actor.id).map(item => item.creatorId));
  return {
    prototype: 'Elo — demonstração acadêmica',
    warning: 'Pagamentos e repasses simulados. Projetos de exemplo usam dados fictícios.',
    exportedAt, actor, summary: state.summary,
    savedCampaignIds: state.savedCampaignIds || [],
    campaigns: (state.campaigns || []).filter(item => item.creatorId === actor.id || related.has(item.id)),
    contributions, ledger: own(state.ledger, 'ownerId'), payouts: own(state.payouts, 'creatorId'),
    rewardDeliveries: (state.rewardDeliveries || []).filter(item=>item.supporterId===actor.id||item.creatorId===actor.id),
    creatorProfiles: own(state.creatorProfiles, 'creatorId'), projectUpdates, projectComments,
    accountModerations: own(state.accountModerations, 'accountId'),
    directMessages: (state.directMessages || []).filter(item => conversations.has(item.creatorId)),
  };
}
