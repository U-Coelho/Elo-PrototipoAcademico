import {renderModalFrame} from './components/modal-frame.js';
import {renderPaymentResult} from './components/payment-result.js';
import {renderMilestoneDraft} from './components/project-milestones.js';
import {renderCreatorRewardDeliveries,renderRewardDeliveryForm,renderSupportRewardDelivery} from './components/reward-deliveries.js';
import {avatarContent} from './components/avatar.js';
import {renderAuthentication} from './components/authentication.js';
import { createApiPlatform } from './services/api.js';
import { actors, categories } from './domain/catalog.js';
import { buildRevenueReport } from './domain/revenue-report.js';
import { renderRevenueChart } from './components/revenue-chart.js';
import { renderProjectDetail } from './components/project-detail.js';
import { renderCampaignForm, renderRewardDraft, renderCreatorProfileForm, renderProfilePhotoEditor, renderProfileLinkDraft, renderProjectPostForm, renderCampaignSettingsForm, renderModerationForm, renderAccountPunishmentForm, renderProjectImageEditor } from './components/project-forms.js';
import { projectImage } from './components/project-image.js';
import {renderCampaignCard,renderDiscoveryHero} from './components/discovery.js';
import { canUseSupportPayments, renderSupportBadge, renderSupportHistoryStatus } from './components/support-history.js';
import { normalizeSearch, searchCreators } from './domain/creator-search.js';
import { renderCreatorSearchResults, renderCreatorProfile } from './components/creator-profile.js';
import { renderAdminWorkspace, renderCreatorInbox } from './components/admin-workspace.js';
import { renderBlockedAccount, restrictionDeadline } from './components/account-access.js';
import { punishmentExpiry } from './domain/punishment-duration.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const brl = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
const number = value => new Intl.NumberFormat('pt-BR').format(value || 0);
const date = value => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
const percent = campaign => Math.round(campaign.raisedCents / campaign.goalCents * 100);
const key = () => crypto.randomUUID();
let platform = null, authMode='login', avatarPreviewUrl=null, projectImagePreviewUrl=null;
function clearAvatarPreview(){if(avatarPreviewUrl){URL.revokeObjectURL(avatarPreviewUrl);avatarPreviewUrl=null;}}
function clearProjectImagePreview() {
  if (projectImagePreviewUrl) URL.revokeObjectURL(projectImagePreviewUrl);
  projectImagePreviewUrl = null;
}
const mobileQuery = matchMedia('(max-width: 760px)');
let pendingAction = false, renewalFlow = null, moderationTimer = null, editingCreatorId = null;
let revenueDays = 7, revenueCampaignId = '', revenueReport = null;
const projectTabs = new Map();
let rewardDraftSequence = 0, profileLinkSequence = 0, milestoneDraftSequence = 0;
let searchScope='all',adminTab='projetos',adminSelectedAccountId='',adminSelectedCreatorId='',adminAuditEntries=null,moderationFlow=null;
const adminStatusFilters={projects:'todos',accounts:'todos',comments:'todos'};
let category = 'Todos os projetos', search = '', sort = 'featured', supportFilter = 'Todos', menuOpen = false, diagnostics = null, supportFlow = null, modalTrigger = null;
const icons = {
  link: '<rect x="3" y="8" width="12" height="8" rx="4" transform="rotate(-40 9 12)"/><rect x="9" y="8" width="12" height="8" rx="4" transform="rotate(-40 15 12)"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  heart: '<path d="M20.8 4.8a5.4 5.4 0 0 0-7.6 0L12 6l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  wallet: '<path d="M20 8H5a2 2 0 0 1-2-2v13a2 2 0 0 0 2 2h15V8ZM3 6V5a2 2 0 0 1 2-2h13v5"/><path d="M16 12h5v5h-5a2.5 2.5 0 0 1 0-5Z"/>',
  flask: '<path d="M9 3h6M10 3v7l-6 9a1.5 1.5 0 0 0 1.3 2h13.4A1.5 1.5 0 0 0 20 19l-6-9V3M7 15h10"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 14.3A8.8 8.8 0 0 1 9.7 4a8.8 8.8 0 1 0 10.3 10.3Z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrowRight: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5v1"/>',
  sprout: '<path d="M12 21v-9M12 14C5 15 3 9 4 5c5 0 9 3 8 9ZM12 17c0-6 3-10 9-10 0 6-3 10-9 10Z"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  repeat: '<path d="M4 8h14l-3-3M20 16H6l3 3M20 8v3M4 16v-3"/>',
  receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2ZM9 8h6M9 12h6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  location: '<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  warning: '<path d="M10.3 4a2 2 0 0 1 3.4 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.7-3ZM12 9v5M12 17h.01"/>',
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name] || icons.sparkle}</svg>`;
const btn = (label, action, extra = '', style = '') => `<button type="button" class="btn ${style}" data-action="${action}" ${extra}>${label}</button>`;
const currentRoute = () => { const [page = 'explorar', id] = location.hash.slice(1).split('/'); return { page: page || 'explorar', id }; };
const routeLabels = { explorar: 'Descobrir projetos', apoios: 'Meus apoios', salvos: 'Projetos salvos', criador: 'Meu estúdio', financeiro: 'Financeiro', laboratorio: 'Laboratório', sobre: 'Como funciona', projeto: 'Detalhes do projeto', perfil:'Perfil', administracao:'Administração', mensagens:'Mensagens' };
const remoteActions = new Set(['save', 'choose-persona', 'switch-actor', 'support-as-ana', 'resolve-pending', 'confirm-cancel', 'confirm-renew', 'confirm-payout', 'diagnostics', 'confirm-reset', 'refresh-state','remove-profile-photo','upload-project-image','remove-project-image','export','acknowledge-reward']);
const restrictedActions=new Set(['save','support','pending-confirm','pending-fail','resolve-pending','renew-subscription','confirm-renew','payout','confirm-payout','new-campaign','edit-creator-profile','create-project-update','create-project-comment','project-settings','moderate-project','reset','confirm-reset','remove-profile-photo','upload-project-image','remove-project-image','edit-reward-delivery','acknowledge-reward']);

function scheduleModerationRefresh() {
  clearTimeout(moderationTimer);
  const state=platform.getState(),records=[platform.getActor(),...(state.accounts||[])];
  const deadlines=records.filter(a=>a.restricted&&a.moderationExpiresAt).map(a=>Date.parse(a.moderationExpiresAt)).filter(value=>Number.isFinite(value)&&value>Date.now());
  if(!deadlines.length)return;
  moderationTimer=setTimeout(refreshTimedModeration,Math.min(2147483647,Math.max(100,Math.min(...deadlines)-Date.now()+250)));
}
async function refreshTimedModeration(){try{await platform.refresh();render();}catch{moderationTimer=setTimeout(refreshTimedModeration,30000);}}
function applyAccountRestrictions() {
  if(!platform.getActor().restricted)return;
  document.querySelectorAll('#page [data-action]').forEach(element=>{if(restrictedActions.has(element.dataset.action)){element.disabled=true;element.title='Ação indisponível durante a suspensão da conta.';}});
}
async function refreshRestriction(error) {
  if(!['ACCOUNT_BANNED','ACCOUNT_SUSPENDED','SESSION_REQUIRED'].includes(error.code))return;
  try{await platform.refresh();closeModal();render();}catch{}
}

async function initializeApp() {
  $('#app').innerHTML = '<div class="initial-load" role="status">Carregando sua conta…</div>';
  try {
    platform = await createApiPlatform();
    render();
  } catch (error) {
    platform = null;
    $('#app').innerHTML = `<main id="main" class="content" tabindex="-1"><div class="empty-state">${icon('warning')}<h1 style="font-size:1.6rem">Vamos reconectar seu cenário?</h1><p>${esc(error.message)}</p>${btn('Tentar novamente', 'retry-api')}<p class="form-hint" style="margin-top:20px">A demonstração precisa da aplicação e do banco em execução. Nenhuma operação será registrada enquanto a API estiver indisponível.</p></div></main>`;
  }
}

function toast(message, error = false) {
  const item = document.createElement('div'); item.className = `toast${error ? ' error' : ''}`;
  item.innerHTML = `${icon(error ? 'warning' : 'circleCheck')}<span>${esc(message)}</span>`;
  $('#toasts').append(item); $('#announcer').textContent = message;
  setTimeout(() => item.remove(), 5500);
}
function navigate(page) { menuOpen = false; if (location.hash === `#${page}`) { render(); window.scrollTo({top:0,behavior:'instant'}); $('#main').focus({preventScroll:true}); } else location.hash = page; }
function setMenuOpen(open) {
  menuOpen = open && mobileQuery.matches;
  render();
  if (!menuOpen) $('.mobile-menu')?.focus({preventScroll:true});
}
function render() {
  if (!platform) return;
  const actor = platform.getActor(), state = platform.getState(), route = currentRoute();
  const activeRoute=route.page+(route.id?'/'+route.id:'');
  if (state.auth?.enabled && !state.auth.authenticated || state.accessBlocked || actor.banned) menuOpen = false;
  const drawerOpen = mobileQuery.matches && menuOpen;
  $('.skip-link').inert = drawerOpen;
  if(state.auth?.enabled&&!state.auth.authenticated){clearTimeout(moderationTimer);$('#app').innerHTML=renderAuthentication(authMode);return;}
  scheduleModerationRefresh();
  if(state.accessBlocked||actor.banned){$('#app').innerHTML=renderBlockedAccount(actor).replace('data-action="personas">Trocar perfil','data-action="'+(state.auth?.enabled?'auth-logout':'personas')+'">'+(state.auth?.enabled?'Sair da conta':'Trocar perfil'));return;}
  const nav = (page, label, glyph, count = '') => `<button class="nav-item ${activeRoute === page ? 'active' : ''}" data-action="navigate" data-page="${page}" ${activeRoute === page ? 'aria-current="page"' : ''}>${icon(glyph)}<span class="nav-label">${label}</span>${count ? `<span class="nav-count">${count}</span>` : ''}</button>`;
  $('#app').innerHTML = `<div class="shell ${drawerOpen ? 'menu-open' : ''}">
    <div class="mobile-overlay" data-action="menu" aria-hidden="true"></div>
    <aside id="main-sidebar" class="sidebar" aria-label="Navegação principal" ${drawerOpen ? 'role="dialog" aria-modal="true"' : mobileQuery.matches ? 'inert aria-hidden="true"' : ''}>
      <button type="button" class="icon-button drawer-close" data-action="menu" aria-label="Fechar menu">${icon('close')}</button>
      <button class="brand" data-action="navigate" data-page="explorar" aria-label="Elo, início"><span class="brand-icon">${icon('link')}</span><span class="brand-name">elo<span style="color:var(--accent)">.</span></span></button>
      <p class="brand-subtitle">Financiamento coletivo.</p>
      <nav>${nav('explorar', 'Descobrir projetos', 'compass')}${['creator','supporter'].includes(actor.role)?nav('apoios','Meus apoios','heart'):''}${nav('salvos', 'Projetos salvos', 'bookmark', state.savedCampaignIds.length || '')}
      ${['creator','supporter'].includes(actor.role)?`<div class="nav-section">Meu espaço</div>${nav(`perfil/${actor.id}`,'Meu perfil','people')}`:''}
      ${actor.role==='creator'?`<div class="nav-section">Espaço do criador</div>${nav('criador','Meu estúdio','grid')}${nav('financeiro','Financeiro','wallet')}${nav('mensagens','Mensagens','people')}`:''}${actor.role==='admin'?`<div class="nav-section">Gestão da plataforma</div>${nav('administracao','Administração','shield')}`:''}</nav>
      <div class="sidebar-spacer"></div>
      <nav aria-label="Ajuda e demonstração">${state.auth?.enabled?'':nav('laboratorio', 'Laboratório', 'flask')}${nav('sobre', 'Como funciona', 'help')}</nav>
    </aside>
    <div class="workspace" ${drawerOpen ? 'inert' : ''}><header class="topbar">
      <button class="icon-button mobile-menu" data-action="menu" aria-label="Abrir menu" aria-controls="main-sidebar" aria-expanded="${drawerOpen}">${icon('menu')}</button>
      <div class="breadcrumb"><span>Elo</span>${icon('chevron')}<strong>${routeLabels[route.page] || 'Descobrir'}</strong></div>
      <div class="topbar-search"><label class="sr-only" for="global-search">Buscar projetos ou criadores</label>${icon('search')}<input id="global-search" type="search" placeholder="Buscar projetos ou criadores" autocomplete="off" maxlength="100" value="${esc(search)}"></div>
      <button class="icon-button" data-action="theme" aria-label="${document.documentElement.dataset.theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo noturno'}" title="Alternar tema">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
      <button class="profile-button" data-action="personas" aria-label="${state.auth?.enabled?'Conta de':'Trocar perfil, atual'} ${esc(actor.name)}"><span class="avatar">${avatarContent(actor)}</span><span class="profile-meta">${esc(actor.firstName)}<small>${esc(actor.roleLabel)}</small></span></button>
    </header>
    <main id="main" class="content" tabindex="-1">${actor.suspended?`<div class="account-ban-banner" role="status"><strong>Conta suspensa.</strong> Você pode navegar e ler. Publicações, apoios e edições estão bloqueados. ${esc(restrictionDeadline(actor))}${actor.moderationReason?` Motivo: ${esc(actor.moderationReason)}`:''}</div>`:''}<div id="page"></div>
    <footer class="page-footer"><span>© 2026 Elo · Financiamento coletivo</span><button class="demo-disclosure" data-action="demo-info">Protótipo acadêmico · pagamentos simulados</button></footer></main></div></div>`;
  renderPage();
  if (drawerOpen) $('.drawer-close').focus({preventScroll:true});
}
function campaignCard(campaign) {
  return renderCampaignCard(campaign,{saved:platform.getState().savedCampaignIds.includes(campaign.id),icon});
}
function renderPage() {
  const { page, id } = currentRoute(), target = $('#page');
  try {
    if (page === 'projeto') { target.innerHTML = projectPage(platform.getCampaign(id)); return; }
    if(page==='perfil'){target.innerHTML=creatorProfilePage(id);return;}
    if(page==='administracao'){target.innerHTML=administrationPage();return;}
    if(page==='mensagens'){target.innerHTML=messagesPage();return;}
    if (page === 'apoios') { target.innerHTML = supportsPage(); return; }
    if (page === 'criador') { target.innerHTML = creatorPage(); return; }
    if (page === 'financeiro') { target.innerHTML = financePage(); return; }
    if (page === 'laboratorio') { target.innerHTML = platform.getState().auth?.enabled?aboutPage():laboratoryPage(); return; }
    if (page === 'sobre') { target.innerHTML = aboutPage(); return; }
    target.innerHTML = explorePage(page === 'salvos');
  } catch (error) { target.innerHTML = empty('help', 'Conteúdo indisponível', 'Volte para as descobertas para continuar.', 'Descobrir projetos', 'explorar'); }
  finally { applyAccountRestrictions(); }
}
function explorePage(savedOnly=false) {
  const state=platform.getState(),query=normalizeSearch(search),all=visibleCampaigns();
  let projects=all.filter(c=>!savedOnly||state.savedCampaignIds.includes(c.id));
  projects=projects.filter(c=>(category==='Todos os projetos'||c.category===category)&&normalizeSearch(`${c.title} ${c.description} ${c.creator} ${c.category} ${c.location||''}`).includes(query));
  if(sort==='ending')projects.sort((a,b)=>a.daysLeft-b.daysLeft);else if(sort==='funded')projects.sort((a,b)=>percent(b)-percent(a));else projects.sort((a,b)=>Number(b.featured)-Number(a.featured));
  const creators=searchCreators({...state,campaigns:all,query:search}),showCreators=Boolean(query&&!savedOnly&&searchScope!=='projects'),showProjects=savedOnly||!query||searchScope!=='creators',featured=all.find(c=>c.featured)||all[0];
  const heading=savedOnly?'<div class="page-intro"><div><h1>Projetos salvos</h1><p>Consulte sua seleção de projetos.</p></div></div>':query?`<header class="search-page-heading"><h1>Resultados para “${esc(search.trim())}”</h1><p>Encontre projetos e perfis de criadores.</p><div class="search-scope" role="group" aria-label="Tipo de resultado">${[['all','Tudo'],['projects','Projetos'],['creators','Criadores']].map(([value,label])=>`<button class="chip ${searchScope===value?'active':''}" type="button" data-action="search-scope" data-value="${value}" aria-pressed="${searchScope===value}">${label}</button>`).join('')}</div></header>`:renderDiscoveryHero(featured,{icon});
  return `${heading}${showCreators?renderCreatorSearchResults(creators):''}${showProjects?`<section id="projects" aria-labelledby="projects-title"><div class="section-heading"><div><h2 id="projects-title">${savedOnly?'Sua lista':query?'Projetos encontrados':'Projetos em financiamento'}</h2><p>Compare metas, prazos e formas de apoio.</p></div><div class="discovery-tools"><span class="muted" aria-live="polite">${projects.length} projeto${projects.length===1?'':'s'}</span><label class="sr-only" for="sort">Ordenar projetos</label><select id="sort" class="sort-control"><option value="featured" ${sort==='featured'?'selected':''}>Em destaque</option><option value="ending" ${sort==='ending'?'selected':''}>Prazo mais próximo</option><option value="funded" ${sort==='funded'?'selected':''}>Mais financiados</option></select></div></div><div class="filter-row"><div class="category-list" role="group" aria-label="Filtrar por categoria">${['Todos os projetos',...categories].map(c=>`<button class="chip ${category===c?'active':''}" data-action="category" data-value="${esc(c)}" aria-pressed="${category===c}">${esc(c==='Todos os projetos'?'Todos':c)}</button>`).join('')}</div></div>${projects.length?`<div class="campaign-grid">${projects.map(campaignCard).join('')}</div>`:empty('search','Nenhum projeto corresponde aos filtros.','Escolha outra categoria ou faça uma nova busca.','Limpar filtros','clear-filters',true)}</section>`:''}`;
}
function visibleCampaigns() {
  const state=platform.getState(),banned=new Set((state.accounts||[]).filter(a=>a.banned).map(a=>a.id));
  return state.campaigns.filter(c=>!c.deletedAt&&!banned.has(c.creatorId));
}
function creatorProfilePage(id) {
  const state=platform.getState(),actor=platform.getActor(),account=(state.accounts||[]).find(a=>a.id===id);
  if(!account||(account.banned&&actor.role!=='admin'))return empty('people','Perfil indisponível','Este perfil não está disponível para consulta pública.','Voltar para projetos','explorar');
  const profile=(state.creatorProfiles||[]).find(p=>p.creatorId===id)||{};
  const projects=(actor.role==='admin'?state.campaigns:visibleCampaigns()).filter(c=>c.creatorId===id);
  const person={...account,bio:profile.bio||'',links:profile.links||[],location:profile.location??null,joinedAt:profile.joinedAt||account.joinedAt,projectCount:projects.length};
  return renderCreatorProfile(person,{campaignMarkup:projects.map(campaignCard).join(''),canEdit:['creator','supporter'].includes(actor.role)&&actor.id===id&&!actor.restricted,actor,account});
}
function administrationPage() {
  if(platform.getActor().role!=='admin')return roleGate('admin1','Administração','Use o perfil de administrador para acessar a gestão da plataforma.');
  return renderAdminWorkspace({state:platform.getState(),selectedAccountId:adminSelectedAccountId,selectedCreatorId:adminSelectedCreatorId,activeTab:adminTab,statusFilters:adminStatusFilters,...(adminAuditEntries===null?{}:{auditEntries:adminAuditEntries})});
}
function messagesPage() {
  if(platform.getActor().role!=='creator')return roleGate('creator1','Mensagens do criador','Use o perfil de criador para conversar com a administração.');
  return renderCreatorInbox({state:platform.getState(),creatorId:platform.getActor().id});
}
function empty(glyph, title, description, label, destination, action = false) { return `<div class="empty-state">${icon(glyph)}<h2>${title}</h2><p>${description}</p>${btn(label, action ? destination : 'navigate', action ? '' : `data-page="${destination}"`)}</div>`; }
function projectPage(c) {
  const state = platform.getState(), actor = platform.getActor();
  const profile = {...(state.creatorProfiles || []).find(p => p.creatorId === c.creatorId),avatarUrl:(state.accounts||[]).find(a=>a.id===c.creatorId)?.avatarUrl};
  const creatorAccount=(state.accounts||[]).find(a=>a.id===c.creatorId);
  return renderProjectDetail({campaign:{...c,creatorBanned:creatorAccount?.banned,creatorRestricted:creatorAccount?.restricted},creatorAccount,accounts:state.accounts||[],profile,projectCount:state.campaigns.filter(p=>p.creatorId === c.creatorId).length,updates:(state.projectUpdates||[]).filter(p=>p.campaignId===c.id),comments:(state.projectComments||[]).filter(p=>p.campaignId===c.id),actor,selectedTab:projectTabs.get(c.id)||'sobre',saved:state.savedCampaignIds.includes(c.id)});
}
function supportContext(support, state = platform.getState(), actor = platform.getActor()) {
  const campaign = state.campaigns.find(item => item.id === support.campaignId);
  const creator = (state.accounts || []).find(account => account.id === (campaign?.creatorId || support.creatorId));
  return {support,campaign,actor,creator};
}
function assertSupportPaymentAvailable(id) {
  const state = platform.getState(), actor = platform.getActor();
  const support = state.contributions.find(item => item.id === id && item.supporterId === actor.id);
  if (!support || !canUseSupportPayments(supportContext(support,state,actor))) {
    throw new Error('Este apoio está indisponível para uma nova cobrança ou confirmação.');
  }
  return support;
}
function stat(label, value, hint, glyph) { return `<div class="stat-card"><div class="stat-label">${icon(glyph)}${label}</div><strong>${value}</strong><small>${hint}</small></div>`; }
function supportsPage() {
  const actor = platform.getActor(), summary = platform.getSummary();
  if (!['creator','supporter'].includes(actor.role)) return roleGate('supporter1', 'Um espaço para quem acredita.', 'Acompanhe apoios e assinaturas com a personagem apoiadora.');
  const state = platform.getState();
  const supports = state.contributions.filter(c => c.supporterId === actor.id).filter(c => supportFilter === 'Todos' || (supportFilter === 'Mensais' ? c.mode === 'monthly' : c.status === 'pending'));
  return `<div class="page-intro"><div><p class="eyebrow">Apoios e assinaturas</p><h1>Meus apoios</h1><p>Acompanhe pagamentos, cobranças mensais e assinaturas.</p></div>${btn(`${icon('download')}Exportar meus dados`, 'export', '', 'secondary small')}</div><div class="stats-grid">${stat('Total apoiado', brl(summary.netSupportedCents ?? summary.totalSupportedCents), summary.totalRefundedCents ? `${brl(summary.totalRefundedCents)} devolvidos` : 'Pagamentos confirmados', 'heart')}${stat('Apoios mensais', number(summary.activeSubscriptions), `${brl(summary.monthlyTotalCents)} por mês`, 'repeat')}${stat('Aguardando confirmação', number(summary.pendingCount), 'Pagamentos em processamento', 'clock')}</div><div class="section-heading"><h2>Histórico de apoios</h2><div class="category-list" role="group" aria-label="Filtrar apoios">${['Todos','Mensais','Pendentes'].map(f => `<button class="chip ${supportFilter === f ? 'active' : ''}" data-action="support-filter" data-value="${f}" aria-pressed="${supportFilter === f}">${f}</button>`).join('')}</div></div><div class="support-list">${supports.length ? supports.map(c => `<article class="support-row"><img class="support-image" src="${projectImage(c.campaignImage)}" alt="" width="120" height="100"><div class="support-info"><h3>${esc(c.campaignTitle)}</h3><p>${date(c.createdAt)} · ${c.isRenewal ? `Cobrança mensal · ciclo ${c.billingCycle || ''}` : c.mode === 'monthly' ? 'Apoio mensal' : 'Apoio único'}</p>${renderSupportHistoryStatus({...supportContext(c,state,actor),icon})}${renderSupportRewardDelivery({...supportContext(c,state,actor),delivery:(state.rewardDeliveries||[]).find(d=>d.contributionId===c.id)})}</div><div class="support-amount"><strong>${brl(c.amountCents)}</strong><small>${c.isRenewal ? 'cobrança mensal' : c.mode === 'monthly' ? 'por mês' : 'apoio único'}</small></div></article>`).join('') : empty('heart','Cada apoio começa com uma conexão.','Explore projetos e encontre uma ideia para acreditar.','Descobrir projetos','explorar')}</div>`;
}
function roleGate(actorId, title, description) {
  if(platform.getState().auth?.enabled)return empty('lock','Área indisponível para este tipo de conta','Você pode continuar explorando os projetos.','Descobrir projetos','explorar');
  const actor = actors.find(a => a.id === actorId);
  return `<div class="page-intro"><div><h1>${title}</h1><p>${description}</p></div></div><div class="empty-state">${icon(actor.role === 'supporter' ? 'heart' : 'grid')}<h2>Selecione o perfil indicado</h2><p>Troque para ${esc(actor.name)}, perfil ${actor.role === 'supporter' ? 'de apoiador' : 'de criador'}. </p>${btn(`Usar perfil de ${esc(actor.firstName)}`, 'switch-actor', `data-id="${actor.id}"`)}</div>`;
}
function creatorPage() {
  const actor = platform.getActor(), summary = platform.getSummary();
  if (actor.role !== 'creator') return roleGate('creator1', 'Toda grande ideia tem um começo.', 'Crie, acompanhe e compartilhe seus próximos projetos.');
  const projects = platform.listCampaigns().filter(c => c.creatorId === actor.id);
  return `<div class="page-intro"><div><p class="eyebrow">Espaço do criador</p><h1>Painel de projetos</h1><p>Gerencie suas campanhas e acompanhe a arrecadação.</p></div><div class="creator-page-actions">${btn('Editar perfil','edit-creator-profile','','secondary')}${btn(`${icon('plus')}Criar projeto`, 'new-campaign')}</div></div><div class="stats-grid">${stat('Arrecadação dos projetos',brl(summary.totalRaisedCents),'Total arrecadado nas campanhas','sprout')}${stat('Projetos ativos',number(summary.activeCampaigns),'Campanhas em andamento','grid')}${stat('Saldo disponível',brl(summary.availableBalanceCents),'Disponível para repasse','wallet')}</div><div class="section-heading"><div><h2>Seus projetos</h2><p>Consulte o desempenho e os detalhes de cada campanha.</p></div><button class="text-button" data-action="navigate" data-page="financeiro">Ver financeiro</button></div><div class="campaign-grid">${projects.map(campaignCard).join('')}</div>${renderCreatorRewardDeliveries({contributions:platform.getState().contributions,campaigns:projects,deliveries:platform.getState().rewardDeliveries||[],actor})}`;
}
function financePage() {
  const actor = platform.getActor(), summary = platform.getSummary();
  if (actor.role !== 'creator') return roleGate('creator1', 'Clareza em cada movimentação.', 'Acompanhe os valores e repasses da personagem criadora.');
  const state = platform.getState(), entries = platform.getLedger();
  const projects = state.campaigns.filter(c => c.creatorId === actor.id);
  if (revenueCampaignId && !projects.some(c => c.id === revenueCampaignId)) revenueCampaignId = '';
  revenueReport = buildRevenueReport({ ledger: entries, contributions: state.contributions, campaigns: projects, creatorId: actor.id, campaignId: revenueCampaignId || null, days: revenueDays });
  const report = revenueReport;
  const selectedTitle = projects.find(c => c.id === revenueCampaignId)?.title || 'Todos os meus projetos';
  const periodLabel = `${report.points[0].label} a ${report.points.at(-1).label}`;
  const financeDate = value => new Intl.DateTimeFormat('pt-BR', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(value));
  return `<div class="page-intro"><div><p class="eyebrow">Financeiro</p><h1>Visão financeira</h1><p>Consulte entradas confirmadas, saldo disponível e repasses.</p></div>${btn(`${icon('download')}Exportar período`, 'export-revenue', '', 'secondary small')}</div>
    <div class="stats-grid">${stat('Saldo disponível',brl(summary.availableBalanceCents),'Saldo geral da conta','wallet')}${stat('Repasses realizados',brl(summary.totalPayoutCents),'Total geral de repasses','check')}${stat('Apoios recebidos (líquido)',brl(summary.netReceivedCents ?? summary.totalReceivedCents),summary.totalRefundedByCreatorCents ? `${brl(summary.totalRefundedByCreatorCents)} devolvidos` : 'Apoios confirmados','heart')}</div>
    <section class="panel revenue-panel" aria-labelledby="revenue-title">
      <div class="revenue-heading"><div><h2 id="revenue-title">Arrecadação no período</h2><p>Apoios confirmados por dia (valor bruto).</p></div><button class="text-button revenue-refresh" data-action="refresh-state">${icon('reset')}Atualizar dados</button></div>
      <div class="revenue-controls"><div class="revenue-project-control"><label for="revenue-project">Projeto</label><select id="revenue-project"><option value="">Todos os meus projetos</option>${projects.map(c=>`<option value="${esc(c.id)}" ${c.id === revenueCampaignId ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></div><fieldset class="revenue-period-control"><legend>Período</legend><div class="segmented" role="group" aria-label="Período da arrecadação">${[7,30].map(days=>`<button type="button" class="${revenueDays === days ? 'selected' : ''}" data-action="revenue-range" data-days="${days}" aria-pressed="${revenueDays === days}">Últimos ${days} dias</button>`).join('')}</div></fieldset></div>
      <div class="revenue-summary"><div><strong>${brl(report.totalCents)}</strong><span>${report.paymentCount} pagamento${report.paymentCount === 1 ? '' : 's'} confirmado${report.paymentCount === 1 ? '' : 's'}</span></div><p>${periodLabel}<span>Horário de Brasília</span></p></div>
      ${renderRevenueChart(report)}
      <dl class="revenue-refund-totals"><div><dt>Devoluções no período</dt><dd>${brl(report.refundedCents)}</dd></div><div><dt>Arrecadação líquida no período</dt><dd>${brl(report.netCents ?? report.totalCents)}</dd></div></dl>
      <p class="revenue-note">As devoluções entram no dia em que ocorreram. Consulte saldo inicial, devoluções e repasses no extrato completo.</p>
    </section>
    <div class="two-columns revenue-bottom-layout"><section class="panel revenue-ledger"><div class="panel-heading"><div><h2>Apoios que compõem o gráfico</h2><p class="revenue-ledger-subtitle">${esc(selectedTitle)} · ${periodLabel}</p></div></div>
      ${report.entries.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Apoios confirmados no período"><table><thead><tr><th>Projeto</th><th>Confirmação</th><th>Valor</th></tr></thead><tbody>${report.entries.map(l=>`<tr><td>${esc(l.campaignTitle)}<span class="table-sub">${esc(l.contributionId)}</span></td><td>${financeDate(l.createdAt)}</td><td class="revenue-entry-amount">${brl(l.amountCents)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row" colspan="2">Total no período</th><td class="revenue-entry-amount">${brl(report.totalCents)}</td></tr></tfoot></table></div>` : '<p class="revenue-table-empty">Nenhum apoio confirmado corresponde a este projeto e período. As próximas entradas aparecerão aqui.</p>'}
      <details class="wallet-history"><summary>Ver extrato completo da conta</summary><p>Inclui saldo inicial, entradas e repasses de todos os projetos. Este extrato geral não é alterado pelos filtros do gráfico.</p>${entries.length ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Extrato completo da conta"><table><thead><tr><th>Movimentação</th><th>Data</th><th>Valor</th></tr></thead><tbody>${entries.map(l=>`<tr><td>${esc(l.description)}<span class="table-sub">${esc(l.id)}</span></td><td>${financeDate(l.createdAt)}</td><td style="color:${l.direction === 'in' ? 'var(--accent)' : 'var(--text)'};font-weight:600">${l.direction === 'in' ? '+' : '−'} ${brl(l.amountCents)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhuma movimentação registrada.</p>'}</details>
    </section><aside><div class="panel"><div class="panel-heading"><h2>Repasse de saldo</h2></div><p class="muted" style="font-size:.87rem;margin-bottom:20px">Solicite um repasse do saldo disponível da sua conta.</p>${btn('Solicitar repasse','payout',summary.availableBalanceCents <= 0 ? 'disabled' : '', 'full')}<p class="form-hint" style="margin-top:13px">Destino: ${esc(payoutDestination(actor))}<br>Taxa: R$ 0,00.</p></div><div class="notice" style="margin-top:18px">${icon('info')}<div>O saldo disponível pertence à sua conta. O filtro por projeto mostra a arrecadação, sem separar o saldo para repasses.</div></div></aside></div>`;
}
function laboratoryPage() {
  const actor = platform.getActor(), state = platform.getState();
  return `<div class="page-intro"><div><p class="eyebrow">Por dentro da demonstração</p><h1>Pequenas regras. Grandes cuidados.</h1><p>Explore como as regras do protótipo se comportam em situações de erro.</p></div>${btn(`${icon('shield')}Verificar regras`, 'diagnostics')}</div><div class="notice warning">${icon('info')}<div><strong>Este é um laboratório acadêmico.</strong> A API executa as regras e o PostgreSQL persiste o cenário. As verificações abaixo exercitam regras de domínio em uma cópia isolada; não substituem testes de integração ou uma auditoria de segurança. A escolha de personagens é demonstrativa, sem identidade real.</div></div><div class="two-columns" style="margin-top:25px"><section class="panel"><div class="panel-heading"><h2>Verificações do domínio</h2>${diagnostics ? `<span class="badge">${diagnostics.filter(c => c.passed).length}/${diagnostics.length} verificações</span>` : '<span class="badge neutral">Pronto para verificar</span>'}</div>${diagnostics ? diagnostics.map(c => `<div class="diagnostic">${icon(c.passed ? 'circleCheck' : 'warning')}<div><strong>${esc(c.name)}</strong><p>${esc(c.detail)}</p></div></div>`).join('') : `<p class="muted" style="font-size:.9rem">Execute as verificações para observar permissões por personagem, valores inválidos, confirmação duplicada e proteção do saldo. Os testes utilizam uma cópia isolada, sem alterar seus apoios.</p>`}</section><aside class="panel"><h2 style="font-size:1.1rem;margin-bottom:22px">O que acontece com seus dados?</h2><div class="info-list"><div class="info-item">${icon('flask')}<div><strong>Somente cenários fictícios</strong><p>Sem cartões, senhas, documentos ou contas bancárias reais.</p></div></div><div class="info-item">${icon('lock')}<div><strong>Cenário salvo no PostgreSQL</strong><p>A API guarda os dados fictícios no banco. Um cookie identifica seu cenário neste navegador. Você pode reiniciá-lo quando quiser.</p></div></div><div class="info-item">${icon('people')}<div><strong>Personagens de demonstração</strong><p>Trocar perfis serve para explorar responsabilidades. Não é um sistema de login.</p></div></div></div>${btn('Reiniciar demonstração','reset','', 'ghost full')}<div class="source-links"><a href="https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Payment_Gateway_Integration_Cheat_Sheet.html" target="_blank" rel="noopener noreferrer">Referência OWASP</a></div></aside></div><section class="panel" style="margin-top:24px"><div class="panel-heading"><h2>Trilha de eventos fictícios</h2>${actor.role !== 'admin' ? btn('Usar personagem administradora','switch-actor','data-id="admin1"','secondary small') : '<span class="badge neutral">Personagem administradora</span>'}</div>${actor.role === 'admin' ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Trilha de auditoria"><table><thead><tr><th>Evento</th><th>Personagem</th><th>Data</th></tr></thead><tbody>${platform.audit().slice(0,20).map(a => `<tr><td>${esc(a.description)}<span class="table-sub">${esc(a.action)} · ${esc(a.resourceId)}</span></td><td>${esc(actors.find(p=>p.id===a.actorId)?.firstName || 'Sistema')}</td><td>${date(a.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted" style="font-size:.87rem">A trilha completa é apresentada à personagem administradora para demonstrar a divisão de permissões.</p>'}</section>`;
}
function aboutPage() {
  return `<div class="page-intro"><div><p class="eyebrow">Guia da plataforma</p><h1>Como funciona o Elo</h1><p>Consulte as formas de apoio e os recursos da plataforma.</p></div></div><div class="about-grid"><article class="about-card">${icon('compass')}<h2>Encontre um projeto</h2><p>Explore projetos por categoria, conheça sua história e acompanhe quanto já foi arrecadado para a meta.</p></article><article class="about-card">${icon('heart')}<h2>Escolha como apoiar</h2><p>Faça um apoio pontual ou mensal. Revise o valor antes de confirmar seu pagamento.</p></article><article class="about-card">${icon('sprout')}<h2>Acompanhe seus apoios</h2><p>Acompanhe seus apoios e assinaturas. Na área do criador, veja as contribuições e solicite um repasse.</p></article></div><div class="panel" style="margin-top:25px"><h2>Navegação e privacidade</h2><p class="story">Navegação consistente, informações essenciais em primeiro lugar e revisão antes de confirmar. Você escolhe entre os modos claro e noturno, com a mesma organização em ambos.</p><div class="source-links"><a href="https://www.nngroup.com/articles/ten-usability-heuristics/" target="_blank" rel="noopener noreferrer">Heurísticas de Nielsen</a><a href="https://www.w3.org/WAI/WCAG22/Understanding/" target="_blank" rel="noopener noreferrer">Diretrizes WCAG 2.2</a></div></div><div class="notice" style="margin-top:22px">${icon('info')}<div>Os apoios mensais registram uma primeira cobrança. Em Meus apoios, use “Gerar próxima cobrança” para gerar outra cobrança e experimentar sua confirmação ou recusa. O cancelamento bloqueia novas cobranças. Não há agendamento automático. Metas e prazos são dados de cenário; não há encerramento ou reembolso automático por meta.</div></div>`;
}

const modal = $('#modal');
function showModal(title, subtitle, body) {
  if (!modal.open) modalTrigger = document.activeElement;
  clearAvatarPreview();
  clearProjectImagePreview();
  modal.innerHTML = renderModalFrame({title,subtitle,body,closeIcon:icon('close')});
  if (!modal.open) modal.showModal();
  $('#modal-title').focus();
}
function closeModal() {
  if (!modal.open) return;
  clearAvatarPreview();
  clearProjectImagePreview();
  moderationFlow = null;
  modal.close();
}
modal.addEventListener('cancel', event => {
  event.preventDefault();
  if (!pendingAction) closeModal();
});
modal.addEventListener('close', () => {
  if (modal.open) return;
  if (modalTrigger?.isConnected) modalTrigger.focus();
  else if (document.activeElement === document.body) $('#main')?.focus({preventScroll:true});
});
function refreshProfilePhotoEditor() {
  clearAvatarPreview();const editor=$('#profile-photo-editor',modal);
  if(editor){const restoreFocus=editor.contains(document.activeElement);editor.outerHTML=renderProfilePhotoEditor(platform.getActor());if(modal.open&&restoreFocus)$('#profile-photo-file',modal)?.focus();}
}
function resetProjectImageEditor(form) {
  clearProjectImagePreview();
  const campaign = form.dataset.campaignId ? platform.getCampaign(form.dataset.campaignId) : null;
  form.querySelector('.project-image-editor').outerHTML = renderProjectImageEditor(campaign);
  $('#project-image-file',form).focus();
}
function validateProjectImage(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new Error('Escolha JPG, PNG ou WebP estático com até 5 MB.');
  }
}
function previewProjectImage(input) {
  const form = input.form, file = input.files[0];
  if (!file) {
    resetProjectImageEditor(form);
    return;
  }
  try {
    validateProjectImage(file);
    clearProjectImagePreview();
    projectImagePreviewUrl = URL.createObjectURL(file);
    const preview = $('#project-image-preview',form);
    preview.src = projectImagePreviewUrl;
    preview.alt = 'Prévia da nova capa';
    preview.hidden = false;
    $('[data-action="discard-project-image"]',form).hidden = false;
    const save = $('[data-action="upload-project-image"]',form);
    if (save) save.disabled = false;
    $('#project-image-error',form).textContent = '';
  } catch (error) {
    resetProjectImageEditor(form);
    formError('project-image-error',error);
  }
}
async function updateProjectImage(action, element) {
  const form = element.closest('#campaign-settings-form'), campaignId = form.dataset.campaignId;
  const input = $('#project-image-file',form), file = input.files[0];
  input.disabled = true;
  try {
    if (action === 'upload-project-image') {
      validateProjectImage(file);
      await platform.uploadCampaignImage(campaignId,file);
    } else {
      await platform.removeCampaignImage(campaignId);
    }
    if (modal.open && form.isConnected) resetProjectImageEditor(form);
    renderPage();
    toast(action === 'upload-project-image' ? 'Capa atualizada.' : 'Capa própria removida.');
  } catch (error) {
    formError('project-image-error',error);
  } finally {
    input.disabled = false;
  }
}
function showPersonas() {
  const active = platform.getActor();
  if(platform.getState().auth?.enabled){showModal('Sua conta',active.username||active.name,`<p>${esc(active.email)}</p><p class="form-hint">${esc(active.roleLabel)}</p><div class="modal-footer">${['creator','supporter'].includes(active.role)?btn('Meu perfil','modal-navigate',`data-page="perfil/${esc(active.id)}"`,'secondary'):''}${btn('Sair da conta','auth-logout')}</div>`);return;}
  showModal('Trocar perfil', 'Selecione o perfil que deseja explorar.', `${actors.map(a => `<button type="button" class="persona-option ${a.id === active.id ? 'selected' : ''}" data-action="choose-persona" data-id="${a.id}"><span class="avatar">${a.initials}</span><span><strong>${a.name}</strong><small>${a.roleLabel} · ${a.role === 'supporter' ? 'apoios e assinaturas' : a.role === 'creator' ? 'projetos e financeiro' : 'eventos e verificações'}</small></span>${a.id === active.id ? icon('circleCheck') : ''}</button>`).join('')}`);
}
function startSupport(campaignId, amountCents = 5000, mode = 'once', rewardId = null) {
  const c = platform.getCampaign(campaignId), reward = rewardId ? c.rewards.find(r=>r.id===rewardId) : null;
  if (rewardId && !reward) throw new Error('Esta recompensa não está disponível.');
  supportFlow = {campaignId,amountCents:reward?Math.max(amountCents,reward.amountCents):amountCents,mode:reward?(reward.monthly?'monthly':'once'):mode==='monthly'&&c.monthly?'monthly':'once',step:1,idempotencyKey:key(),...(reward?{rewardId:reward.id}:{})};
  if(platform.getState().auth?.enabled&&!['creator','supporter'].includes(platform.getActor().role))throw new Error('Use uma conta de apoiador para registrar apoios.');
  if (!['creator','supporter'].includes(platform.getActor().role)) {
    showModal('Selecione o perfil de apoiador', 'Continue como Ana para registrar o apoio.', `<p class="muted">Você está usando o perfil de ${esc(platform.getActor().firstName)}.</p><div class="modal-footer">${btn('Voltar','close-modal','','secondary')}${btn('Continuar como Ana','support-as-ana')}</div>`); return;
  }
  renderSupportModal();
}
function renderSupportModal() {
  const f = supportFlow, c = platform.getCampaign(f.campaignId), reward = c.rewards.find(r=>r.id===f.rewardId);
  const campaignLine = `<div class="modal-campaign"><img src="${projectImage(c.image)}" alt="" width="58" height="50"><div><strong>${esc(c.title)}</strong><small>por ${esc(c.creator)}</small></div></div>`;
  const rewardLine = reward ? `<div class="review-row"><span>Recompensa</span><strong>${esc(reward.title)}</strong></div>` : '';
  if (f.step === 1) {
    const amounts = [...new Set([...(reward?[reward.amountCents]:[]),2500,5000,10000,15000])].filter(a=>a>=(reward?.amountCents||500)).sort((a,b)=>a-b).slice(0,4);
    showModal('Apoiar projeto', 'Escolha o valor e revise seu apoio.', `<p class="step-label">Escolha seu apoio · etapa 1 de 2</p>${campaignLine}${rewardLine}<form id="support-form">${reward?`<p class="form-hint">${reward.monthly?'Apoio mensal':'Apoio único'} com recompensa. Valor mínimo: ${brl(reward.amountCents)}.</p>`:`<fieldset><legend>Como você quer apoiar?</legend><div class="segmented"><button type="button" class="${f.mode==='once'?'selected':''}" data-action="support-mode" data-mode="once" aria-pressed="${f.mode==='once'}">Uma vez</button>${c.monthly?`<button type="button" class="${f.mode==='monthly'?'selected':''}" data-action="support-mode" data-mode="monthly" aria-pressed="${f.mode==='monthly'}">Todo mês</button>`:''}</div></fieldset>`}<div class="form-group"><label for="support-amount">Valor do apoio${f.mode==='monthly'?' mensal':''}</label><div class="amount-options">${amounts.map(a=>`<button type="button" class="amount-option ${f.amountCents===a?'selected':''}" data-action="amount" data-value="${a}" aria-pressed="${f.amountCents===a}">${brl(a)}</button>`).join('')}</div><input id="support-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" required maxlength="13" value="${(f.amountCents/100).toFixed(2).replace('.',',')}" aria-describedby="amount-hint support-error"><p id="amount-hint" class="form-hint">A partir de ${brl(reward?.amountCents||500)}.</p></div><p id="support-error" class="form-error" role="alert"></p><div class="modal-footer">${btn('Voltar','close-modal','','secondary')}<button type="submit" class="btn">Revisar apoio</button></div></form>`);
  } else {
    showModal('Revise seu apoio', 'Confira os detalhes antes de confirmar.', `<p class="step-label">Revise e confirme · etapa 2 de 2</p>${campaignLine}${rewardLine}<div class="review-row"><span>Modalidade</span><strong>${f.mode==='monthly'?'Mensal':'Apoio único'}</strong></div><div class="review-row"><span>Taxa</span><strong>R$ 0,00</strong></div><div class="review-row total"><span>Total${f.mode==='monthly'?' por mês':''}</span><strong>${brl(f.amountCents)}</strong></div><form id="confirm-support-form"><div class="form-group"><label for="payment-outcome">Resultado do pagamento</label><select id="payment-outcome" name="outcome"><option value="confirmed">Pagamento confirmado</option><option value="pending">Aguardando confirmação</option><option value="failed">Pagamento recusado</option></select></div>${f.mode==='monthly'?'<p class="form-hint">As próximas cobranças podem ser geradas em Meus apoios.</p>':''}<p id="support-error" class="form-error" role="alert"></p><div class="modal-footer">${btn('Corrigir valor','support-back','','secondary')}<button type="submit" class="btn">Confirmar apoio</button></div></form>`);
  }
}
function parseAmount(value) {
  const clean = String(value).trim().replace(/^R\$\s*/, '').replace(/\s/g,'');
  if (!/^\d{1,7}([,.]\d{1,2})?$/.test(clean)) throw new Error('Informe um valor sem separador de milhar, por exemplo 50,00.');
  const [whole, fraction = ''] = clean.replace(',','.').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000) throw new Error('Informe um valor entre R$ 0,01 e R$ 1.000.000,00.');
  return cents;
}
function readMilestoneDrafts(form){return [...form.querySelectorAll('[data-milestone-draft]')].map(row=>({title:row.querySelector('[data-milestone-title]').value,description:row.querySelector('[data-milestone-description]').value,amountCents:parseAmount(row.querySelector('[data-milestone-amount]').value)}));}
function formError(id, error) { const target = $(`#${id}`); if (target) { target.textContent = error.message; target.setAttribute('tabindex','-1'); target.focus(); } else toast(error.message, true); void refreshRestriction(error); }
function showSupportResult(contribution) {
  const result=renderPaymentResult(contribution,{icon});
  showModal(result.title,'',result.body);
}
function showReceipt(id) {
  const c = platform.getState().contributions.find(item => item.id === id && (item.supporterId === platform.getActor().id || platform.getActor().role === 'admin'));
  if (!c) throw new Error('Comprovante indisponível para esta personagem.');
  showModal('Comprovante de apoio', '', `<div class="modal-campaign"><img src="${projectImage(c.campaignImage)}" alt=""><div><strong>${esc(c.campaignTitle)}</strong><small>${date(c.createdAt)}</small></div></div><div class="review-row"><span>Apoiador</span><strong>${esc(c.supporterName || (c.supporterId === platform.getActor().id ? platform.getActor().name : 'Apoiador'))}</strong></div><div class="review-row"><span>Modalidade</span><strong>${c.isRenewal ? `Cobrança mensal · ciclo ${c.billingCycle || ''}` : c.mode === 'monthly' ? 'Mensal' : 'Único'}</strong></div><div class="review-row"><span>Estado</span>${renderSupportBadge(c,icon)}</div>${c.refundStatus==='completed'&&c.refundedAt?`<div class="review-row"><span>Devolução integral</span><strong>${date(c.refundedAt)}</strong></div>`:''}<div class="review-row total"><span>Valor original</span><strong>${brl(c.amountCents)}</strong></div><div class="receipt-reference">${esc(c.transactionId)} · ${esc(c.id)}</div><div class="modal-footer">${btn('Fechar','close-modal','','secondary')}${btn(`${icon('download')}Baixar comprovante`, 'download-receipt', `data-id="${esc(c.id)}"`)}</div>`);
}
let payoutFlow = null;
const payoutDestination = (actor = platform.getActor()) => `Conta fictícia de ${actor.name} · 0001`;
function showPayout() {
  const balance = platform.getSummary().availableBalanceCents;
  if (platform.getActor().role !== 'creator') throw new Error('Use o perfil de criador para solicitar um repasse.');
  payoutFlow = { idempotencyKey: key() };
  showModal('Solicitar repasse', 'Informe o valor para a conta de destino.', `<div class="notice">${icon('wallet')}<div>Saldo disponível: <strong>${brl(balance)}</strong><br>Destino: ${esc(payoutDestination())}.</div></div><form id="payout-form"><div class="form-group"><label for="payout-amount">Valor do repasse</label><input id="payout-amount" name="amount" type="text" inputmode="decimal" required maxlength="13" value="${(Math.min(balance,50000)/100).toFixed(2).replace('.',',')}"><p class="form-hint">Taxa: R$ 0,00.</p></div><p class="form-error" id="payout-error" role="alert"></p><div class="modal-footer">${btn('Voltar','close-modal','','secondary')}<button type="submit" class="btn">Revisar repasse</button></div></form>`);
}
function showNewCampaign() {
  if (platform.getActor().role!=='creator') throw new Error('Use o perfil de criador para publicar.');
  rewardDraftSequence=0;milestoneDraftSequence=0;
  showModal('Criar projeto', 'Defina a categoria, a meta e as opções de apoio.', renderCampaignForm(categories));
}
function showCreatorProfile(creatorId) {
  const actor=platform.getActor();
  editingCreatorId=creatorId||actor.id;
  if(actor.restricted||!['creator','supporter'].includes(actor.role)||editingCreatorId!==actor.id) throw new Error('Você não tem permissão para editar este perfil.');
  const target=(platform.getState().accounts||[]).find(a=>a.id===editingCreatorId);
  if(!target)throw new Error('Perfil não encontrado.');
  const profile=(platform.getState().creatorProfiles||[]).find(p=>p.creatorId===editingCreatorId)||{};
  profileLinkSequence=(profile.links||[]).length;
  showModal('Editar perfil',target.name,renderCreatorProfileForm(profile,target));
}
function showProjectPost(kind,campaignId) {
  const campaign=platform.getCampaign(campaignId);
  showModal(kind==='update'?'Publicar atualização':'Comentar no projeto',campaign.title,renderProjectPostForm(kind,campaignId));
}
function showProjectSettings(campaignId) {
  const campaign=platform.getCampaign(campaignId),actor=platform.getActor();
  if(actor.restricted||campaign.deletedAt||!(actor.role==='creator'&&campaign.creatorId===actor.id))throw new Error('Você não tem permissão para configurar este projeto ativo.');
  const monthlyLocked=campaign.rewards.some(r=>r.monthly)||platform.getState().contributions.some(c=>c.campaignId===campaignId&&(c.subscriptionStatus==='active'||c.mode==='monthly'&&!c.isRenewal&&c.status==='pending'));
  milestoneDraftSequence=campaign.milestones?.length||0;
  showModal('Configurar projeto','As alterações são salvas sem sair desta página.',renderCampaignSettingsForm(campaign,categories,{monthlyLocked}));
}
async function loadDeletionPreview(flow) {
  const label = 'Excluir projeto', subtitle = flow.title;
  showModal(label, subtitle, '<p role="status">Consultando saldo e efeitos da exclusão…</p>');
  try {
    const preview = await platform.getCampaignDeletionPreview(flow.id);
    if (moderationFlow !== flow || !modal.open) return;
    showModal(label, subtitle, renderModerationForm({
      targetName:flow.title, actionLabel:label, danger:true, deletionPreview:preview, reason:flow.reason,
    }));
  } catch (error) {
    if (moderationFlow !== flow || !modal.open) return;
    await refreshRestriction(error);
    if (moderationFlow !== flow || !modal.open) return;
    showModal(label, subtitle, `<p class="form-error" role="alert">${esc(error.message)}</p><div class="modal-footer">${btn('Cancelar','close-modal','','secondary')}${btn('Consultar novamente','retry-deletion-preview')}</div>`);
  }
}
async function showModeration(kind,id,value) {
  const allowed={project:['delete','restore'],account:['punish','release','ban','unban'],comment:['remove','restore']};
  if(!allowed[kind]?.includes(value))throw new Error('Ação administrativa inválida.');
  const actor=platform.getActor(),state=platform.getState(),items=kind==='project'?state.campaigns:kind==='account'?state.accounts:state.projectComments;
  const item=items.find(item=>item.id===id);if(!item)throw new Error('Registro não encontrado.');
  const ownerCanDelete=kind==='project'&&actor.role==='creator'&&actor.id===item.creatorId&&!actor.restricted&&((value==='delete'&&!item.deletedAt)||(value==='restore'&&item.deletedAt&&item.deletedBy===actor.id));
  if(actor.role!=='admin'&&!ownerCanDelete)throw new Error('Você não tem permissão para esta ação.');
  if(kind==='project'&&value==='delete'){
    moderationFlow={kind,id,flag:true,title:item.title,idempotencyKey:key(),reason:''};
    await loadDeletionPreview(moderationFlow);
    return;
  }
  if(kind==='account'&&['punish','ban'].includes(value)){
    if(item.role==='admin')throw new Error('Contas administrativas não podem receber punições.');
    moderationFlow={kind,id};
    showModal(item.restricted?'Alterar punição':'Aplicar punição','Selecione a restrição, o prazo e o motivo.',renderAccountPunishmentForm({targetName:item.name,current:item}));return;
  }
  const flag=['delete','remove'].includes(value),labels={project:flag?'Excluir projeto':'Restaurar projeto',account:'Encerrar punição',comment:flag?'Remover comentário':'Restaurar comentário'};
  moderationFlow={kind,id,flag,...(kind==='project'?{idempotencyKey:key()}:{})};
  const details={project:'O projeto volta à área pública. As devoluções e os cancelamentos já registrados ficam no histórico.',account:flag?'O banimento bloqueia novas ações da conta e pode ser revertido.':'A conta volta a realizar as ações permitidas ao seu perfil.',comment:flag?'O comentário deixa de aparecer publicamente e pode ser restaurado.':'O comentário volta a aparecer na página do projeto.'};
  showModal(labels[kind],'O motivo ficará registrado no histórico administrativo.',renderModerationForm({targetName:item.title||item.name||`Comentário de ${item.authorName}`,actionLabel:labels[kind],detail:details[kind],danger:flag}));
}
function download(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click', async event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); $('#main').focus(); return; }
  const element = event.target.closest('[data-action]'); if (!element || element.disabled) return;
  const { action, id, value, page, mode, amount } = element.dataset;
  if (action === 'retry-api') { await initializeApp(); return; }
  if (!platform) return;
  if(platform.getActor().restricted&&restrictedActions.has(action)){toast('Esta ação está bloqueada durante a punição da conta.',true);return;}
  const remote = remoteActions.has(action);
  if (remote && pendingAction) { toast('Aguarde a conclusão da operação em andamento.'); return; }
  if (remote) {
    pendingAction = true; element.disabled = true; element.setAttribute('aria-busy', 'true');
    $('#announcer').textContent = 'Registrando a operação…';
  }
  try {
    if(action==='auth-mode'){authMode=value==='register'?'register':'login';render();}
    else if(action==='auth-logout'){await platform.logout();closeModal();authMode='login';render();}
    else if (action === 'navigate') navigate(page);
    else if (action === 'project') navigate(`projeto/${id}`);
    else if(action==='creator')navigate(`perfil/${id}`);
    else if(action==='account-profile')navigate(`perfil/${id}`);
    else if(action==='remove-profile-photo'){await platform.removeAvatar();render();refreshProfilePhotoEditor();toast('Foto removida.');}
    else if(action==='search-scope'){if(!['all','projects','creators'].includes(value))return;searchScope=value;renderPage();document.querySelector(`[data-action="search-scope"][data-value="${value}"]`)?.focus({preventScroll:true});}
    else if(action==='project-settings')showProjectSettings(id);
    else if(action==='edit-reward-delivery'){const s=platform.getState(),c=s.contributions.find(c=>c.id===id);if(!c||c.creatorId!==platform.getActor().id)throw new Error('Entrega indisponível.');showModal('Entregar recompensa',c.campaignTitle,renderRewardDeliveryForm(c,(s.rewardDeliveries||[]).find(d=>d.contributionId===id)));}
    else if(action==='acknowledge-reward'){await platform.acknowledgeRewardDelivery({deliveryId:id});renderPage();toast('Recebimento confirmado.');}
    else if(action==='moderate-project')await showModeration('project',id,value);
    else if(action==='retry-deletion-preview'&&moderationFlow)await loadDeletionPreview(moderationFlow);
    else if(action==='moderate-account')await showModeration('account',id,value);
    else if(action==='moderate-comment')await showModeration('comment',id,value);
    else if(action==='discard-project-image'&&!pendingAction)resetProjectImageEditor(element.closest('form'));
    else if(action==='upload-project-image'||action==='remove-project-image')await updateProjectImage(action,element);
    else if(action==='admin-tab'){if(!['projetos','contas','comentarios','mensagens','logs'].includes(element.dataset.tab))return;adminTab=element.dataset.tab;renderPage();document.querySelector(`[data-action="admin-tab"][data-tab="${adminTab}"]`)?.focus({preventScroll:true});}
    else if (action === 'project-tab') {
      const campaign=platform.getCampaign(id), tabs=['sobre','criador',...(campaign.rewards.length?['recompensas']:[]),'atualizacoes','comentarios'];
      if(!tabs.includes(element.dataset.tab)) return;
      projectTabs.set(id,element.dataset.tab);renderPage();
      const tab=document.querySelector(`[role="tab"][data-tab="${element.dataset.tab}"]`);tab?.focus({preventScroll:true});tab?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    }
    else if (action === 'edit-creator-profile') showCreatorProfile(id);
    else if (action === 'create-project-update') showProjectPost('update',id);
    else if (action === 'create-project-comment') showProjectPost('comment',id);
    else if(action==='add-milestone'){const list=$('#campaign-milestones');if(!list)return;if(list.children.length>=10)throw new Error('Adicione no máximo 10 metas.');list.insertAdjacentHTML('beforeend',renderMilestoneDraft(++milestoneDraftSequence));list.lastElementChild.querySelector('input').focus();}
    else if(action==='remove-milestone'){element.closest('[data-milestone-draft]')?.remove();$('[data-action="add-milestone"]')?.focus();}
    else if (action === 'add-reward') {
      const list=$('#campaign-rewards');if(!list)return;
      if(list.children.length>=20)throw new Error('Adicione no máximo 20 recompensas.');
      list.insertAdjacentHTML('beforeend',renderRewardDraft(++rewardDraftSequence,{monthlyEnabled:$('#campaign-monthly').checked}));list.lastElementChild.querySelector('input').focus();
    }
    else if (action === 'remove-reward') {element.closest('[data-reward-draft]')?.remove();document.querySelector('[data-action="add-reward"]')?.focus();}
    else if (action === 'add-profile-link') {
      const list=$('#creator-links');if(!list)return;
      if(list.children.length>=5)throw new Error('Adicione no máximo cinco links.');
      list.insertAdjacentHTML('beforeend',renderProfileLinkDraft(++profileLinkSequence));list.lastElementChild.querySelector('input').focus();
    }
    else if (action === 'remove-profile-link') {element.closest('[data-profile-link]')?.remove();document.querySelector('[data-action="add-profile-link"]')?.focus();}
    else if (action === 'menu') setMenuOpen(!menuOpen);
    else if (action === 'theme') { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('elo-theme',dark ? 'dark':'light'); } catch {} $('meta[name="theme-color"]').content = dark ? '#232428' : '#f6f6f7'; element.innerHTML = icon(dark ? 'sun':'moon'); element.setAttribute('aria-label',dark ? 'Ativar modo claro':'Ativar modo noturno'); $('#announcer').textContent = dark ? 'Modo noturno ativado.' : 'Modo claro ativado.'; }
    else if (action === 'scroll-projects') { $('#projects').scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto':'smooth' }); $('#projects-title').tabIndex = -1; $('#projects-title').focus({preventScroll:true}); }
    else if (action === 'category') { category = value; renderPage(); [...document.querySelectorAll('[data-action="category"]')].find(b=>b.dataset.value===value)?.focus({preventScroll:true}); $('#announcer').textContent = `Categoria ${value} selecionada.`; }
    else if (action === 'clear-filters') { category = 'Todos os projetos'; search = ''; $('#global-search').value = ''; renderPage(); }
    else if (action === 'save') { const saved = await platform.toggleSaved(id); const c = platform.getCampaign(id); render(); toast(`${c.title}: ${saved ? 'projeto salvo.' : 'removido dos salvos.'}`); }
    else if (action === 'support-filter') { supportFilter = value; renderPage(); [...document.querySelectorAll('[data-action="support-filter"]')].find(b=>b.dataset.value===value)?.focus({preventScroll:true}); }
    else if (action === 'revenue-range') { const days = Number(element.dataset.days); if (![7,30].includes(days)) return; revenueDays = days; renderPage(); document.querySelector(`[data-action="revenue-range"][data-days="${days}"]`)?.focus({preventScroll:true}); $('#announcer').textContent = `Arrecadação dos últimos ${days} dias: ${brl(revenueReport.totalCents)} em ${revenueReport.paymentCount} ${revenueReport.paymentCount === 1 ? 'pagamento confirmado' : 'pagamentos confirmados'}.`; }
    else if (action === 'personas') showPersonas();
    else if (action === 'choose-persona' || action === 'switch-actor') { await platform.switchActor(id); closeModal(); render(); toast(`Você está explorando como ${platform.getActor().name}.`); }
    else if (action === 'support') startSupport(id, Number(amount || 5000), mode || 'once', element.dataset.rewardId || null);
    else if (action === 'support-as-ana') { await platform.switchActor('supporter1'); render(); renderSupportModal(); }
    else if (action === 'support-mode') { try { supportFlow.amountCents = parseAmount($('#support-amount').value); } catch {} if (!supportFlow.rewardId) supportFlow.mode = mode; renderSupportModal(); }
    else if (action === 'amount') { supportFlow.amountCents = Number(value); $('#support-amount').value = (Number(value)/100).toFixed(2).replace('.',','); modal.querySelectorAll('.amount-option').forEach(b => { const selected = b === element; b.classList.toggle('selected',selected); b.setAttribute('aria-pressed',selected); }); }
    else if (action === 'support-back') { supportFlow.step = 1; renderSupportModal(); }
    else if (action === 'close-modal') { if(!pendingAction)closeModal(); }
    else if (action === 'modal-navigate') { closeModal(); navigate(page); }
    else if (action === 'receipt') showReceipt(id);
    else if (action === 'download-receipt') { const c = platform.getState().contributions.find(c=>c.id===id && (c.supporterId===platform.getActor().id || platform.getActor().role==='admin')); if (!c) throw new Error('Comprovante indisponível.'); download(JSON.stringify({ aviso:'Comprovante fictício, sem validade financeira.', ...c }, null,2),`elo-comprovante-${id}.json`); toast('Comprovante exportado.'); }
    else if (action === 'export') { download(await platform.exportData(),'elo-dados.json'); toast('Dados exportados.'); }
    else if (action === 'export-revenue') { if (!revenueReport || platform.getActor().role !== 'creator') throw new Error('Abra a área Financeiro para exportar o período.'); const report = revenueReport; download(JSON.stringify({prototype:'Elo — demonstração acadêmica',warning:'Somente dados fictícios; sem validade financeira.',exportedAt:new Date().toISOString(),currency:'BRL',projectId:revenueCampaignId || null,projectTitle:platform.listCampaigns().find(c=>c.id===revenueCampaignId)?.title || 'Todos os meus projetos',...report},null,2),`elo-arrecadacao-${report.startDate}-${report.endDate}.json`); toast('Arrecadação do período exportada com os filtros selecionados.'); }
    else if (action === 'pending-confirm' || action === 'pending-fail') { const c = platform.getState().contributions.find(c=>c.id===id); showModal('Atualizar pagamento', 'Confira os dados do apoio.', `<div class="review-row"><span>Projeto</span><strong>${esc(c.campaignTitle)}</strong></div><div class="review-row"><span>Valor</span><strong>${brl(c.amountCents)}</strong></div><p class="form-hint" style="margin-top:15px">${action === 'pending-confirm' ? 'A confirmação adicionará o valor à arrecadação.' : 'A recusa manterá a arrecadação sem esse valor.'}</p><div class="modal-footer">${btn('Voltar','close-modal','','secondary')}${btn(action === 'pending-confirm' ? 'Confirmar pagamento' : 'Recusar pagamento','resolve-pending',`data-id="${esc(id)}" data-value="${action === 'pending-confirm' ? 'confirmed':'failed'}"`)}</div>`); }
    else if (action === 'resolve-pending') { if(value==='confirmed')assertSupportPaymentAvailable(id);const c = await platform.simulatePayment(id,value); render(); showSupportResult(c); }
    else if (action === 'renew-subscription') {
      const c = assertSupportPaymentAvailable(id);
      if (c.isRenewal || c.subscriptionStatus !== 'active') throw new Error('Escolha um apoio mensal ativo para gerar a próxima cobrança.');
      renewalFlow = { contributionId: id, idempotencyKey: key() };
      showModal('Próxima cobrança', 'Gere o próximo ciclo deste apoio mensal.', `<div class="review-row"><span>Projeto</span><strong>${esc(c.campaignTitle)}</strong></div><div class="review-row total"><span>Valor da próxima cobrança</span><strong>${brl(c.amountCents)}</strong></div><div class="notice" style="margin-top:20px">${icon('repeat')}<div>Será criada uma cobrança pendente para o próximo ciclo. Acompanhe o pagamento em Meus apoios.</div></div><div class="modal-footer">${btn('Voltar', 'close-modal', '', 'secondary')}${btn('Gerar cobrança', 'confirm-renew')}</div>`);
    }
    else if (action === 'confirm-renew') { assertSupportPaymentAvailable(renewalFlow.contributionId);const c = await platform.renewSubscription(renewalFlow); render(); showSupportResult(c); }
    else if (action === 'cancel-subscription') { const c = platform.getState().contributions.find(c=>c.id===id); showModal('Cancelar o apoio mensal?', 'Você pode apoiar essa ideia novamente quando quiser.', `<p class="muted" style="font-size:.9rem">A recorrência de <strong>${brl(c.amountCents)} por mês</strong> para <strong>${esc(c.campaignTitle)}</strong> será cancelada. Cobranças mensais ainda pendentes serão canceladas. Os pagamentos já confirmados continuarão no histórico.</p><div class="modal-footer">${btn('Manter apoio','close-modal','','secondary')}${btn('Cancelar recorrência','confirm-cancel',`data-id="${esc(id)}"`,'danger')}</div>`); }
    else if (action === 'confirm-cancel') { await platform.cancelSubscription(id); closeModal(); render(); toast('Recorrência cancelada. O histórico foi preservado.'); }
    else if (action === 'new-campaign') showNewCampaign();
    else if (action === 'payout') showPayout();
    else if (action === 'confirm-payout') { element.disabled = true; try { const payout = await platform.requestPayout(payoutFlow); render(); showModal('Repasse registrado', 'Confira os dados do repasse.', `<div class="confirmation"><div class="confirmation-icon">${icon('check')}</div><h3>Repasse concluído</h3><span class="funding-big">${brl(payout.amountCents)}</span><p>O repasse foi registrado e o saldo disponível foi atualizado.</p><div class="receipt-reference">${esc(payout.id)} · ${esc(payout.destination || payoutDestination())}</div></div><div class="modal-footer">${btn('Ver financeiro','modal-navigate','data-page="financeiro"')}</div>`); } catch (error) { element.disabled = false; throw error; } }
    else if (action === 'diagnostics') { diagnostics = await platform.securityDiagnostics(); renderPage(); toast(`${diagnostics.filter(c=>c.passed).length} verificações do domínio concluídas.`); }
    else if (action === 'reset') showModal('Recomeçar a demonstração?', 'Seus cenários fictícios voltarão ao estado inicial.', `<p class="muted" style="font-size:.9rem">Apoios, projetos criados, salvos e repasses deste cenário fictício serão reiniciados no banco. Outros cenários não serão alterados. Sua preferência de tema será mantida.</p><div class="modal-footer">${btn('Manter meus cenários','close-modal','','secondary')}${btn('Reiniciar demonstração','confirm-reset','','danger')}</div>`);
    else if (action === 'confirm-reset') { await platform.reset(); diagnostics = null; category = 'Todos os projetos'; search = ''; closeModal(); navigate('explorar'); toast('Demonstração reiniciada com dados fictícios.'); }
    else if(action==='demo-info'&&platform.getState().auth?.enabled)showModal('Sobre o protótipo','Pagamentos simulados.',`<p>Os cadastros usam login e senha. Projetos, apoios e repasses continuam no ambiente acadêmico, sem movimentar dinheiro real.</p><div class="modal-footer">${btn('Entendi','close-modal')}</div>`);
    else if (action === 'demo-info') showModal('Um espaço para experimentar.', 'Demonstração acadêmica da plataforma Elo.', `<div class="info-list"><div class="info-item">${icon('heart')}<div><strong>Todos os apoios são fictícios.</strong><p>Valores, campanhas e personagens fazem parte de uma simulação.</p></div></div><div class="info-item">${icon('lock')}<div><strong>Sem dados financeiros reais.</strong><p>Não há conexão com bancos ou processadores de pagamento. Não informe documentos, cartões ou senhas reais.</p></div></div><div class="info-item">${icon('people')}<div><strong>Explore os diferentes papéis.</strong><p>Troque de personagem pelo perfil no canto superior. Você pode experimentar ser apoiadora, criadora ou administrador.</p></div></div></div><div class="modal-footer">${btn('Entendi','close-modal')}</div>`);
    else if(action==='privacy'&&platform.getState().auth?.enabled)showModal('Privacidade da conta','Seus dados no Elo.',`<p>Usuário e tipo de conta identificam sua participação. O e-mail de contato aparece somente para você e para a administração. A senha é guardada como hash, e o acesso depende da sua sessão. Os pagamentos permanecem simulados.</p><div class="modal-footer">${btn('Entendi','close-modal')}</div>`);
    else if (action === 'privacy') showModal('Seus dados nesta demonstração.', 'Transparência para explorar com tranquilidade.', `<p class="story" style="margin-top:0">Somente dados fictícios devem ser usados. Os cenários fictícios são enviados à API da aplicação e persistidos no PostgreSQL. Um cookie de sessão identifica o cenário deste navegador. Não há envio de pagamentos a bancos ou processadores financeiros. O servidor pode manter registros técnicos de acesso.\n\nA troca de personagens é demonstrativa e não constitui autenticação. As regras de negócio e as permissões por personagem são verificadas na API. A seleção livre das personagens é intencional neste ambiente acadêmico e não deve ser usada para proteger dados reais.\n\nVocê pode exportar seus cenários ou reiniciar a demonstração no Laboratório. A preferência de tema fica neste navegador. Limpar os cookies pode impedir reencontrar seu cenário, mesmo que ele continue armazenado no banco.</p><div class="modal-footer">${btn('Entendi','close-modal')}</div>`);
    else if (action === 'refresh-state') { await platform.refresh();adminAuditEntries=null;render();toast('Dados atualizados.'); }
  } catch (error) { await refreshRestriction(error);toast(error.message || 'Não foi possível concluir essa ação.', true); }
  finally { if (remote) { pendingAction = false; if (element.isConnected) { element.disabled = false; element.removeAttribute('aria-busy'); } } }
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if(form.id==='avatar-form'){
    event.preventDefault();if(pendingAction)return;pendingAction=true;const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    try{const file=form.elements.namedItem('photo').files?.[0];if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Escolha uma foto JPG, PNG ou WebP.');if(file.size>2*1024*1024)throw new Error('A foto deve ter no máximo 2 MB.');await platform.uploadAvatar(file);render();refreshProfilePhotoEditor();toast('Foto do perfil atualizada.');}
    catch(error){formError('profile-photo-error',error);}finally{pendingAction=false;if(submit.isConnected)submit.disabled=false;}return;
  }
  if(form.id==='authentication-form'){
    event.preventDefault();if(pendingAction)return;pendingAction=true;const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    try{form.querySelectorAll('[aria-invalid]').forEach(input=>{input.removeAttribute('aria-invalid');if(input.name==='username')input.setAttribute('aria-describedby','auth-username-hint');else input.removeAttribute('aria-describedby');});const values=Object.fromEntries(new FormData(form));await (form.dataset.mode==='register'?platform.register(values):platform.login(values));form.reset();closeModal();navigate('explorar');render();}
    catch(error){const target=$('#authentication-error');if(target)target.textContent=error.message;const input=['username','email','role','password'].includes(error.field)?form.elements.namedItem(error.field):null;if(input){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',input.name==='username'?'auth-username-hint authentication-error':'authentication-error');input.focus();}}
    finally{pendingAction=false;if(submit.isConnected)submit.disabled=false;}return;
  }
   if (!['support-form','confirm-support-form','payout-form','campaign-form','creator-profile-form','project-update-form','project-comment-form','campaign-settings-form','moderation-form','account-punishment-form','direct-message-form','reward-delivery-form'].includes(form.id)) return;
  event.preventDefault();
  const remoteSubmit = ['confirm-support-form','campaign-form','creator-profile-form','project-update-form','project-comment-form','campaign-settings-form','moderation-form','account-punishment-form','direct-message-form','reward-delivery-form'].includes(form.id);
  if (remoteSubmit && pendingAction) { toast('Aguarde a conclusão da operação em andamento.'); return; }
  const sendingButton = $('button[type="submit"]', form);
  if (remoteSubmit) { pendingAction = true; sendingButton.disabled = true; sendingButton.setAttribute('aria-busy', 'true'); $('#announcer').textContent = 'Registrando a operação no servidor…'; }
  const data = new FormData(form);
  try {
  if (form.id === 'support-form') {
    try { const cents = parseAmount(data.get('amount')); const selectedReward=platform.getCampaign(supportFlow.campaignId).rewards.find(r=>r.id===supportFlow.rewardId); if(selectedReward&&cents<selectedReward.amountCents)throw new Error(`O valor mínimo desta recompensa é ${brl(selectedReward.amountCents)}.`); if (cents < 500) throw new Error('O apoio mínimo é R$ 5,00.'); supportFlow.amountCents = cents; supportFlow.step = 2; renderSupportModal(); } catch (error) { formError('support-error',error); }
  } else if (form.id === 'confirm-support-form') {
    const submit = $('button[type="submit"]',form); submit.disabled = true;
    try { let c = await platform.createContribution(supportFlow); const outcome = data.get('outcome'); if (outcome !== 'pending') c = await platform.simulatePayment(c.id,outcome); render(); showSupportResult(c); } catch (error) { submit.disabled = false; formError('support-error',error); }
  } else if (form.id === 'payout-form') {
    try { payoutFlow.amountCents = parseAmount(data.get('amount')); if (payoutFlow.amountCents > platform.getSummary().availableBalanceCents) throw new Error('O valor excede o saldo disponível.'); showModal('Revisar repasse', 'Confira o valor e o destino.', `<div class="review-row"><span>Destino</span><strong>${esc(payoutDestination())}</strong></div><div class="review-row"><span>Taxa</span><strong>R$ 0,00</strong></div><div class="review-row total"><span>Valor do repasse</span><strong>${brl(payoutFlow.amountCents)}</strong></div><div class="modal-footer">${btn('Voltar','payout','','secondary')}${btn('Confirmar repasse','confirm-payout')}</div>`); } catch (error) { formError('payout-error',error); }
  } else if (form.id === 'campaign-form') {
    try {
      const rewards=[...form.querySelectorAll('[data-reward-draft]')].map(row=>({title:row.querySelector('[data-reward-title]').value,description:row.querySelector('[data-reward-description]').value,amountCents:parseAmount(row.querySelector('[data-reward-amount]').value),monthly:row.querySelector('[data-reward-monthly]').checked}));
      const thumbnail=$('#project-image-file',form).files[0]||null;
      if(thumbnail)validateProjectImage(thumbnail);
      const c=await platform.createCampaign({title:data.get('title'),description:data.get('description'),category:data.get('category'),goalCents:parseAmount(data.get('goal')),daysLeft:Number(data.get('days')),monthly:data.has('monthly'),rewards,milestones:readMilestoneDrafts(form)},thumbnail);closeModal();navigate(`projeto/${c.id}`);toast('Seu projeto foi publicado.');
    } catch(error){formError('project-form-error',error);}
  } else if(form.id==='campaign-settings-form') {
    try{
      if($('#project-image-file',form).files.length)throw new Error('Salve a nova capa ou descarte a seleção antes de salvar os outros campos.');
      const existing=platform.getCampaign(form.dataset.campaignId),monthlyInput=$('#settings-monthly');
      await platform.updateCampaign({campaignId:existing.id,title:data.get('title'),description:data.get('description'),story:data.get('story'),category:data.get('category'),goalCents:parseAmount(data.get('goal')),daysLeft:Number(data.get('days')),monthly:monthlyInput.disabled?existing.monthly:data.has('monthly'),milestones:readMilestoneDrafts(form)});
      closeModal();renderPage();document.querySelector('[data-action="project-settings"]')?.focus({preventScroll:true});toast('Projeto atualizado.');
    }catch(error){formError('project-form-error',error);}
  } else if(form.id==='reward-delivery-form'){
    try{await platform.publishRewardDelivery({contributionId:form.dataset.contributionId,message:data.get('message'),url:data.get('url')});closeModal();renderPage();toast('Entrega disponibilizada ao apoiador.');}catch(error){formError('reward-delivery-error',error);}
  } else if(form.id==='account-punishment-form') {
    try{
      await platform.moderateAccount({accountId:moderationFlow.id,type:data.get('type'),expiresAt:punishmentExpiry(data.get('duration'),data.get('expiresAt')),reason:data.get('reason')});
      adminAuditEntries=null;closeModal();render();toast('Punição registrada.');
    }catch(error){formError('project-form-error',error);}
  } else if(form.id==='moderation-form') {
    const flow=moderationFlow, reason=data.get('reason');
    flow.reason=reason;
    try{
      const {kind,id,flag,idempotencyKey}=flow;
      let message='Ação administrativa registrada.';
      if(kind==='project'){
        const result=await platform.moderateCampaign({campaignId:id,deleted:flag,reason,idempotencyKey});
        message=flag?'Projeto excluído. O histórico foi preservado.':'Projeto restaurado.';
        if(flag&&result?.deletionSummary?.refundCount)message=`Projeto excluído. ${brl(result.deletionSummary.refundedCents)} devolvidos aos apoiadores.`;
      }else if(kind==='account')await platform.moderateAccount({accountId:id,type:'none',expiresAt:null,reason});else await platform.moderateComment({commentId:id,removed:flag,reason});
      adminAuditEntries=null;closeModal();render();toast(message);
    }catch(error){
      if(error.code==='REFUND_INSUFFICIENT_BALANCE'&&flow.flag&&flow.kind==='project')await loadDeletionPreview(flow);
      if(modal.open)formError('project-form-error',error);
    }
  } else if(form.id==='direct-message-form') {
    try{await platform.sendDirectMessage({creatorId:form.dataset.creatorId,body:data.get('body')});adminAuditEntries=null;renderPage();document.querySelector('#direct-message-form textarea')?.focus({preventScroll:true});toast('Mensagem enviada.');}catch(error){formError('direct-message-error',error);}
  } else if (form.id === 'creator-profile-form') {
    try {
      const links=[...form.querySelectorAll('[data-profile-link]')].map(row=>({label:row.querySelector('[data-link-label]').value,url:row.querySelector('[data-link-url]').value}));
      const city=data.get('city').trim(),region=data.get('region');
      if(Boolean(city)!==Boolean(region))throw new Error('Informe cidade e UF ou deixe os dois campos em branco.');
      const location=city&&region?{city,region,countryCode:'BR'}:null;
      await platform.updateCreatorProfile({creatorId:editingCreatorId,bio:data.get('bio'),links,location});closeModal();render();toast('Perfil atualizado.');
    } catch(error){formError('project-form-error',error);}
  } else if (form.id === 'project-update-form' || form.id === 'project-comment-form') {
    try {
      const campaignId=form.dataset.campaignId, update=form.id==='project-update-form';
      if(update)await platform.createProjectUpdate({campaignId,title:data.get('title'),body:data.get('body')});else await platform.createProjectComment({campaignId,body:data.get('body')});
      projectTabs.set(campaignId,update?'atualizacoes':'comentarios');closeModal();render();toast(update?'Atualização publicada.':'Comentário publicado.');
    } catch(error){formError('project-form-error',error);}
  }
  } finally { if (remoteSubmit) { pendingAction = false; if (sendingButton.isConnected) { sendingButton.disabled = false; sendingButton.removeAttribute('aria-busy'); } } }
});
document.addEventListener('input', event => {
  if (event.target.id === 'global-search') { search = event.target.value; const route = currentRoute(); if(!search.trim())searchScope='all'; if (route.page !== 'explorar') { navigate('explorar'); setTimeout(()=>{const input=$('#global-search');input.focus();input.setSelectionRange(input.value.length,input.value.length);},0); } else renderPage(); }
  if (event.target.id === 'support-amount') modal.querySelectorAll('.amount-option').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});
});
document.addEventListener('change', async event => {
  if(event.target.id==='project-image-file')previewProjectImage(event.target);
  if(event.target.id==='profile-photo-file'){
    clearAvatarPreview();const file=event.target.files?.[0],preview=$('#profile-photo-preview'),error=$('#profile-photo-error');preview.hidden=true;preview.removeAttribute('src');error.textContent='';
    if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){error.textContent='Escolha JPG, PNG ou WebP com até 2 MB.';event.target.value='';}else{avatarPreviewUrl=URL.createObjectURL(file);preview.src=avatarPreviewUrl;preview.hidden=false;}}
  }
  if(event.target.id==='punishment-duration'){
    const custom=event.target.value==='custom',wrapper=$('#punishment-custom-until'),input=$('#punishment-until');
    wrapper.hidden=!custom;input.disabled=!custom;input.required=custom;if(custom)input.focus();
  }
  if(['admin-project-status','admin-account-status','admin-comment-status'].includes(event.target.id)){
    const map={'admin-project-status':'projects','admin-account-status':'accounts','admin-comment-status':'comments'};adminStatusFilters[map[event.target.id]]=event.target.value;const id=event.target.id;renderPage();document.getElementById(id)?.focus({preventScroll:true});
  }
  if(event.target.id==='message-creator'){adminSelectedCreatorId=event.target.value;renderPage();document.getElementById('message-creator')?.focus({preventScroll:true});}
  if(event.target.id==='admin-account-filter'){
    adminSelectedAccountId=event.target.value;const requestedAccountId=adminSelectedAccountId;adminAuditEntries=null;renderPage();document.getElementById('admin-account-filter')?.focus({preventScroll:true});
    try{const entries=requestedAccountId?await platform.auditForAccount(requestedAccountId):null;if(requestedAccountId!==adminSelectedAccountId)return;adminAuditEntries=entries;renderPage();document.getElementById('admin-account-filter')?.focus({preventScroll:true});}catch(error){toast(error.message,true);}
  }
  if(event.target.id==='campaign-monthly') document.querySelectorAll('[data-reward-monthly]').forEach(input=>{input.disabled=!event.target.checked;if(input.disabled)input.checked=false;});
  if (event.target.id === 'sort') { sort = event.target.value; renderPage(); $('#sort')?.focus({preventScroll:true}); }
  if (event.target.id === 'revenue-project') { revenueCampaignId = event.target.value; renderPage(); $('#revenue-project')?.focus({preventScroll:true}); $('#announcer').textContent = `Projeto filtrado. Arrecadação no período: ${brl(revenueReport.totalCents)}.`; }
});

document.addEventListener('keydown',event=>{
  const tab=event.target.closest?.('[role="tab"][data-action="project-tab"],[role="tab"][data-action="admin-tab"]');
  if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const tabs=[...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')],index=tabs.indexOf(tab);
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();
});

function selectRevenueDay(chart,index,{announce=false}={}) {
  const points = [...chart.querySelectorAll('[data-chart-index]')];
  if (!points.length) return;
  const selected = Math.max(0,Math.min(points.length-1,index)),point=points[selected];
  chart.dataset.activeIndex=String(selected);
  points.forEach((p,i)=>p.classList.toggle('is-active',i===selected));
  chart.querySelectorAll('[data-chart-table-index]').forEach(row=>row.classList.toggle('is-active',Number(row.dataset.chartTableIndex)===selected));
  const tooltip=chart.querySelector('[data-chart-tooltip]');
  if(tooltip) {
    tooltip.textContent=point.dataset.tooltip;tooltip.hidden=false;
    const box=chart.getBoundingClientRect(),dot=point.getBoundingClientRect();
    const width=tooltip.offsetWidth,height=tooltip.offsetHeight;
    const left=Math.max(4,Math.min(box.width-width-4,dot.left+dot.width/2-box.left-width/2));
    const top=Math.max(0,dot.top-box.top-height-12);
    tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
  }
  if(announce) { const label=chart.querySelector('[data-chart-selection]');if(label)label.textContent=point.dataset.tooltip; }
}
function revenuePointer(event) {
  const plot=event.target.closest?.('[data-chart-plot]');if(!plot)return;
  const chart=plot.closest('[data-revenue-chart]'),points=[...chart.querySelectorAll('[data-chart-index]')];
  if(!points.length)return;
  let nearest=0,distance=Infinity;
  points.forEach((point,index)=>{const rect=point.getBoundingClientRect(),delta=Math.abs(event.clientX-(rect.left+rect.width/2));if(delta<distance){distance=delta;nearest=index;}});
  selectRevenueDay(chart,nearest);
}
document.addEventListener('pointermove',revenuePointer,{passive:true});
document.addEventListener('pointerdown',revenuePointer,{passive:true});
document.addEventListener('pointerout',event=>{const chart=event.target.closest?.('[data-revenue-chart]');if(chart&&!chart.contains(event.relatedTarget)&&document.activeElement!==chart){const tooltip=chart.querySelector('[data-chart-tooltip]');if(tooltip)tooltip.hidden=true;}});
document.addEventListener('focusin',event=>{if(event.target.matches?.('[data-revenue-chart][tabindex]'))selectRevenueDay(event.target,Number(event.target.dataset.activeIndex ?? event.target.dataset.pointCount-1),{announce:true});});
document.addEventListener('focusout',event=>{if(event.target.matches?.('[data-revenue-chart]')){const tooltip=event.target.querySelector('[data-chart-tooltip]');if(tooltip)tooltip.hidden=true;}});
document.addEventListener('keydown',event=>{
  const chart=event.target.matches?.('[data-revenue-chart][tabindex]')?event.target:null;
  if(!chart||!['ArrowLeft','ArrowRight','Home','End','Escape'].includes(event.key))return;
  event.preventDefault();const count=Number(chart.dataset.pointCount);if(!count)return;
  if(event.key==='Escape'){const tooltip=chart.querySelector('[data-chart-tooltip]');if(tooltip)tooltip.hidden=true;return;}
  const current=Number(chart.dataset.activeIndex ?? count-1);
  const next=event.key==='Home'?0:event.key==='End'?count-1:current+(event.key==='ArrowRight'?1:-1);
  selectRevenueDay(chart,next,{announce:true});
});
window.addEventListener('hashchange', () => { render(); window.scrollTo({top:0,behavior:'instant'}); $('#main')?.focus({preventScroll:true}); });
mobileQuery.addEventListener('change', () => { menuOpen = false; render(); });
document.addEventListener('keydown', event => {
  if (!menuOpen || modal.open) return;
  if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); return; }
  if (event.key !== 'Tab') return;
  const controls=[...document.querySelectorAll('#main-sidebar button:not(:disabled), #main-sidebar a[href]')].filter(el=>el.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&(document.activeElement===first||!$('#main-sidebar').contains(document.activeElement))){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!$('#main-sidebar').contains(document.activeElement))){event.preventDefault();first?.focus();}
});
await initializeApp();
