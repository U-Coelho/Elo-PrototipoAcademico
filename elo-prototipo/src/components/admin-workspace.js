const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);
const list = value => Array.isArray(value) ? value : [];
const roleLabel = role => ({admin:'Administrador',creator:'Criador',supporter:'Apoiador'})[role] || 'Conta';
const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number.isSafeInteger(cents)?cents:0)/100);
const empty = message => `<p class="admin-empty">${esc(message)}</p>`;
const actorFor = state => state.actor || list(state.actors).find(actor=>actor.id===state.actorId);
const restricted = account => Boolean(account?.restricted||account?.banned||account?.suspended);
const accountsFor = state => {
  if (Array.isArray(state.accounts)) return state.accounts;
  const accounts = new Map(list(state.actors).map(actor=>[actor.id,actor]));
  for (const campaign of list(state.campaigns)) if(!accounts.has(campaign.creatorId)) accounts.set(campaign.creatorId,{id:campaign.creatorId,name:campaign.creator,role:'creator',banned:false});
  return [...accounts.values()];
};
const selectedOption = (value,selected) => value===selected?' selected':'';
const status = (label,kind='neutral') => `<span class="admin-status admin-status--${kind}">${esc(label)}</span>`;

function time(value) {
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'Data não informada';
  const instant=new Date(value);
  return `<time datetime="${esc(instant.toISOString())}">${esc(new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(instant))}</time>`;
}

function moderationNote(reason,when,by,accounts) {
  if(!reason&&!when)return '';
  const author=accounts.find(account=>account.id===by)?.name;
  return `<div class="admin-moderation-note">${reason?`<p><strong>Motivo:</strong> ${esc(reason)}</p>`:''}${when?`<p>${time(when)}${author?` · ${esc(author)}`:''}</p>`:''}</div>`;
}

function statusFilter(id,label,value,options) {
  return `<div class="admin-filter"><label for="${id}">${label}</label><select id="${id}">${options.map(([key,text])=>`<option value="${key}"${selectedOption(key,value)}>${text}</option>`).join('')}</select></div>`;
}

function projectPanel(state,filter,accounts) {
  const projects=list(state.campaigns).filter(project=>filter==='excluidos'?Boolean(project.deletedAt):filter==='ativos'?!project.deletedAt:true);
  return `<div class="admin-panel-heading"><div><h2>Projetos</h2><p>Exclua ou restaure a publicação mantendo o histórico de financiamento.</p></div>${statusFilter('admin-project-status','Status dos projetos',filter,[['todos','Todos'],['ativos','Ativos'],['excluidos','Excluídos']])}</div>
    ${projects.length?`<ul class="admin-records">${projects.map(project=>`<li class="admin-record"><div class="admin-record-main"><h3><button type="button" class="admin-record-link" data-action="navigate" data-page="projeto/${esc(project.id)}">${esc(project.title)}</button></h3><p class="admin-record-meta">${esc(project.creator)} · ${esc(project.category)} · ${esc(money(project.raisedCents))} arrecadados</p><p class="admin-record-id">${esc(project.id)}</p>${moderationNote(project.deletionReason,project.deletedAt,project.deletedBy,accounts)}</div><div class="admin-record-side">${status(project.deletedAt?'Excluído':'Ativo',project.deletedAt?'danger':'neutral')}<button type="button" class="btn ${project.deletedAt?'secondary':'danger'} small" data-action="moderate-project" data-id="${esc(project.id)}" data-value="${project.deletedAt?'restore':'delete'}">${project.deletedAt?'Restaurar':'Excluir'}</button></div></li>`).join('')}</ul>`:empty('Nenhum projeto corresponde ao status selecionado.')}`;
}

function accountPanel(state,filter,accounts) {
  const shown=accounts.filter(account=>filter==='banidos'?Boolean(account.banned):filter==='suspensos'?Boolean(account.suspended):filter==='ativos'?!restricted(account):true);
  return `<div class="admin-panel-heading"><div><h2>Contas</h2><p>Consulte a situação das contas e registre decisões de moderação.</p></div>${statusFilter('admin-account-status','Status das contas',filter,[['todos','Todas'],['ativos','Ativas'],['banidos','Banidas'],['suspensos','Suspensas']])}</div>
    ${shown.length?`<ul class="admin-records">${shown.map(account=>{
      const projects=list(state.campaigns).filter(project=>project.creatorId===account.id),moderation=list(state.accountModerations).find(item=>item.accountId===account.id);
      return `<li class="admin-record"><div class="admin-record-main"><h3><button type="button" class="admin-record-link" data-action="account-profile" data-id="${esc(account.id)}">${esc(account.name)}</button></h3><p class="admin-record-meta">${roleLabel(account.role)}${account.role==='creator'?` · ${projects.length} projeto${projects.length===1?'':'s'} criado${projects.length===1?'':'s'}`:''}</p><p class="admin-record-id">${esc(account.id)}</p>${account.email?`<p class="admin-record-meta">${esc(account.email)}</p>`:''}${restricted(account)?`<p class="admin-punishment-duration">${account.moderationExpiresAt?`Até ${time(account.moderationExpiresAt)}`:'Prazo indefinido'}</p>`:''}${moderationNote(moderation?.reason,moderation?.updatedAt,moderation?.updatedBy,accounts)}</div><div class="admin-record-side">${status(account.banned?'Banida':account.suspended?'Suspensa':'Ativa',restricted(account)?'danger':'neutral')}<button type="button" class="btn secondary small" data-action="account-profile" data-id="${esc(account.id)}">Ver perfil</button></div></li>`;
    }).join('')}</ul>`:empty('Nenhuma conta corresponde ao status selecionado.')}`;
}

function commentPanel(state,filter,accounts) {
  const comments=list(state.projectComments).filter(comment=>filter==='removidos'?Boolean(comment.removedAt):filter==='ativos'?!comment.removedAt:true);
  return `<div class="admin-panel-heading"><div><h2>Comentários</h2><p>Remova conteúdo da área pública ou restaure uma decisão anterior.</p></div>${statusFilter('admin-comment-status','Status dos comentários',filter,[['todos','Todos'],['ativos','Visíveis'],['removidos','Removidos']])}</div>
    ${comments.length?`<ul class="admin-records">${comments.map(comment=>{
      const project=list(state.campaigns).find(item=>item.id===comment.campaignId);
      return `<li class="admin-record"><div class="admin-record-main"><h3>${esc(comment.authorName||accounts.find(account=>account.id===comment.authorId)?.name||'Participante')}</h3><p class="admin-record-meta">${time(comment.createdAt)}${project?` · ${esc(project.title)}`:''}</p><p class="admin-comment-body">${esc(comment.body)}</p>${moderationNote(comment.removalReason,comment.removedAt,comment.removedBy,accounts)}</div><div class="admin-record-side">${status(comment.removedAt?'Removido':'Visível',comment.removedAt?'danger':'neutral')}<button type="button" class="btn ${comment.removedAt?'secondary':'danger'} small" data-action="moderate-comment" data-id="${esc(comment.id)}" data-value="${comment.removedAt?'restore':'remove'}">${comment.removedAt?'Restaurar':'Remover comentário'}</button></div></li>`;
    }).join('')}</ul>`:empty('Nenhum comentário corresponde ao status selecionado.')}`;
}

/** Legacy entries may not yet contain explicit relatedAccountIds. */
function relatedToAccount(entry,accountId,state) {
  if(!accountId)return true;
  if(entry.actorId===accountId||entry.accountId===accountId||entry.creatorId===accountId||entry.resourceId===accountId||list(entry.relatedAccountIds).includes(accountId))return true;
  const resourceId=entry.resourceId;
  const project=list(state.campaigns).find(item=>item.id===resourceId);
  if(project?.creatorId===accountId)return true;
  const support=list(state.contributions).find(item=>item.id===resourceId);
  if(support&&(support.supporterId===accountId||support.creatorId===accountId))return true;
  const payout=list(state.payouts).find(item=>item.id===resourceId);
  if(payout?.creatorId===accountId)return true;
  const profile=list(state.creatorProfiles).find(item=>item.id===resourceId);
  if(profile?.creatorId===accountId)return true;
  const update=list(state.projectUpdates).find(item=>item.id===resourceId);
  if(update?.creatorId===accountId)return true;
  const comment=list(state.projectComments).find(item=>item.id===resourceId);
  if(comment&&(comment.authorId===accountId||list(state.campaigns).some(item=>item.id===comment.campaignId&&item.creatorId===accountId)))return true;
  const message=list(state.directMessages).find(item=>item.id===resourceId);
  return Boolean(message&&(message.creatorId===accountId||message.senderId===accountId));
}

function logPanel(state,selectedAccountId,accounts,auditEntries) {
  const entries=(Array.isArray(auditEntries)?auditEntries:list(state.auditLog)).filter(entry=>relatedToAccount(entry,selectedAccountId,state)).slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return `<div class="admin-panel-heading"><div><h2>Registro de atividades</h2><p>Eventos realizados pela conta ou relacionados aos seus projetos e operações.</p></div><div class="admin-filter"><label for="admin-account-filter">Conta ou criador</label><select id="admin-account-filter"><option value="">Todas as contas</option>${accounts.map(account=>`<option value="${esc(account.id)}"${selectedOption(account.id,selectedAccountId)}>${esc(account.name)} · ${roleLabel(account.role)}</option>`).join('')}</select></div></div>
    ${entries.length?`<div class="admin-table-wrap" tabindex="0" role="region" aria-label="Registro de atividades filtrado"><table class="admin-audit-table"><thead><tr><th scope="col">Evento</th><th scope="col">Responsável</th><th scope="col">Data</th></tr></thead><tbody>${entries.map(entry=>{
      const privateMessage=/message|chat/i.test(entry.action||''),description=privateMessage?'Mensagem registrada na conversa privada.':entry.description;
      const policy=entry.action?.startsWith('account.')&&['ban','suspension','none'].includes(entry.type)?`<span class="admin-audit-reason">${entry.type==='none'?'Punição encerrada':`${entry.type==='ban'?'Banimento':'Suspensão'} · ${entry.expiresAt?`até ${time(entry.expiresAt)}`:'prazo indefinido'}`}</span>`:'';
      return `<tr><td><strong>${esc(description||entry.action)}</strong><span class="admin-audit-reference">${esc(entry.action)} · ${esc(entry.resourceId)}</span>${policy}${entry.reason?`<span class="admin-audit-reason">Motivo: ${esc(entry.reason)}</span>`:''}</td><td>${esc(accounts.find(account=>account.id===entry.actorId)?.name||entry.actorId||'Sistema')}</td><td>${time(entry.createdAt)}</td></tr>`;
    }).join('')}</tbody></table></div>`:empty('Nenhum evento corresponde à conta selecionada.')}`;
}

function conversation(state,creatorId,accounts,{readonly=false}={}) {
  const actor=actorFor(state),creator=accounts.find(account=>account.id===creatorId&&account.role==='creator');
  if(!creator)return empty('Selecione um criador para abrir a conversa.');
  const adminIds=accounts.filter(account=>account.role==='admin').map(account=>account.id);
  const messages=list(state.directMessages).filter(message=>message.creatorId===creatorId&&(message.senderId===creatorId||adminIds.includes(message.senderId))).slice().sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||String(a.id).localeCompare(String(b.id)));
  return `<div class="admin-conversation-heading"><div><h3>${actor?.role==='admin'?esc(creator.name):'Conversa com a administração'}</h3><p>Histórico privado entre o criador e a administração.</p></div><button type="button" class="text-button" data-action="refresh-state">Atualizar conversa</button></div>
    ${restricted(creator)?`<p class="admin-conversation-status">${actor?.role==='admin'?`A conta está ${creator.banned?'banida':'suspensa'}. A administração pode enviar orientações; o criador não pode responder enquanto a punição estiver ativa.`:'Sua conta está suspensa. O histórico permanece disponível para consulta.'}</p>`:''}
    <div class="admin-conversation" role="region" aria-label="Mensagens da conversa">${messages.length?messages.map(message=>`<article class="admin-message${message.senderId===actor?.id?' admin-message--own':''}"><header><strong>${esc(accounts.find(account=>account.id===message.senderId)?.name||'Administração')}</strong><span>${time(message.createdAt)}</span></header><p>${esc(message.body)}</p></article>`).join(''):empty('Esta conversa ainda não tem mensagens.')}</div>
    <form id="direct-message-form" data-creator-id="${esc(creatorId)}" class="admin-message-form"><label for="direct-message-body">Mensagem</label><textarea id="direct-message-body" name="body" required maxlength="2000" rows="4"${readonly?' disabled':''} aria-describedby="direct-message-error" placeholder="Escreva uma mensagem para esta conversa."></textarea><p id="direct-message-error" class="form-error" role="alert"></p><div class="admin-message-send"><span>Até 2.000 caracteres.</span><button type="submit" class="btn"${readonly?' disabled':''}>Enviar mensagem</button></div></form>`;
}

function messagePanel(state,selectedCreatorId,accounts) {
  const creators=accounts.filter(account=>account.role==='creator').slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
  const chosen=creators.some(account=>account.id===selectedCreatorId)?selectedCreatorId:creators[0]?.id||'';
  return `<div class="admin-panel-heading"><div><h2>Mensagens com criadores</h2><p>Selecione uma conta e consulte a conversa privada.</p></div><div class="admin-filter"><label for="message-creator">Criador da conversa</label><select id="message-creator"${creators.length?'':' disabled'}>${creators.length?creators.map(creator=>`<option value="${esc(creator.id)}"${selectedOption(creator.id,chosen)}>${esc(creator.name)}${creator.banned?' · banida':creator.suspended?' · suspensa':''}</option>`).join(''):'<option value="">Nenhum criador</option>'}</select></div></div>${conversation(state,chosen,accounts)}`;
}

export function renderAdminWorkspace({state={},selectedAccountId='',selectedCreatorId='',activeTab='projetos',statusFilters={},auditEntries}={}) {
  if(actorFor(state)?.role!=='admin')return `<section class="panel admin-access"><h1>Administração</h1><p>Esta área está disponível ao perfil de administrador.</p></section>`;
  const accounts=accountsFor(state),tabs=[['projetos','Projetos'],['contas','Contas'],['comentarios','Comentários'],['mensagens','Mensagens'],['logs','Logs']];
  const selected=tabs.some(([id])=>id===activeTab)?activeTab:'projetos';
  const panels={projetos:()=>projectPanel(state,statusFilters.projects||'todos',accounts),contas:()=>accountPanel(state,statusFilters.accounts||'todos',accounts),comentarios:()=>commentPanel(state,statusFilters.comments||'todos',accounts),mensagens:()=>messagePanel(state,selectedCreatorId,accounts),logs:()=>logPanel(state,selectedAccountId,accounts,auditEntries)};
  return `<div class="admin-workspace"><div class="page-intro"><div><p class="eyebrow">Gestão da plataforma</p><h1>Administração</h1><p>Gerencie projetos, contas, comentários e conversas.</p></div></div><div class="admin-tabs" role="tablist" aria-label="Ferramentas administrativas">${tabs.map(([id,label])=>`<button type="button" role="tab" id="admin-tab-${id}" aria-controls="admin-panel-${id}" aria-selected="${selected===id}" tabindex="${selected===id?'0':'-1'}" data-action="admin-tab" data-tab="${id}">${label}</button>`).join('')}</div>${tabs.map(([id,label])=>`<section class="admin-tab-panel" role="tabpanel" id="admin-panel-${id}" aria-labelledby="admin-tab-${id}" tabindex="0"${selected===id?'':' hidden'}>${panels[id]()}</section>`).join('')}</div>`;
}

export function renderCreatorInbox({state={},creatorId}={}) {
  const actor=actorFor(state);
  if(actor?.banned||state.accessBlocked)return `<section class="panel admin-access"><h1>Acesso bloqueado</h1><p>O banimento impede o acesso à conversa enquanto estiver ativo.</p></section>`;
  if(actor?.role!=='creator'||actor.id!==creatorId)return `<section class="panel admin-access"><h1>Mensagens</h1><p>Entre com o perfil de criador para consultar sua conversa.</p></section>`;
  const accounts=accountsFor(state),creator=accounts.find(account=>account.id===creatorId);
  return `<div class="creator-inbox"><div class="page-intro"><div><p class="eyebrow">Espaço do criador</p><h1>Mensagens</h1><p>Converse com a administração e acompanhe o histórico.</p></div></div><section class="panel">${conversation(state,creatorId,accounts,{readonly:restricted(actor)||restricted(creator)})}</section></div>`;
}
