import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform,createSeedState} from '../server/domain/platform.js';

const code = expected => error => error.code === expected;
const reason = 'Revisão de conteúdo pela administração.';
const support = (p,overrides={}) => p.createContribution({campaignId:'c1',amountCents:5000,mode:'once',idempotencyKey:'admin-test-support',...overrides});
const admin = p => {p.switchActor('admin1');return p;};
const financial = p => ({ledger:p.getState().ledger,contributions:p.getState().contributions,payouts:p.getState().payouts,totals:p.getState().campaigns.map(c=>[c.id,c.raisedCents,c.rewardRaisedCents,c.backers])});

test('criador edita somente seu projeto, preservando valores, recompensas e comprovantes',()=>{
  const p=createPlatform(),receipt=support(p);p.simulatePayment(receipt.id);p.switchActor('creator1');
  const before=financial(p),rewards=p.getCampaign('c1').rewards;
  const edited=p.updateCampaign({campaignId:'c1',title:'Verde em novos espaços',description:'Novas oficinas e hortas compartilhadas nos espaços do bairro.',story:'Etapas revisadas para criar as hortas e acompanhar o cultivo.',goalCents:20000000,daysLeft:45,monthly:true});
  assert.equal(edited.title,'Verde em novos espaços');assert.equal(edited.daysLeft,45);
  assert.deepEqual(edited.rewards,rewards);assert.deepEqual(financial(p),before);
  assert.equal(p.getState().contributions.find(c=>c.id===receipt.id).campaignTitle,'Verde no concreto');
  assert.throws(()=>p.updateCampaign({campaignId:'c2',title:'Tentativa de edição alheia'}),code('FORBIDDEN'));
  p.switchActor('supporter1');assert.throws(()=>p.updateCampaign({campaignId:'c1',title:'Tentativa de edição'}),code('FORBIDDEN'));
  admin(p);assert.throws(()=>p.updateCampaign({campaignId:'c2',title:'Álbum independente revisado'}),code('FORBIDDEN'));
});

test('validação da configuração é atômica e não permite apagar contratos mensais em andamento',()=>{
  const p=createPlatform();p.switchActor('creator1');const before=p.getCampaign('c1');
  for(const patch of [{title:'curto',goalCents:1},{title:'<script>injetar</script>'},{story:'<img src=x onerror=1>'},{category:'Categoria inventada'},{daysLeft:91},{monthly:'false'}])
    assert.throws(()=>p.updateCampaign({campaignId:'c1',...patch}));
  assert.deepEqual(p.getCampaign('c1'),before);
  assert.throws(()=>p.updateCampaign({campaignId:'c1',monthly:false}),code('INVALID_MODE'));
  const c=p.createCampaign({title:'Oficinas do bairro',description:'Encontros de aprendizagem e criação com a comunidade.',category:'Educação',goalCents:100000,monthly:true});
  p.switchActor('supporter1');const root=support(p,{campaignId:c.id,mode:'monthly',idempotencyKey:'monthly-empty-rewards'});p.simulatePayment(root.id);
  p.switchActor('creator1');assert.throws(()=>p.updateCampaign({campaignId:c.id,monthly:false}),code('INVALID_MODE'));
});

test('exclusão administrativa exige motivo e a restauração conserva as devoluções',()=>{
  const p=createPlatform();const receipt=support(p);p.simulatePayment(receipt.id);const originalLedger=p.getState().ledger;
  assert.throws(()=>p.moderateCampaign({campaignId:'c1',deleted:true,reason}),code('FORBIDDEN'));
  admin(p);assert.throws(()=>p.moderateCampaign({campaignId:'c1',deleted:true,reason:'x'}),code('INVALID_MODERATION'));
  const hidden=p.moderateCampaign({campaignId:'c1',deleted:true,reason});assert.equal(hidden.deletedBy,'admin1');assert.equal(hidden.deletionReason,reason);assert.ok(Date.parse(hidden.deletedAt));
  const eventCount=p.audit().length;assert.equal(p.moderateCampaign({campaignId:'c1',deleted:true,reason}).duplicate,true);assert.equal(p.audit().length,eventCount);
  assert.deepEqual(p.getState().ledger.filter(l=>l.type!=='refund'),originalLedger);
  assert.equal(hidden.deletionSummary.refundedCents,12500);
  const settled=financial(p);
  assert.equal(p.getPublicState('supporter1').campaigns.some(c=>c.id==='c1'),false);
  assert.ok(p.getPublicState('creator1').campaigns.find(c=>c.id==='c1').deletedAt);
  const restored=p.moderateCampaign({campaignId:'c1',deleted:false,reason:'Revisão concluída e conteúdo liberado.'});assert.equal(restored.deletedAt,undefined);
  assert.ok(p.getPublicState('supporter1').campaigns.some(c=>c.id==='c1'));assert.deepEqual(financial(p),settled);
});

test('projeto excluído não aceita novas contribuições, publicações ou confirmações pendentes',()=>{
  const p=createPlatform(),pending=support(p);admin(p);p.moderateCampaign({campaignId:'c1',deleted:true,reason});
  p.switchActor('supporter1');assert.throws(()=>p.getCampaign('c1'),code('NOT_FOUND'));
  assert.throws(()=>support(p,{idempotencyKey:'after-delete'}),code('PROJECT_UNAVAILABLE'));
  assert.throws(()=>p.simulatePayment(pending.id),code('INVALID_TRANSITION'));
  assert.throws(()=>p.createProjectComment({campaignId:'c1',body:'Pergunta sobre a proposta.'}),code('PROJECT_UNAVAILABLE'));
  p.switchActor('creator1');assert.throws(()=>p.updateCampaign({campaignId:'c1',title:'Projeto excluído editado'}),code('PROJECT_UNAVAILABLE'));
  assert.throws(()=>p.createProjectUpdate({campaignId:'c1',title:'Nova etapa',body:'Etapa de preparação.'}),code('PROJECT_UNAVAILABLE'));
  admin(p);assert.throws(()=>p.simulatePayment(pending.id,'failed'),code('INVALID_TRANSITION'));
});

test('banimento de criador oculta campanhas públicas e bloqueia mutações sem alterar saldos',()=>{
  const p=createPlatform(),before=financial(p);admin(p);p.moderateAccount({accountId:'creator1',banned:true,reason});
  assert.deepEqual(financial(p),before);assert.equal(p.getPublicState('supporter1').campaigns.some(c=>c.creatorId==='creator1'),false);
  assert.equal(p.getPublicState('creator1').campaigns.length,0);assert.equal(p.getPublicState('creator1').accessBlocked,true);
  assert.equal(p.getPublicState('creator1').actor.banned,true);assert.equal(p.getPublicState('creator1').actor.banReason,reason);assert.equal(p.getPublicState('creator1').actors.find(a=>a.id==='creator1').banReason,reason);
  assert.equal(p.getPublicState('supporter1').accounts.find(a=>a.id==='creator1').banReason,undefined);
  assert.equal(p.getPublicState('admin1').accounts.find(a=>a.id==='creator1').banReason,reason);
  p.switchActor('creator1');
  for(const run of [()=>p.updateCreatorProfile({bio:'Nova bio',links:[]}),()=>p.createCampaign({}),()=>p.requestPayout({amountCents:500,idempotencyKey:'payout'}),()=>p.createProjectUpdate({campaignId:'c1',title:'Etapa nova',body:'Nova etapa.'}),()=>p.sendDirectMessage({creatorId:'creator1',body:'Nova mensagem.'}),()=>p.reset()])assert.throws(run,code('ACCOUNT_BANNED'));
  admin(p);assert.equal(p.sendDirectMessage({creatorId:'creator1',body:'A conta está em revisão de conteúdo.'}).senderId,'admin1');
  p.moderateAccount({accountId:'creator1',banned:false,reason:'Revisão concluída e conta liberada.'});
  p.switchActor('creator1');assert.equal(p.getActor().banned,false);assert.equal(p.updateCreatorProfile({bio:'Criadora de oficinas.',links:[]}).bio,'Criadora de oficinas.');assert.deepEqual(financial(p),before);
});

test('banimento de apoiador bloqueia pagamentos, novas cobranças e acesso à assinatura',()=>{
  const p=createPlatform(),pending=support(p);admin(p);p.moderateAccount({accountId:'supporter1',banned:true,reason});p.switchActor('supporter1');
  const before=financial(p);
  for(const run of [()=>support(p,{idempotencyKey:'after-ban'}),()=>p.simulatePayment(pending.id),()=>p.renewSubscription({contributionId:'support-2',idempotencyKey:'after-ban-renew'}),()=>p.toggleSaved('c1'),()=>p.createProjectComment({campaignId:'c2',body:'Outra pergunta.'})])assert.throws(run,code('ACCOUNT_BANNED'));
  assert.deepEqual(financial(p),before);
  assert.throws(()=>p.cancelSubscription('support-2'),code('ACCOUNT_BANNED'));
  assert.equal(p.getPublicState('supporter1').contributions.length,0);
  assert.equal(p.getState().contributions.find(c=>c.id===pending.id).status,'pending');
  admin(p);assert.throws(()=>p.simulatePayment(pending.id),code('ACCOUNT_BANNED'));assert.equal(p.simulatePayment(pending.id,'failed').status,'failed');
});

test('administração não pode banir a própria conta e os demais papéis não moderam',()=>{
  const p=createPlatform();admin(p);assert.throws(()=>p.moderateAccount({accountId:'admin1',banned:true,reason}),code('FORBIDDEN'));
  assert.throws(()=>p.moderateAccount({accountId:'inexistente',banned:true,reason}),code('NOT_FOUND'));
  p.switchActor('creator1');
  for(const run of [()=>p.moderateAccount({accountId:'supporter1',banned:true,reason}),()=>p.moderateCampaign({campaignId:'c2',deleted:true,reason}),()=>p.moderateComment({commentId:'inexistente',removed:true,reason}),()=>p.auditForAccount('creator1')])assert.throws(run,code('FORBIDDEN'));
});

test('comentários removidos podem ser restaurados sem perder autoria, texto ou histórico financeiro',()=>{
  const p=createPlatform(),comment=p.createProjectComment({campaignId:'c1',body:'Quando começa a preparação das hortas?'}),before=financial(p);admin(p);
  const hidden=p.moderateComment({commentId:comment.id,removed:true,reason});assert.equal(hidden.authorName,'Ana Souza');assert.equal(hidden.body,comment.body);assert.equal(hidden.removedBy,'admin1');
  assert.equal(p.getPublicState('supporter1').projectComments.length,0);assert.equal(p.getPublicState('admin1').projectComments.length,1);
  p.moderateComment({commentId:comment.id,removed:false,reason:'Comentário reavaliado e permitido.'});
  assert.equal(p.getPublicState('creator1').projectComments[0].body,comment.body);assert.deepEqual(financial(p),before);
  p.moderateAccount({accountId:'supporter1',banned:true,reason});assert.equal(p.getPublicState('creator1').projectComments.length,0);
  p.moderateAccount({accountId:'supporter1',banned:false,reason:'Conta reavaliada e liberada.'});assert.equal(p.getPublicState('creator1').projectComments.length,1);
});

test('conversa direta é privada entre administração e o criador correspondente',()=>{
  const p=createPlatform();admin(p);
  const first=p.sendDirectMessage({creatorId:'creator1',body:'Vamos conferir a apresentação do projeto.',senderId:'supporter1'});
  p.sendDirectMessage({creatorId:'creator2',body:'Podemos conferir as etapas da gravação?'});
  assert.equal(first.senderId,'admin1');assert.equal(p.getPublicState('supporter1').directMessages.length,0);assert.equal(p.getPublicState('creator1').directMessages.length,1);assert.equal(p.getPublicState('admin1').directMessages.length,2);
  p.switchActor('creator1');assert.equal(p.sendDirectMessage({creatorId:'creator1',body:'Atualizei a apresentação e o cronograma.'}).senderId,'creator1');
  assert.throws(()=>p.sendDirectMessage({creatorId:'creator2',body:'Mensagem para outro criador.'}),code('FORBIDDEN'));
  p.switchActor('supporter1');assert.throws(()=>p.sendDirectMessage({creatorId:'creator1',body:'Mensagem privada.'}),code('FORBIDDEN'));
});

test('mensagens e motivos rejeitam HTML, controles e limites excedidos',()=>{
  const p=createPlatform();admin(p);
  for(const body of ['', ' ', '<script>executar</script>', 'x'.repeat(2001),'texto\u0000inválido'])assert.throws(()=>p.sendDirectMessage({creatorId:'creator1',body}),code('INVALID_MESSAGE'));
  for(const invalid of ['', 'x', '<b>motivo</b>','x'.repeat(501),'razão\u0000inválida'])assert.throws(()=>p.moderateCampaign({campaignId:'c1',deleted:true,reason:invalid}),code('INVALID_MODERATION'));
  assert.throws(()=>p.sendDirectMessage({creatorId:'admin1',body:'Mensagem sem criador.'}),code('FORBIDDEN'));
  assert.throws(()=>p.sendDirectMessage({creatorId:'desconhecido',body:'Mensagem sem conta.'}),code('NOT_FOUND'));
  assert.equal(p.getState().directMessages.length,0);
});

test('logs por conta incluem ações de terceiros no recurso e não copiam o conteúdo privado da conversa',()=>{
  const p=createPlatform(),receipt=support(p);p.simulatePayment(receipt.id);const comment=p.createProjectComment({campaignId:'c1',body:'Pergunta da comunidade.'});
  p.switchActor('creator1');p.updateCreatorProfile({bio:'Criadora de espaços de cultivo.',links:[]});p.createProjectUpdate({campaignId:'c1',title:'Materiais preparados',body:'Começaremos a organização dos espaços.'});
  admin(p);p.moderateComment({commentId:comment.id,removed:true,reason});p.moderateCampaign({campaignId:'c1',deleted:true,reason});p.sendDirectMessage({creatorId:'creator1',body:'CONTEÚDO PRIVADO SOMENTE NA CONVERSA'});
  const filtered=p.auditForAccount('creator1');assert.ok(filtered.length>=7);assert.ok(filtered.every(e=>e.relatedAccountIds.includes('creator1')));
  assert.ok(filtered.some(e=>e.actorId==='supporter1'&&e.action==='payment.confirmed'));assert.ok(filtered.some(e=>e.actorId==='admin1'&&e.action==='comment.removed'&&e.reason===reason));
  assert.doesNotMatch(JSON.stringify(filtered),/CONTEÚDO PRIVADO SOMENTE/);assert.equal(p.auditForAccount('creator2').some(e=>e.action==='comment.removed'),false);
  assert.throws(()=>p.auditForAccount('desconhecido'),code('NOT_FOUND'));
});

test('motivo de 500 caracteres e novos registros sobrevivem à restauração sem mudar dados históricos',()=>{
  const p=createPlatform(),longReason='x'.repeat(500);admin(p);
  p.moderateCampaign({campaignId:'c1',deleted:true,reason:longReason});p.moderateAccount({accountId:'creator1',banned:true,reason:longReason});p.sendDirectMessage({creatorId:'creator1',body:'A decisão ficará disponível no histórico.'});
  const snapshot=p.getState(),restored=createPlatform({initialState:snapshot});
  assert.deepEqual(financial(restored),financial(p));assert.equal(restored.getState().accountModerations[0].reason.length,500);assert.equal(restored.getState().directMessages.length,1);
  assert.ok(restored.auditForAccount('creator1').some(e=>e.reason?.length===500));
  restored.getState().accountModerations[0].banned=false;assert.equal(restored.getState().accountModerations[0].banned,true);assert.deepEqual(snapshot,p.getState());
});

test('upgrade antigo acrescenta coleções e relações do log sem reclassificar finanças',()=>{
  const state=createSeedState();delete state.accountModerations;delete state.directMessages;for(const event of state.auditLog)delete event.relatedAccountIds;
  const before=structuredClone(state),p=createPlatform({initialState:state});
  assert.deepEqual(p.getState().accountModerations,[]);assert.deepEqual(p.getState().directMessages,[]);assert.deepEqual(p.getState().ledger,before.ledger);assert.deepEqual(state,before);
  assert.ok(p.getPublicState().accounts.some(a=>a.id==='creator5'&&a.role==='creator'));
});

test('corrupção de moderação, autoria e relações do log não é reparada silenciosamente',()=>{
  const base=createSeedState();
  for(const corrupt of [s=>s.accountModerations.push({id:'ban',accountId:'admin1',banned:true,reason,updatedAt:new Date().toISOString(),updatedBy:'admin1'}),s=>s.directMessages.push({id:'message-bad',creatorId:'creator1',senderId:'supporter1',body:'Mensagem falsificada.',createdAt:new Date().toISOString()}),s=>s.campaigns[0].deletedAt='ontem',s=>s.auditLog[0].relatedAccountIds='creator1']){
    const state=structuredClone(base);corrupt(state);assert.throws(()=>createPlatform({initialState:state}),code('INVALID_STATE'));
  }
});


test('suspensão permite leitura, preserva publicações e bloqueia operações até o prazo exato',()=>{
  let time=Date.parse('2026-11-23T15:00:00.000Z');const p=createPlatform({clock:()=>time}),expiresAt=new Date(time+3600000).toISOString();
  admin(p);p.sendDirectMessage({creatorId:'creator1',body:'Histórico disponível durante a revisão.'});
  const before=financial(p);p.moderateAccount({accountId:'creator1',type:'suspension',expiresAt,reason});
  const publicView=p.getPublicState('supporter1');assert.ok(publicView.campaigns.some(c=>c.id==='c1'));
  p.switchActor('creator1');const view=p.getPublicState();assert.equal(view.accessBlocked,false);assert.equal(view.actor.banned,false);assert.equal(view.actor.suspended,true);assert.equal(view.actor.restricted,true);assert.equal(view.actor.moderationType,'suspension');assert.equal(view.actor.moderationExpiresAt,expiresAt);assert.equal(view.actor.moderationReason,reason);assert.equal(view.directMessages.length,1);
  assert.ok(p.listCampaigns().length);assert.ok(p.getSummary().availableBalanceCents>0);
  for(const run of [()=>p.updateCreatorProfile({bio:'Outra bio',links:[]}),()=>p.createCampaign({}),()=>p.createProjectComment({campaignId:'c2',body:'Uma pergunta.'}),()=>p.sendDirectMessage({creatorId:'creator1',body:'Nova mensagem.'}),()=>p.reset()])assert.throws(run,code('ACCOUNT_SUSPENDED'));
  time+=3599999;assert.equal(p.getActor().suspended,true);time++;assert.equal(p.getActor().moderationType,'none');assert.equal(p.getActor().restricted,false);assert.equal(p.getActor().moderationReason,null);assert.equal(p.updateCreatorProfile({bio:'Conta liberada pelo término do prazo.',links:[]}).bio,'Conta liberada pelo término do prazo.');
  assert.deepEqual(financial(p),before);assert.equal(p.getState().accountModerations[0].type,'suspension');assert.equal(p.getState().accountModerations[0].expiresAt,expiresAt);
});

test('banimento oculta os dados da conta e encerra automaticamente no prazo sem apagar o histórico',()=>{
  let time=Date.parse('2026-11-23T15:00:00.000Z');const p=createPlatform({clock:()=>new Date(time)}),before=financial(p),expiresAt=new Date(time+60000).toISOString();
  admin(p);p.sendDirectMessage({creatorId:'creator1',body:'Informação privada do cenário.'});p.moderateAccount({accountId:'creator1',type:'ban',expiresAt,reason});p.switchActor('creator1');
  const blocked=p.getPublicState();assert.equal(blocked.accessBlocked,true);assert.equal(blocked.actor.moderationType,'ban');assert.equal(blocked.actor.moderationExpiresAt,expiresAt);assert.equal(blocked.actor.moderationReason,reason);assert.equal(blocked.actor.banned,true);
  for(const key of ['campaigns','creatorProfiles','contributions','ledger','payouts','projectUpdates','projectComments','accountModerations','directMessages','auditLog','savedCampaignIds','accounts'])assert.deepEqual(blocked[key],[]);
  assert.ok(Object.values(blocked.summary).every(value=>value===0));assert.doesNotMatch(JSON.stringify(blocked),/Informação privada do cenário/);
  for(const run of [()=>p.getCampaign('c1'),()=>p.listCampaigns(),()=>p.getLedger(),()=>p.getSummary(),()=>p.exportSnapshot(),()=>p.securityDiagnostics()])assert.throws(run,code('ACCOUNT_BANNED'));
  time+=60000;assert.equal(p.getPublicState().accessBlocked,false);assert.ok(p.getCampaign('c1'));assert.equal(p.getActor().banned,false);assert.deepEqual(financial(p),before);
  admin(p);assert.ok(p.auditForAccount('creator1').some(event=>event.action==='account.banned'&&event.type==='ban'&&event.expiresAt===expiresAt&&event.reason===reason));
});

test('suspensão de apoiador bloqueia confirmação e renovação mas permite encerrar assinatura existente',()=>{
  const p=createPlatform(),pending=support(p);admin(p);p.moderateAccount({accountId:'supporter1',type:'suspension',expiresAt:null,reason});p.switchActor('supporter1');const before=financial(p);
  assert.ok(p.getPublicState().contributions.some(c=>c.id===pending.id));
  assert.throws(()=>p.simulatePayment(pending.id),code('ACCOUNT_SUSPENDED'));assert.throws(()=>p.renewSubscription({contributionId:'support-2',idempotencyKey:'suspended-renew'}),code('ACCOUNT_SUSPENDED'));assert.deepEqual(financial(p),before);
  assert.equal(p.cancelSubscription('support-2').subscriptionStatus,'canceled');admin(p);assert.throws(()=>p.simulatePayment(pending.id),code('ACCOUNT_SUSPENDED'));
});

test('punição do criador bloqueia novos apoios e cobrança pendente sem retirar leitura na suspensão',()=>{
  const p=createPlatform(),pending=support(p);admin(p);p.moderateAccount({accountId:'creator1',type:'suspension',expiresAt:null,reason});p.switchActor('supporter1');
  assert.ok(p.getCampaign('c1'));assert.throws(()=>support(p,{idempotencyKey:'suspended-project'}),code('PROJECT_UNAVAILABLE'));assert.throws(()=>p.simulatePayment(pending.id),code('PROJECT_UNAVAILABLE'));assert.throws(()=>p.renewSubscription({contributionId:'support-2',idempotencyKey:'suspended-project-renew'}),code('PROJECT_UNAVAILABLE'));
});

test('troca de punição, alteração de prazo e liberação são registradas sem alterar finanças',()=>{
  const time='2026-11-23T15:00:00.000Z',p=createPlatform({clock:()=>time}),before=financial(p);admin(p);
  p.moderateAccount({accountId:'creator1',type:'suspension',expiresAt:'2026-11-24T15:00:00.000Z',reason});
  const count=p.audit().length;assert.equal(p.moderateAccount({accountId:'creator1',type:'suspension',expiresAt:'2026-11-24T15:00:00.000Z',reason}).duplicate,true);assert.equal(p.audit().length,count);
  p.moderateAccount({accountId:'creator1',type:'suspension',expiresAt:null,reason:'Revisão sem prazo definido.'});assert.equal(p.getPublicState('creator1').actor.moderationExpiresAt,null);
  p.moderateAccount({accountId:'creator1',type:'ban',expiresAt:null,reason:'Acesso bloqueado após nova análise.'});assert.equal(p.getPublicState('creator1').accessBlocked,true);
  p.moderateAccount({accountId:'creator1',type:'none',reason:'Análise concluída e conta liberada.'});assert.equal(p.getPublicState('creator1').actor.restricted,false);assert.equal(p.getPublicState('creator1').accessBlocked,false);
  const events=p.auditForAccount('creator1');assert.ok(events.some(e=>e.action==='account.suspended'));assert.ok(events.some(e=>e.action==='account.banned'&&e.previousType==='suspension'));assert.ok(events.some(e=>e.type==='none'&&e.expiresAt===null));assert.deepEqual(financial(p),before);
});

test('validação rejeita tipo, prazo inválido ou passado antes de alterar a punição',()=>{
  const p=createPlatform({clock:()=> '2026-11-23T15:00:00.000Z'});admin(p);const before=p.getState();
  for(const patch of [{type:'mute'}, {type:'ban',expiresAt:'ontem'}, {type:'ban',expiresAt:'2026-11-23T15:00:00.000Z'}, {type:'suspension',expiresAt:'2026-11-22T15:00:00.000Z'}, {type:'ban',expiresAt:12345}, {type:'none',expiresAt:'2026-12-01T15:00:00.000Z'}, {type:'ban',expiresAt:'2027-02-30T15:00:00.000Z'}])assert.throws(()=>p.moderateAccount({accountId:'creator1',reason,...patch}),code('INVALID_MODERATION'));
  assert.deepEqual(p.getState(),before);
});

test('moderação legada é preservada e dados novos sobrevivem a restauração com prazo efetivo',()=>{
  const state=createSeedState();state.accountModerations=[{id:'moderation-creator1',accountId:'creator1',banned:true,reason,updatedAt:'2026-11-23T14:00:00.000Z',updatedBy:'admin1'}];
  const old=structuredClone(state),p=createPlatform({initialState:state,clock:()=> '2026-11-23T15:00:00.000Z'});assert.equal(p.getPublicState('creator1').accessBlocked,true);assert.equal(p.getState().accountModerations[0].type,'ban');assert.equal(p.getState().accountModerations[0].expiresAt,null);assert.deepEqual(state,old);
  admin(p);p.moderateAccount({accountId:'creator1',type:'suspension',expiresAt:'2026-11-24T15:00:00.000Z',reason});const restored=createPlatform({initialState:p.getState(),clock:()=> '2026-11-24T15:00:00.000Z'});assert.equal(restored.getPublicState('creator1').actor.restricted,false);assert.deepEqual(financial(restored),financial(p));
});

test('administração não edita perfis de criadores ou apoiadores',()=>{
  const p=createPlatform();p.switchActor('creator1');assert.throws(()=>p.updateCreatorProfile({creatorId:'creator2',bio:'Perfil de outra pessoa',links:[]}),code('FORBIDDEN'));
  admin(p);const before=p.getState().creatorProfiles;
  for(const creatorId of ['creator1','creator2','supporter1'])assert.throws(()=>p.updateCreatorProfile({creatorId,bio:'Edição administrativa',links:[]}),code('FORBIDDEN'));
  assert.deepEqual(p.getState().creatorProfiles,before);
});
