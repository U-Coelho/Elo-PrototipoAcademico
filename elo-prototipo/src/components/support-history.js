const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const restricted = account => Boolean(account?.restricted || account?.suspended || account?.banned);

export function canUseSupportPayments({support, campaign, actor, creator}) {
  return !restricted(actor) && Boolean(campaign) && !campaign.deletedAt &&
    !campaign.creatorBanned && !campaign.creatorRestricted && !restricted(creator) &&
    support.refundStatus !== 'completed';
}

export function renderSupportBadge(support, icon) {
  const badge = (label, style = '', glyph = 'check') => `<span class="badge ${style}">${icon(glyph)}${label}</span>`;
  if (support.refundStatus === 'completed') return badge('Apoio devolvido', 'neutral', 'repeat');
  if (support.cancellationReason === 'project_deleted') return badge('Cobrança cancelada pela exclusão do projeto', 'neutral');
  if (support.cancellationReason === 'subscription_canceled' || support.status === 'canceled') return badge('Cobrança cancelada', 'neutral');
  if (support.subscriptionStatus === 'canceled') return badge('Recorrência cancelada', 'neutral');
  if (support.status === 'pending') return badge('Aguardando confirmação', 'pending', 'clock');
  if (support.status === 'failed') return badge('Pagamento recusado', 'failed', 'close');
  return badge(support.mode === 'monthly' ? support.isRenewal ? 'Cobrança mensal confirmada' : 'Apoio mensal ativo' : 'Apoio confirmado');
}

export function renderSupportHistoryStatus({support, campaign, actor, creator, icon}) {
  const canPay = canUseSupportPayments({support, campaign, actor, creator});
  const activeSubscription = support.status === 'confirmed' && !support.isRenewal && support.subscriptionStatus === 'active' && !actor?.banned;
  const id = escapeHtml(support.id);
  const button = (label, action, style, target = id) => `<button type="button" class="btn ${style} small" data-action="${action}" data-id="${target}">${label}</button>`;
  const actions = [];
  if (support.status === 'confirmed') actions.push(button(`${icon('receipt')}Ver comprovante`, 'receipt', 'ghost'));
  if (support.status === 'pending') {
    if (canPay) actions.push(button('Confirmar pagamento', 'pending-confirm', ''));
    if (!restricted(actor)) actions.push(button('Recusar pagamento', 'pending-fail', 'secondary'));
  }
  if (support.status === 'failed' && canPay) {
    const campaignId = escapeHtml(support.campaignId);
    actions.push(support.isRenewal ? button('Ver projeto', 'project', 'secondary', campaignId) : button('Tentar um novo apoio', 'support', 'secondary', campaignId));
  }
  if (activeSubscription) {
    if (canPay) actions.push(button('Gerar próxima cobrança', 'renew-subscription', 'secondary'));
    actions.push(button('Cancelar recorrência', 'cancel-subscription', 'ghost'));
  }
  const badge = renderSupportBadge(support, icon);
  return actions.length ? `${badge}<div class="support-actions">${actions.join('')}</div>` : badge;
}
