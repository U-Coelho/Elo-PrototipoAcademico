import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAdminWorkspace,renderCreatorInbox} from '../src/components/admin-workspace.js';

const fixture = () => ({actorId:'admin1',actor:{id:'admin1',name:'Rafael',role:'admin'},accounts:[
  {id:'admin1',name:'Rafael',role:'admin',banned:false},{id:'creator1',name:'Marina',role:'creator',banned:false},{id:'creator2',name:'João',role:'creator',banned:false},{id:'supporter1',name:'Ana',role:'supporter',banned:false}],
  campaigns:[{id:'c1',title:'Projeto A',creatorId:'creator1',creator:'Marina',category:'Jogos',raisedCents:15000},{id:'c2',title:'Projeto B',creatorId:'creator2',creator:'João',category:'Artes',raisedCents:5000,deletedAt:'2026-11-23T12:00:00Z',deletedBy:'admin1',deletionReason:'Revisão do conteúdo'}],
  projectComments:[{id:'comment1',campaignId:'c1',authorId:'supporter1',authorName:'Ana',body:'Pergunta sobre o projeto',createdAt:'2026-11-22T12:00:00Z'},{id:'comment2',campaignId:'c2',authorId:'supporter1',authorName:'Ana',body:'Comentário removido',createdAt:'2026-11-22T13:00:00Z',removedAt:'2026-11-23T12:00:00Z',removedBy:'admin1',removalReason:'Conteúdo fora das regras'}],
  contributions:[{id:'support1',campaignId:'c1',supporterId:'supporter1',creatorId:'creator1'}],
  directMessages:[{id:'m1',creatorId:'creator1',senderId:'admin1',body:'Orientação para Marina',createdAt:'2026-11-23T10:00:00Z'},{id:'m2',creatorId:'creator2',senderId:'admin1',body:'Privado de João',createdAt:'2026-11-23T09:00:00Z'},{id:'m3',creatorId:'creator1',senderId:'creator1',body:'Resposta da Marina',createdAt:'2026-11-23T11:00:00Z'}],
  accountModerations:[],auditLog:[{id:'e1',actorId:'admin1',action:'campaign.deleted',resourceId:'c2',description:'Projeto B excluído',createdAt:'2026-11-23T12:00:00Z'},{id:'e2',actorId:'supporter1',action:'payment.confirmed',resourceId:'support1',description:'Apoio confirmado',createdAt:'2026-11-23T11:00:00Z'},{id:'e3',actorId:'admin1',action:'account.banned',resourceId:'creator1',relatedAccountIds:['creator1'],description:'Conta moderada',createdAt:'2026-11-23T10:00:00Z'}]});

test('workspace administrativo exige o perfil de administrador e limita conteúdo privilegiado',()=>{
  const state=fixture();state.actor={id:'supporter1',role:'supporter'};
  const html=renderAdminWorkspace({state});
  assert.match(html,/disponível ao perfil de administrador/);
  assert.doesNotMatch(html,/Privado de João|data-action="moderate-|direct-message-form|Apoio confirmado/);
});

test('abas e filtros expõem os contratos de navegação sem mostrar todos os painéis',()=>{
  const html=renderAdminWorkspace({state:fixture(),activeTab:'contas'});
  assert.match(html,/id="admin-tab-contas"[^>]*aria-selected="true"[^>]*tabindex="0"/);
  assert.match(html,/id="admin-panel-projetos"[^>]* hidden/);
  for(const id of ['admin-project-status','admin-account-status','admin-comment-status','admin-account-filter','message-creator'])assert.ok(html.includes(`id="${id}"`));
  assert.match(renderAdminWorkspace({state:fixture(),activeTab:'invalida'}),/id="admin-tab-projetos"[^>]*aria-selected="true"/);
});

test('projetos excluídos oferecem restauração com motivo e filtro próprio',()=>{
  const html=renderAdminWorkspace({state:fixture(),statusFilters:{projects:'excluidos'}});
  const panel=html.match(/id="admin-panel-projetos"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(panel,/Projeto A/);
  assert.match(panel,/Projeto B/);
  assert.match(panel,/Revisão do conteúdo/);
  assert.match(panel,/data-action="moderate-project" data-id="c2" data-value="restore"/);
});

test('contas exibem banimento e levam ao perfil para moderar',()=>{
  const state=fixture();state.accounts[1].banned=true;state.accountModerations=[{id:'am1',accountId:'creator1',banned:true,reason:'Descumprimento das regras',updatedAt:'2026-11-23T12:00:00Z',updatedBy:'admin1'}];
  const html=renderAdminWorkspace({state});
  assert.doesNotMatch(html,/data-action="moderate-account"/);
  assert.match(html,/data-action="account-profile" data-id="creator1"/);
  assert.match(html,/data-action="account-profile" data-id="admin1"/);
  assert.match(html,/Descumprimento das regras/);
});

test('comentários preservam autoria e motivo, com remoção e restauração reversíveis',()=>{
  const html=renderAdminWorkspace({state:fixture()});
  assert.match(html,/data-action="moderate-comment" data-id="comment1" data-value="remove"/);
  assert.match(html,/data-action="moderate-comment" data-id="comment2" data-value="restore"/);
  assert.match(html,/Conteúdo fora das regras/);
  assert.match(html,/Pergunta sobre o projeto/);
});

test('inbox exige identidade do próprio criador e não inclui conversas de outras contas',()=>{
  const state=fixture();state.actor={id:'creator1',name:'Marina',role:'creator'};
  const html=renderCreatorInbox({state,creatorId:'creator1'});
  assert.match(html,/Orientação para Marina/);assert.match(html,/Resposta da Marina/);
  assert.doesNotMatch(html,/Privado de João/);
  assert.ok(html.indexOf('Orientação para Marina')<html.indexOf('Resposta da Marina'));
  assert.match(html,/id="direct-message-form" data-creator-id="creator1"/);
  assert.match(html,/>Rafael<\/strong>/);
  assert.doesNotMatch(renderCreatorInbox({state,creatorId:'creator2'}),/Orientação para Marina|Privado de João|direct-message-form/);
});

test('criador suspenso consulta conversa sem enviar e banido não recebe o histórico',()=>{
  const state=fixture();state.accounts[1].suspended=true;state.actor={id:'creator1',role:'creator',suspended:true};
  const html=renderCreatorInbox({state,creatorId:'creator1'});
  assert.match(html,/<textarea[^>]* disabled/);assert.match(html,/<button type="submit" class="btn" disabled>/);
  state.actor.banned=true;
  assert.doesNotMatch(renderCreatorInbox({state,creatorId:'creator1'}),/Orientação para Marina|Resposta da Marina|direct-message-form/);
  state.actor={id:'admin1',role:'admin'};
  const admin=renderAdminWorkspace({state,selectedCreatorId:'creator1'});
  assert.match(admin,/pode enviar orientações/);
  assert.doesNotMatch(admin,/<textarea[^>]* disabled/);
});

test('contas distinguem suspensão e banimento com prazo e acesso ao perfil',()=>{
  const state=fixture();state.accounts[1]={...state.accounts[1],suspended:true,restricted:true,moderationExpiresAt:'2026-12-01T12:00:00Z'};state.accounts[2].banned=true;
  const html=renderAdminWorkspace({state,statusFilters:{accounts:'suspensos'}});
  const panel=html.match(/id="admin-panel-contas"[\s\S]*?<\/section>/)[0];
  assert.match(panel,/Suspensa/);assert.match(panel,/2026-12-01T12:00:00.000Z/);assert.match(panel,/Ver perfil/);assert.doesNotMatch(panel,/data-action="moderate-account"/);
  assert.doesNotMatch(panel,/>João</);
  const banned=renderAdminWorkspace({state,statusFilters:{accounts:'banidos'}}).match(/id="admin-panel-contas"[\s\S]*?<\/section>/)[0];
  assert.match(banned,/Prazo indefinido/);assert.match(banned,/Banida/);assert.doesNotMatch(banned,/>Marina</);
});

test('log de punição preserva tipo e prazo da decisão administrativa',()=>{
  const state=fixture();state.auditLog.push({id:'e5',actorId:'admin1',action:'account.suspended',resourceId:'creator1',relatedAccountIds:['creator1'],description:'Conta suspensa para novas operações.',reason:'Revisão de conteúdo.',type:'suspension',expiresAt:'2026-12-01T12:00:00Z',createdAt:'2026-11-23T14:00:00Z'});
  const panel=renderAdminWorkspace({state,activeTab:'logs'}).match(/id="admin-panel-logs"[\s\S]*?<\/section>/)[0];
  assert.match(panel,/Suspensão · até/);assert.match(panel,/2026-12-01T12:00:00.000Z/);assert.match(panel,/Revisão de conteúdo/);
});

test('logs por conta abrangem eventos relacionados e não exibem corpo de mensagem privada',()=>{
  const state=fixture();state.auditLog.push({id:'e4',actorId:'admin1',action:'chat.message_sent',resourceId:'m1',description:'CORPO PRIVADO NÃO DEVE APARECER NO LOG',createdAt:'2026-11-23T13:00:00Z'});
  const html=renderAdminWorkspace({state,selectedAccountId:'creator1'});
  const panel=html.match(/id="admin-panel-logs"[\s\S]*?<\/section>/)[0];
  assert.match(panel,/Apoio confirmado/);assert.match(panel,/Conta moderada/);assert.match(panel,/Mensagem registrada na conversa privada/);
  assert.doesNotMatch(panel,/Projeto B excluído|CORPO PRIVADO/);
  const override=renderAdminWorkspace({state,auditEntries:[]}).match(/id="admin-panel-logs"[\s\S]*?<\/section>/)[0];
  assert.match(override,/Nenhum evento corresponde/);
});

test('nomes, comentários, mensagens e motivos são tratados como texto',()=>{
  const state=fixture();state.accounts[1].name='<script>nome()</script>';state.campaigns[0].title='<script>projeto()</script>';state.projectComments[0].body='<iframe>comentario</iframe>';state.directMessages[0].body='<img src=x onerror=alert(1)>';state.campaigns[1].deletionReason='<svg onload=alert(1)>razão</svg>';
  const html=renderAdminWorkspace({state,selectedCreatorId:'creator1'});
  assert.match(html,/&lt;script&gt;nome\(\)&lt;\/script&gt;/);assert.match(html,/&lt;iframe&gt;comentario&lt;\/iframe&gt;/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<script>|<iframe>|<img src=x|<svg onload/);
});
