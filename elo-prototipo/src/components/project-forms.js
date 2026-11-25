import {renderMilestoneEditor} from './project-milestones.js';
import {avatarContent} from './avatar.js';
import {isStoredProjectImage, projectImage} from './project-image.js';
import {BRAZIL_STATES} from '../domain/profile-location.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const footer = label => `<p class="form-error" id="project-form-error" role="alert"></p><div class="modal-footer"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button type="submit" class="btn">${label}</button></div>`;

export function renderProjectImageEditor(campaign) {
  const current = campaign ? projectImage(campaign.image) : null;
  return `<section class="draft-section project-image-editor" aria-labelledby="project-image-title">
    <h3 id="project-image-title">Capa do projeto</h3>
    <img id="project-image-preview" class="project-image-preview" alt="${campaign ? 'Capa atual do projeto' : 'Prévia da capa'}" width="320" height="200"${current ? ` src="${current}"` : ' hidden'}>
    <div class="form-group"><label for="project-image-file">${campaign ? 'Escolher nova capa' : 'Adicionar capa (opcional)'}</label><input type="file" id="project-image-file" name="thumbnail" accept="image/jpeg,image/png,image/webp" aria-describedby="project-image-hint project-image-error"><p class="form-hint" id="project-image-hint">JPG, PNG ou WebP estático, até 5 MB. A imagem será recortada para 1280 × 800.</p></div>
    <p id="project-image-error" class="form-error" role="alert"></p>
    <div class="context-admin-actions">
      ${campaign ? '<button type="button" class="btn secondary small" data-action="upload-project-image" disabled>Salvar capa</button>' : ''}
      <button type="button" class="text-button" data-action="discard-project-image" hidden>Descartar seleção</button>
      ${isStoredProjectImage(current) ? '<button type="button" class="text-button" data-action="remove-project-image">Remover capa própria</button>' : ''}
    </div>
  </section>`;
}

export function renderCampaignForm(categories) {
  return `<form id="campaign-form"><div class="form-group"><label for="campaign-category">Categoria</label><select id="campaign-category" name="category" required><option value="">Selecione uma categoria</option>${categories.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div class="form-group"><label for="campaign-title">Nome do projeto</label><input id="campaign-title" name="title" required minlength="5" maxlength="90" placeholder="Ex.: Uma biblioteca para o bairro"></div><div class="form-group"><label for="campaign-description">Descrição do projeto</label><textarea id="campaign-description" name="description" required minlength="20" maxlength="600" placeholder="Apresente a proposta e explique como o financiamento será utilizado."></textarea></div><div class="field-grid"><div class="form-group"><label for="campaign-goal">Meta em reais</label><input id="campaign-goal" name="goal" inputmode="decimal" required value="5000,00" maxlength="13"></div><div class="form-group"><label for="campaign-days">Duração em dias</label><input id="campaign-days" name="days" type="number" min="1" max="90" required value="30"></div></div><div class="form-group"><label class="checkbox-label"><input id="campaign-monthly" name="monthly" type="checkbox">Permitir apoio mensal</label></div><section class="draft-section" aria-labelledby="campaign-rewards-title"><div class="draft-heading"><div><h3 id="campaign-rewards-title">Recompensas <span class="muted">· opcional</span></h3><p>Adicione opções de apoio ou publique sem recompensas.</p></div><button type="button" class="btn secondary small" data-action="add-reward">Adicionar recompensa</button></div><div id="campaign-rewards"></div><p class="form-hint">A aba Recompensas aparece somente quando houver opções cadastradas.</p></section>${renderMilestoneEditor()}${renderProjectImageEditor()}${footer('Publicar projeto')}</form>`;
}

export function renderRewardDraft(index, {monthlyEnabled=false}={}) {
  const prefix=`reward-draft-${index}`;
  return `<fieldset class="reward-draft" data-reward-draft><legend>Recompensa</legend><div class="form-group"><label for="${prefix}-title">Nome da recompensa</label><input id="${prefix}-title" data-reward-title required maxlength="100" minlength="3"></div><div class="form-group"><label for="${prefix}-description">O que o apoiador recebe?</label><textarea id="${prefix}-description" data-reward-description required maxlength="600" minlength="5"></textarea></div><div class="field-grid"><div class="form-group"><label for="${prefix}-amount">Valor mínimo em reais</label><input id="${prefix}-amount" data-reward-amount required inputmode="decimal" maxlength="13" value="25,00"></div><div class="form-group"><label class="checkbox-label reward-draft-monthly"><input id="${prefix}-monthly" data-reward-monthly type="checkbox" ${monthlyEnabled?'':'disabled'}>Recompensa mensal</label><p class="form-hint">Disponível com apoio mensal habilitado.</p></div></div><button type="button" class="text-button" data-action="remove-reward">Remover recompensa</button></fieldset>`;
}

export function renderProfilePhotoEditor(account={}) {
  return `<section id="profile-photo-editor" class="profile-photo-editor" aria-labelledby="profile-photo-title"><h3 id="profile-photo-title">Foto de perfil</h3><div class="profile-photo-current"><span class="creator-public-avatar" aria-hidden="true">${avatarContent(account)}</span><span class="form-hint">Sua foto atual</span></div><form id="avatar-form"><div class="form-group"><label for="profile-photo-file">Escolher foto</label><input type="file" id="profile-photo-file" name="photo" accept="image/jpeg,image/png,image/webp" required aria-describedby="profile-photo-hint"><p class="form-hint" id="profile-photo-hint">JPG, PNG ou WebP, até 2 MB. A foto será recortada no formato quadrado.</p></div><img id="profile-photo-preview" class="profile-photo-preview" alt="Prévia da nova foto" hidden><p id="profile-photo-error" class="form-error" role="alert"></p><div class="context-admin-actions"><button type="submit" class="btn secondary small">Salvar foto</button>${account.avatarUrl?'<button type="button" class="text-button" data-action="remove-profile-photo">Remover foto</button>':''}</div></form></section>`;
}

export function renderCreatorProfileForm(profile={},account={}) {
  return `${renderProfilePhotoEditor(account)}<form id="creator-profile-form"><div class="form-group"><label for="creator-bio">Bio do perfil</label><textarea id="creator-bio" name="bio" maxlength="2000" rows="6" placeholder="Conte um pouco sobre você ou seu trabalho.">${esc(profile.bio)}</textarea></div><fieldset class="draft-section profile-location"><legend>Localização pública · opcional</legend><p class="form-hint" id="creator-location-hint">A cidade e a UF aparecem no seu perfil e nos seus projetos. Informe apenas esses dados, sem endereço ou coordenadas de GPS.</p><div class="field-grid"><div class="form-group"><label for="creator-city">Cidade</label><input id="creator-city" name="city" maxlength="100" aria-describedby="creator-location-hint" value="${esc(profile.location?.city)}"></div><div class="form-group"><label for="creator-region">UF</label><select id="creator-region" name="region" aria-describedby="creator-location-hint"><option value="">Selecione a UF</option>${BRAZIL_STATES.map(uf => `<option value="${uf}"${uf === profile.location?.region ? ' selected' : ''}>${uf}</option>`).join('')}</select></div></div></fieldset><section class="draft-section" aria-labelledby="creator-links-title"><div class="draft-heading"><div><h3 id="creator-links-title">Contas e links externos</h3><p>Adicione o endereço público de um perfil ou site.</p></div><button type="button" class="btn secondary small" data-action="add-profile-link">Adicionar link</button></div><div id="creator-links">${(profile.links||[]).map((link,i)=>renderProfileLinkDraft(i,link)).join('')}</div></section>${footer('Salvar perfil')}</form>`;
}

export function renderProfileLinkDraft(index,link={}) {
  return `<fieldset class="profile-link-draft" data-profile-link><legend>Link do criador</legend><div class="form-group"><label for="creator-link-${index}-label">Plataforma ou título</label><input id="creator-link-${index}-label" data-link-label required maxlength="60" value="${esc(link.label)}" placeholder="Ex.: Instagram, YouTube ou site"></div><div class="form-group"><label for="creator-link-${index}-url">Endereço do perfil ou site</label><input id="creator-link-${index}-url" data-link-url type="url" required maxlength="500" value="${esc(link.url)}" placeholder="https://"></div><button type="button" class="text-button" data-action="remove-profile-link">Remover link</button></fieldset>`;
}

export function renderProjectPostForm(kind,campaignId) {
  const update=kind==='update';
  return `<form id="${update?'project-update-form':'project-comment-form'}" data-campaign-id="${esc(campaignId)}">${update?'<div class="form-group"><label for="project-post-title">Título da atualização</label><input id="project-post-title" name="title" maxlength="100" required minlength="3"></div>':''}<div class="form-group"><label for="project-post-body">${update?'Conteúdo da atualização':'Comentário'}</label><textarea id="project-post-body" name="body" rows="6" required minlength="1" maxlength="${update?5000:2000}"></textarea></div>${footer(update?'Publicar atualização':'Publicar comentário')}</form>`;
}

export function renderCampaignSettingsForm(campaign,categories,{monthlyLocked=false}={}) {
  return `<form id="campaign-settings-form" data-campaign-id="${esc(campaign.id)}"><div class="form-group"><label for="settings-title">Nome do projeto</label><input id="settings-title" name="title" minlength="5" maxlength="90" required value="${esc(campaign.title)}"></div><div class="form-group"><label for="settings-category">Categoria</label><select id="settings-category" name="category" required>${categories.map(c=>`<option ${c===campaign.category?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="form-group"><label for="settings-description">Descrição curta</label><textarea id="settings-description" name="description" required minlength="20" maxlength="600">${esc(campaign.description)}</textarea></div><div class="form-group"><label for="settings-story">Sobre o projeto</label><textarea id="settings-story" name="story" required minlength="20" maxlength="10000" rows="7">${esc(campaign.story)}</textarea></div><div class="field-grid"><div class="form-group"><label for="settings-goal">Meta em reais</label><input id="settings-goal" name="goal" inputmode="decimal" maxlength="13" required value="${(campaign.goalCents/100).toFixed(2).replace('.',',')}"></div><div class="form-group"><label for="settings-days">Prazo restante em dias</label><input id="settings-days" name="days" type="number" min="1" max="90" required value="${campaign.daysLeft}"></div></div><div class="form-group"><label class="checkbox-label"><input id="settings-monthly" name="monthly" type="checkbox" ${campaign.monthly?'checked':''} ${monthlyLocked?'disabled':''}>Permitir apoio mensal</label>${monthlyLocked?'<p class="form-hint">O apoio mensal permanece ativo enquanto houver recompensas mensais ou assinaturas em andamento.</p>':''}</div>${renderMilestoneEditor(campaign.milestones)}${renderProjectImageEditor(campaign)}${footer('Salvar alterações')}</form>`;
}

function renderDeletionImpact(preview) {
  const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents / 100);
  const quantity = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
  return `<dl class="deletion-amounts">
    <div><dt>Devolução integral</dt><dd>${money(preview.requiredCents)}</dd></div>
    <div><dt>Saldo disponível</dt><dd>${money(preview.availableCents)}</dd></div>
  </dl>
  <p>Ao excluir, o saldo retido será usado para devolver integralmente os apoios confirmados aos apoiadores.</p>
  <ul class="deletion-effects">
    <li>${quantity(preview.confirmedCount,'apoio confirmado','apoios confirmados')} para devolver</li>
    <li>${quantity(preview.pendingCount,'pagamento pendente','pagamentos pendentes')} para cancelar</li>
    <li>${quantity(preview.subscriptionCount,'assinatura','assinaturas')} para encerrar</li>
  </ul>
  <p class="form-hint">O projeto sai da área pública após a devolução integral. Você terá 30 dias após os reembolsos para recuperá-lo, se a exclusão for sua. Depois desse prazo, o conteúdo e as imagens serão removidos permanentemente. O histórico financeiro será preservado.</p>
  ${preview.canDelete ? '' : `<p class="notice warning" role="status">Faltam ${money(preview.shortfallCents)} no saldo disponível para realizar todas as devoluções.</p>`}`;
}

export function renderModerationForm({targetName,actionLabel,detail,danger=false,deletionPreview,reason=''}) {
  return `<form id="moderation-form"><p class="moderation-target">${esc(targetName)}</p>${deletionPreview ? renderDeletionImpact(deletionPreview) : `<p class="form-hint">${esc(detail)}</p>`}
    <div class="form-group moderation-reason-group"><label for="moderation-reason">Motivo da ação</label><textarea id="moderation-reason" name="reason" minlength="5" maxlength="500" required rows="4" placeholder="Descreva o motivo para o registro.">${esc(reason)}</textarea></div>
    <p id="project-form-error" class="form-error" role="alert"></p>
    <div class="modal-footer"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button type="submit" class="btn ${danger?'danger':''}"${deletionPreview && !deletionPreview.canDelete ? ' disabled' : ''}>${esc(actionLabel)}</button></div>
  </form>`;
}

export function renderAccountPunishmentForm({targetName,current={}}={}) {
  const type=current.moderationType==='suspension'||current.type==='suspension'?'suspension':'ban';
  const rawUntil=current.moderationExpiresAt||current.expiresAt;
  const currentUntil=rawUntil&&Number.isFinite(Date.parse(rawUntil))?rawUntil:null;
  const active=Boolean(current.restricted||current.banned||current.suspended||['ban','suspension'].includes(current.moderationType)||['ban','suspension'].includes(current.type));
  const duration=active?(currentUntil?'custom':'indefinite'):'7d';
  const date=currentUntil?new Date(currentUntil):null,pad=value=>String(value).padStart(2,'0');
  const localValue=date?`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3,'0')}`:'';
  return `<form id="account-punishment-form"><p class="moderation-target">${esc(targetName)}</p>
    <div class="form-group"><label for="punishment-type">Tipo de punição</label><select id="punishment-type" name="type" required><option value="ban"${type==='ban'?' selected':''}>Banimento</option><option value="suspension"${type==='suspension'?' selected':''}>Suspensão</option></select><p class="form-hint">Banimento bloqueia o acesso à conta. Suspensão permite visualizar o conteúdo, mas impede novas publicações, apoios e outras alterações.</p></div>
    <div class="form-group"><label for="punishment-duration">Duração</label><select id="punishment-duration" name="duration" required>${[['1h','1 hora'],['1d','1 dia'],['7d','7 dias'],['30d','30 dias'],['indefinite','Indefinida'],['custom','Até uma data e hora']].map(([value,label])=>`<option value="${value}"${duration===value?' selected':''}>${label}</option>`).join('')}</select>${currentUntil?`<p class="form-hint">Prazo atual: ${esc(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(date))}.</p>`:''}</div>
    <div class="form-group" id="punishment-custom-until"${duration==='custom'?'':' hidden'}><label for="punishment-until">Data e hora de encerramento</label><input type="datetime-local" step="0.001" id="punishment-until" name="expiresAt"${duration==='custom'?` required value="${localValue}"`:' disabled'}><p class="form-hint">Use a data e hora local deste dispositivo.</p></div>
    <div class="form-group"><label for="punishment-reason">Motivo da punição</label><textarea id="punishment-reason" name="reason" minlength="5" maxlength="500" required rows="4" placeholder="Explique a decisão para a pessoa e para o registro administrativo."></textarea></div><p id="project-form-error" class="form-error" role="alert"></p><div class="modal-footer"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button type="submit" class="btn danger">Aplicar punição</button></div></form>`;
}
