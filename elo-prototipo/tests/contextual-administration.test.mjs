import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCreatorProfile} from '../src/components/creator-profile.js';
import {renderAccountPunishmentForm,renderCampaignForm,renderCampaignSettingsForm,renderCreatorProfileForm,renderModerationForm} from '../src/components/project-forms.js';

const creator={id:'creator1',name:'Marina',role:'creator',bio:'Cultivo e comunidade.',joinedAt:'2026-10-01T12:00:00Z',links:[],projectCount:2};
const admin={id:'admin1',role:'admin'};

test('localização opcional é editável como cidade e UF e aparece no perfil público',()=>{
  const location={city:'Belo Horizonte',region:'MG',countryCode:'BR'};
  const html=renderCreatorProfileForm({location},creator);
  assert.match(html,/name="city"[^>]*value="Belo Horizonte"/);
  assert.match(html,/name="region"/);
  assert.match(html,/value="MG" selected/);
  assert.match(html,/públic[ao]/i);
  assert.doesNotMatch(html,/name="city"[^>]*required|name="region"[^>]*required/);
  assert.match(renderCreatorProfile({...creator,location}),/Belo Horizonte, MG/);
  assert.doesNotMatch(renderCreatorProfile({...creator,location:null}),/Brasil|Localização/);
});

test('criação tem seleção opcional de capa e configuração mostra e permite remover a capa atual',()=>{
  assert.match(renderCampaignForm(['Jogos']),/type="file"[^>]*name="thumbnail"[^>]*accept="image\/jpeg,image\/png,image\/webp"/);
  const html=renderCampaignSettingsForm({id:'c1',title:'Projeto',description:'Descrição',category:'Jogos',daysLeft:10,goalCents:10000,image:'/api/project-images/c1?v=1'},['Jogos']);
  assert.ok(html.includes('src="/api/project-images/c1?v=1"'));
  assert.match(html,/data-action="remove-project-image"/);
  assert.match(html,/data-action="upload-project-image"/);
});

test('prévia de exclusão informa saldo em falta, efeitos e bloqueia confirmação',()=>{
  const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
  const preview={campaignId:'c1',requiredCents:8000,availableCents:5000,shortfallCents:3000,confirmedCount:2,pendingCount:3,subscriptionCount:1,canDelete:false};
  const html=renderModerationForm({targetName:'Projeto',actionLabel:'Excluir projeto',danger:true,deletionPreview:preview,reason:'Projeto encerrado'});
  assert.match(html,/2 apoios confirmados/);
  assert.match(html,/3 pagamentos pendentes/);
  assert.match(html,/1 assinatura/);
  assert.ok(html.includes(money(8000))&&html.includes(money(5000))&&html.includes(money(3000)));
  assert.match(html,/histórico/i);
  assert.match(html,/type="submit"[^>]*disabled/);
  assert.match(html,/>Projeto encerrado<\/textarea>/);
  assert.doesNotMatch(renderModerationForm({targetName:'Projeto',actionLabel:'Excluir projeto',danger:true,deletionPreview:{...preview,canDelete:true,shortfallCents:0}}),/type="submit"[^>]*disabled/);
});

test('perfil oferece somente punições à administração',()=>{
  const options={actor:admin,account:{...creator,suspended:true,moderationExpiresAt:'2026-12-01T12:00:00Z',moderationReason:'Revisão de conteúdo.'}};
  const html=renderCreatorProfile(creator,options);
  assert.doesNotMatch(html,/data-action="edit-creator-profile"/);
  assert.match(html,/data-action="moderate-account" data-id="creator1" data-value="punish"/);
  assert.match(html,/data-action="moderate-account" data-id="creator1" data-value="release"/);
  assert.doesNotMatch(html,/data-action="account-logs"/);
  assert.match(html,/Suspensão ativa/);assert.match(html,/01\/12\/2026/);assert.match(html,/Revisão de conteúdo/);
  assert.doesNotMatch(renderCreatorProfile(creator,{actor:creator}),/Administrar conta|data-action="moderate-account"|data-action="account-logs"/);
});

test('perfil genérico permite moderar autor apoiador sem permitir editar seu perfil',()=>{
  const html=renderCreatorProfile({id:'supporter1',name:'Ana',role:'supporter'}, {actor:admin});
  assert.match(html,/Apoiador/);assert.match(html,/data-action="moderate-account" data-id="supporter1"/);
  assert.doesNotMatch(html,/data-action="edit-creator-profile"|Projetos criados/);
  assert.doesNotMatch(renderCreatorProfile({...creator,id:'admin1',role:'admin'},{actor:admin}),/data-action="moderate-account"/);
});

test('formulário distingue punições e exige motivo com prazo finito ou indefinido',()=>{
  const html=renderAccountPunishmentForm({targetName:'Marina',current:{moderationType:'suspension'}});
  assert.match(html,/form id="account-punishment-form"/);
  assert.match(html,/option value="suspension" selected/);
  for(const duration of ['1h','1d','7d','30d','indefinite','custom'])assert.match(html,new RegExp(`option value="${duration}"`));
  assert.match(html,/id="punishment-custom-until" hidden/);
  assert.match(html,/id="punishment-until" name="expiresAt" disabled/);
  assert.match(html,/name="reason" minlength="5" maxlength="500" required/);
  assert.match(html,/Banimento bloqueia o acesso/);
  assert.match(html,/Suspensão permite visualizar/);
});

test('nomes e motivos contextuais são escapados e datas inválidas não quebram o formulário',()=>{
  const unsafe='<img src=x onerror=alert(1)>';
  const html=renderCreatorProfile({...creator,name:unsafe},{actor:admin,account:{...creator,banned:true,moderationReason:unsafe}});
  assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);
  const form=renderAccountPunishmentForm({targetName:unsafe,current:{expiresAt:'data inválida'}});
  assert.doesNotMatch(form,/<img src=x|Invalid Date/);assert.match(form,/&lt;img/);
});

test('alterar punição conserva prazo existente e precisão em vez de reiniciar uma duração',()=>{
  const expiresAt='2026-12-01T12:34:56.789Z';
  const html=renderAccountPunishmentForm({targetName:'Marina',current:{restricted:true,moderationType:'ban',moderationExpiresAt:expiresAt}});
  assert.match(html,/option value="custom" selected/);
  assert.doesNotMatch(html,/id="punishment-custom-until" hidden/);
  const value=html.match(/name="expiresAt" required value="([^"]+)"/)[1];
  assert.equal(new Date(value).toISOString(),expiresAt);
  const indefinite=renderAccountPunishmentForm({targetName:'Marina',current:{restricted:true,moderationType:'suspension',moderationExpiresAt:null}});
  assert.match(indefinite,/option value="indefinite" selected/);
  assert.match(renderAccountPunishmentForm({targetName:'Marina'}),/option value="7d" selected/);
});
