import {renderProjectMilestones} from './project-milestones.js';
import {avatarContent} from './avatar.js';
import {projectImage} from './project-image.js';
import {formatProfileLocation} from '../domain/profile-location.js';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const currency = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const count = value => new Intl.NumberFormat('pt-BR').format(integer(value));
const identifier = value => String(value || 'project').replace(/[^a-zA-Z0-9_-]/g, '-');
const isRestricted = account => Boolean(account?.restricted||account?.banned||account?.suspended);

function timestamp(value, withTime = false) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const options = { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' };
  if (withTime) Object.assign(options, { hour: '2-digit', minute: '2-digit' });
  return `<time datetime="${escapeHtml(instant.toISOString())}">${escapeHtml(new Intl.DateTimeFormat('pt-BR', options).format(instant))}</time>`;
}

function safeExternalLink(link) {
  if (!link || typeof link.url !== 'string') return null;
  try {
    const url = new URL(link.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { url: url.href, label: typeof link.label === 'string' && link.label.trim() ? link.label.trim() : url.hostname, host: url.hostname };
  } catch { return null; }
}

/** A reward receipt is part of raisedCents, never an additional amount.
 * When funding exceeds the goal, retain the composition within a full bar.
 */
export function renderFundingProgress(campaign, { compact = false } = {}) {
  const total = integer(campaign?.raisedCents);
  const goal = integer(campaign?.goalCents);
  const rewards = Math.min(total, integer(campaign?.rewardRaisedCents));
  const direct = total - rewards;
  const percent = goal > 0 ? total / goal * 100 : 0;
  const filled = Math.min(100, percent);
  const rewardWidth = total > 0 ? filled * rewards / total : 0;
  const directWidth = filled - rewardWidth;
  const label = `Financiamento de ${campaign?.title || 'projeto'}`;
  const breakdown = `${currency(total)} arrecadados de uma meta de ${currency(goal)}. Apoios diretos: ${currency(direct)}. Recompensas: ${currency(rewards)}, incluídos no total.`;
  return `<div class="project-progress${compact ? ' project-progress--compact' : ''}">
    <div class="project-progress-track" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(percent))}" aria-valuetext="${escapeHtml(breakdown)}">
      <span class="project-progress-direct" style="width:${directWidth.toFixed(4)}%"></span><span class="project-progress-rewards" style="width:${rewardWidth.toFixed(4)}%"></span>
    </div>
    ${compact ? '' : `<div class="project-progress-summary"><strong>${count(Math.round(percent))}% da meta</strong><span>${total >= goal && goal > 0 ? 'Meta alcançada' : `Faltam ${currency(Math.max(0, goal - total))}`}</span></div><dl class="project-funding-legend"><div><dt><span class="project-funding-key project-funding-key--direct" aria-hidden="true"></span>Apoios diretos</dt><dd>${escapeHtml(currency(direct))}</dd></div><div><dt><span class="project-funding-key project-funding-key--rewards" aria-hidden="true"></span>Recompensas</dt><dd>${escapeHtml(currency(rewards))}</dd></div></dl>`}
  </div>`;
}

function creatorPanel(campaign, profile, projectCount, owner) {
  const links = Array.isArray(profile?.links) ? profile.links.map(safeExternalLink).filter(Boolean) : [];
  const joined = timestamp(profile?.joinedAt);
  return `<header class="project-section-heading"><h2>Sobre o criador</h2><div class="project-creator-actions" role="group" aria-label="Ações do perfil do criador"><button type="button" class="text-button" data-action="creator" data-id="${escapeHtml(campaign.creatorId)}">Ver perfil completo</button>${owner ? `<button type="button" class="btn secondary small" data-action="edit-creator-profile" data-id="${escapeHtml(campaign.creatorId)}">Editar perfil</button>` : ''}</div></header>
    <div class="project-creator-heading"><span class="project-creator-avatar" aria-hidden="true">${avatarContent({name:campaign.creator,avatarUrl:profile?.avatarUrl})}</span><div><h3>${escapeHtml(campaign.creator)}</h3>${campaign.location ? `<p>${escapeHtml(campaign.location)}</p>` : ''}</div></div>
    <p class="project-copy project-creator-bio">${escapeHtml(profile?.bio || 'O criador ainda não adicionou uma apresentação ao perfil.')}</p>
    <dl class="project-profile-facts"><div><dt>Conta criada em</dt><dd>${joined || 'Data não informada'}</dd></div><div><dt>Projetos criados</dt><dd>${count(projectCount)}</dd></div></dl>
    <div class="project-profile-links"><h3>Links do criador</h3>${links.length ? `<ul>${links.map(link => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(link.label)} — abrir em nova aba"><strong>${escapeHtml(link.label)}</strong><span>${escapeHtml(link.host)}</span></a></li>`).join('')}</ul>` : '<p>Nenhum link adicionado.</p>'}</div>`;
}

function rewardsPanel(campaign,restricted=false) {
  return `<div class="project-section-heading"><div><h2>Recompensas</h2><p>Escolha uma opção de apoio. O valor também compõe o financiamento do projeto.</p></div></div><div class="project-rewards-grid">${campaign.rewards.map(reward => `<article class="project-reward"><div class="project-reward-heading"><h3>${escapeHtml(reward.title)}</h3><span>${reward.monthly ? 'Apoio mensal' : 'Apoio único'}</span></div><p>${escapeHtml(reward.description)}</p><div class="project-reward-price">${escapeHtml(currency(integer(reward.amountCents)))}${reward.monthly ? '<small> / mês</small>' : ''}</div><button type="button" class="btn secondary full" data-action="support" data-id="${escapeHtml(campaign.id)}" data-reward-id="${escapeHtml(reward.id)}" data-amount="${integer(reward.amountCents)}" data-mode="${reward.monthly ? 'monthly' : 'once'}" ${restricted?'disabled':''}>Escolher recompensa</button></article>`).join('')}</div>`;
}

function updatesPanel(campaign, updates, owner) {
  return `<div class="project-section-heading"><div><h2>Atualizações</h2><p>Acompanhe as novidades publicadas pelo criador.</p></div>${owner ? `<button type="button" class="btn secondary small" data-action="create-project-update" data-id="${escapeHtml(campaign.id)}">Publicar atualização</button>` : ''}</div>${updates.length ? `<div class="project-posts">${updates.map(update => `<article class="project-post"><header><h3>${escapeHtml(update.title)}</h3><p>${escapeHtml(campaign.creator)}<span aria-hidden="true"> · </span>${timestamp(update.createdAt, true) || 'Data não informada'}</p></header><p class="project-copy">${escapeHtml(update.body)}</p></article>`).join('')}</div>` : '<p class="project-section-empty">O criador ainda não publicou atualizações.</p>'}`;
}

function commentsPanel(campaign, comments, actor, accounts) {
  const admin=actor?.role==='admin';
  const canComment = ['supporter', 'creator'].includes(actor?.role)&&!isRestricted(actor)&&!campaign.deletedAt&&!campaign.creatorRestricted&&!campaign.creatorBanned;
  return `<div class="project-section-heading"><div><h2>Comentários <span class="project-comment-count">${count(comments.length)}</span></h2><p>Perguntas e conversas sobre o projeto.</p></div>${canComment ? `<button type="button" class="btn secondary small" data-action="create-project-comment" data-id="${escapeHtml(campaign.id)}">Comentar</button>` : ''}</div>${comments.length ? `<div class="project-posts">${comments.map(comment => `<article class="project-post project-comment"><header><span class="project-comment-avatar" aria-hidden="true">${avatarContent(accounts.find(a=>a.id===comment.authorId)||{name:comment.authorName})}</span><div><h3>${comment.authorId?`<button type="button" class="project-author-link" data-action="account-profile" data-id="${escapeHtml(comment.authorId)}">${escapeHtml(comment.authorName || 'Participante')}</button>`:escapeHtml(comment.authorName || 'Participante')}</h3><p>${timestamp(comment.createdAt, true) || 'Data não informada'}</p></div></header><p class="project-copy">${escapeHtml(comment.body)}</p>${comment.removedAt?`<p class="project-comment-moderation">Comentário removido. ${escapeHtml(comment.removalReason||'')}</p>`:''}${admin?`<div class="context-admin-actions project-comment-actions" aria-label="Moderação do comentário de ${escapeHtml(comment.authorName||'participante')}"><button type="button" class="btn ${comment.removedAt?'secondary':'danger'} small" data-action="moderate-comment" data-id="${escapeHtml(comment.id)}" data-value="${comment.removedAt?'restore':'remove'}">${comment.removedAt?'Restaurar comentário':'Remover comentário'}</button></div>`:''}</article>`).join('')}</div>` : '<p class="project-section-empty">Ainda não há comentários. Comece uma conversa sobre este projeto.</p>'}`;
}

export function renderProjectDetail({ campaign, profile, projectCount = 0, updates = [], comments = [], actor, creatorAccount, accounts = [], selectedTab = 'sobre', saved = false } = {}) {
  if (!campaign) return '';
  const location = profile?.location !== undefined ? formatProfileLocation(profile.location) : campaign.location;
  const rewards = Array.isArray(campaign.rewards) ? campaign.rewards : [];
  const admin=actor?.role==='admin';
  const creator=creatorAccount||accounts.find(account=>account.id===campaign.creatorId);
  const owner = actor?.role === 'creator' && actor.id === campaign.creatorId&&!isRestricted(actor)&&!campaign.deletedAt;
  const configurable=owner&&!campaign.deletedAt;
  const restricted=Boolean(campaign.deletedAt||campaign.creatorBanned||campaign.creatorRestricted||isRestricted(creator)||isRestricted(actor)||owner);
  const tabs = [{ id: 'sobre', label: 'Sobre' }, { id: 'criador', label: 'Criador' }, ...(rewards.length ? [{ id: 'recompensas', label: 'Recompensas' }] : []), { id: 'atualizacoes', label: 'Atualizações' }, { id: 'comentarios', label: 'Comentários' }];
  const active = tabs.some(tab => tab.id === selectedTab) ? selectedTab : 'sobre';
  const prefix = `project-${identifier(campaign.id)}`;
  const ownUpdates = (Array.isArray(updates) ? updates : []).filter(item => item?.campaignId === campaign.id).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const ownComments = (Array.isArray(comments) ? comments : []).filter(item => item?.campaignId === campaign.id).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const panels = {
    sobre: `<div class="project-section-heading"><h2>Sobre o projeto</h2></div><p class="project-copy project-story">${escapeHtml(campaign.story)}</p>${renderProjectMilestones(campaign)}`,
    criador: creatorPanel({...campaign,location}, profile, projectCount, owner),
    recompensas: rewards.length ? rewardsPanel({ ...campaign, rewards },restricted) : '',
    atualizacoes: updatesPanel(campaign, ownUpdates, owner),
    comentarios: commentsPanel(campaign, ownComments, actor, accounts),
  };
  return `<div class="project-detail-page"><button type="button" class="text-button detail-back" data-action="navigate" data-page="explorar">Voltar para projetos</button>
    ${campaign.deletedAt?`<div class="project-unavailable-note" role="status"><strong>Projeto excluído da área pública.</strong>${campaign.deletionReason?` ${escapeHtml(campaign.deletionReason)}`:''}${campaign.purgeAfter?`<p>Conteúdo e imagens serão removidos permanentemente a partir de ${timestamp(campaign.purgeAfter,true)}. O histórico financeiro será preservado.</p>`:''}${campaign.deletedBy===actor?.id&&actor?.role==='creator'&&!isRestricted(actor)&&(!campaign.purgeAfter||Date.parse(campaign.purgeAfter)>Date.now())?`<button type="button" class="btn secondary small" data-action="moderate-project" data-id="${escapeHtml(campaign.id)}" data-value="restore">Recuperar projeto</button>`:''}</div>`:campaign.creatorBanned||campaign.creatorRestricted||isRestricted(creator)?'<div class="project-unavailable-note" role="status">Este criador está com uma restrição ativa. Novos apoios estão indisponíveis.</div>':''}
    <header class="project-heading"><div class="project-heading-top"><div><p class="card-category">${escapeHtml(campaign.category)}</p><h1>${escapeHtml(campaign.title)}</h1></div>${configurable?`<button type="button" class="icon-button project-config-button" data-action="project-settings" data-id="${escapeHtml(campaign.id)}" aria-label="Configurar projeto" title="Configurar projeto"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 3-.7 2.3-2.2 1L4 5.5 2 9l1.7 1.5v3L2 15l2 3.5 2.1-.8 2.2 1L9 21h4l.7-2.3 2.2-1 2.1.8 2-3.5-1.7-1.5v-3L20 9l-2-3.5-2.1.8-2.2-1L13 3Z"/><circle cx="11" cy="12" r="3"/></svg></button>`:''}</div><p class="project-description">${escapeHtml(campaign.description)}</p><div class="project-byline"><span>por <button type="button" data-action="project-tab" data-tab="criador" data-id="${escapeHtml(campaign.id)}">${escapeHtml(campaign.creator)}</button></span>${location ? `<span>${escapeHtml(location)}</span>` : ''}</div></header>
    ${admin?`<section class="context-admin-tools" aria-label="Administração deste projeto"><h2>Administrar projeto</h2><div class="context-admin-actions"><button type="button" class="btn ${campaign.deletedAt?'secondary':'danger'} small" data-action="moderate-project" data-id="${escapeHtml(campaign.id)}" data-value="${campaign.deletedAt?'restore':'delete'}">${campaign.deletedAt?'Restaurar projeto':'Excluir projeto'}</button></div></section>`:''}
    ${owner?`<div class="project-owner-actions"><button type="button" class="btn danger small" data-action="moderate-project" data-id="${escapeHtml(campaign.id)}" data-value="delete">Excluir projeto</button></div>`:''}
    <div class="project-layout"><div class="project-main"><img class="project-cover" src="${projectImage(campaign.image)}" alt="${escapeHtml(campaign.title)}" width="850" height="500">
      <div class="project-tabs" role="tablist" aria-label="Informações do projeto">${tabs.map(tab => `<button type="button" class="project-tab" role="tab" id="${prefix}-tab-${tab.id}" aria-controls="${prefix}-panel-${tab.id}" aria-selected="${active === tab.id}" tabindex="${active === tab.id ? '0' : '-1'}" data-action="project-tab" data-tab="${tab.id}" data-id="${escapeHtml(campaign.id)}">${tab.label}</button>`).join('')}</div>
      ${tabs.map(tab => `<section class="project-tab-panel" role="tabpanel" id="${prefix}-panel-${tab.id}" aria-labelledby="${prefix}-tab-${tab.id}" tabindex="0"${active !== tab.id ? ' hidden' : ''}>${panels[tab.id]}</section>`).join('')}
    </div><aside class="panel project-funding" aria-label="Financiamento do projeto"><h2>Financiamento</h2><strong class="project-raised">${escapeHtml(currency(integer(campaign.raisedCents)))}</strong><p class="project-goal">arrecadados de uma meta de ${escapeHtml(currency(integer(campaign.goalCents)))}</p>${renderFundingProgress(campaign)}<div class="project-funding-facts"><span><strong>${count(campaign.backers)}</strong> apoios</span><span><strong>${count(campaign.daysLeft)}</strong> dias restantes</span></div><button type="button" class="btn full" data-action="support" data-id="${escapeHtml(campaign.id)}" ${restricted?'disabled':''}>${owner?'Seu projeto':rewards.length ? 'Apoiar sem recompensa' : 'Apoiar projeto'}</button>${rewards.length ? `<button type="button" class="btn secondary full" data-action="project-tab" data-tab="recompensas" data-id="${escapeHtml(campaign.id)}">Ver recompensas</button>` : ''}<button type="button" class="btn ghost full" data-action="save" data-id="${escapeHtml(campaign.id)}" aria-pressed="${Boolean(saved)}">${saved ? 'Projeto salvo' : 'Salvar projeto'}</button></aside></div></div>`;
}
