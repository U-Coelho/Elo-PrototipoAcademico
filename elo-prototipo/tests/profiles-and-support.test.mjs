import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatform} from '../server/domain/platform.js';
import {renderCreatorProfile} from '../src/components/creator-profile.js';
import {renderCreatorProfileForm} from '../src/components/project-forms.js';
import {avatarContent} from '../src/components/avatar.js';
import {processAvatar} from '../server/profile/avatar.mjs';
import sharp from 'sharp';
const code=expected=>error=>error.code===expected;
test('criador apoia outro projeto e acompanha cobranças sem gastar o saldo recebido',()=>{
  const p=createPlatform();p.switchActor('creator1');const before=p.getSummary();
  const support=p.createContribution({campaignId:'c2',amountCents:5000,mode:'monthly',idempotencyKey:'creator-pledge'});
  p.simulatePayment(support.id);assert.equal(p.getSummary().totalSupportedCents,5000);assert.equal(p.getSummary().totalReceivedCents,before.totalReceivedCents);
  assert.equal(p.getSummary().availableBalanceCents,before.availableBalanceCents);assert.equal(p.getSummary().activeSubscriptions,1);
  assert.ok(p.getPublicState().contributions.some(c=>c.id===support.id));assert.ok(p.getPublicState().contributions.some(c=>c.supporterId==='supporter1'));
  const renewal=p.renewSubscription({contributionId:support.id,idempotencyKey:'creator-renewal'});p.simulatePayment(renewal.id);
  assert.equal(p.getSummary().totalSupportedCents,10000);assert.equal(p.getSummary().availableBalanceCents,before.availableBalanceCents);
  p.cancelSubscription(support.id);assert.equal(p.getSummary().activeSubscriptions,0);
  assert.throws(()=>p.createContribution({campaignId:'c1',amountCents:5000,idempotencyKey:'own'}),code('SELF_SUPPORT_UNAVAILABLE'));
});
test('apoiador edita seu perfil; nenhuma conta pode editar perfil de terceiros',()=>{
  const p=createPlatform();const edited=p.updateCreatorProfile({bio:'Minha apresentação como apoiadora.',links:[{label:'Site',url:'https://example.test'}]});
  assert.equal(edited.creatorId,'supporter1');assert.equal(p.getPublicState().creatorProfiles.find(c=>c.creatorId==='supporter1').bio,edited.bio);
  assert.throws(()=>p.createCampaign({}),code('FORBIDDEN'));assert.throws(()=>p.updateCreatorProfile({creatorId:'creator1',bio:'Alteração indevida'}),code('FORBIDDEN'));
  p.switchActor('admin1');assert.throws(()=>p.updateCreatorProfile({creatorId:'supporter1',bio:'Alteração administrativa'}),code('FORBIDDEN'));
  assert.throws(()=>p.updateCampaign({campaignId:'c1',title:'Alteração administrativa'}),code('FORBIDDEN'));
});
test('perfis mostram a foto e reservam seu editor a Editar perfil; administrador só vê punições',()=>{
  for(const role of ['creator','supporter']){
    const account={id:'person',name:'Pessoa',role,bio:'Bio',links:[],avatarUrl:'/api/avatars/person?v=1'};
    const own=renderCreatorProfile(account,{actor:account,account,canEdit:true});assert.doesNotMatch(own,/id="avatar-form"|id="profile-photo-file"|data-action="remove-profile-photo"/);assert.match(own,/data-action="edit-creator-profile"/);assert.match(own,/Foto de Pessoa/);
    const edit=renderCreatorProfileForm(account,account);assert.match(edit,/id="avatar-form"/);assert.match(edit,/id="creator-profile-form"/);assert.match(edit,/data-action="remove-profile-photo"/);
    const admin=renderCreatorProfile(account,{actor:{id:'admin1',role:'admin'},account,canEdit:true});
    assert.match(admin,/data-action="moderate-account"/);assert.doesNotMatch(admin,/data-action="edit-creator-profile"|account-logs|id="avatar-form"/);
  }
  assert.doesNotMatch(avatarContent({name:'Pessoa',avatarUrl:'https://evil.example/photo.svg'}),/<img/);
});
test('foto é decodificada, recortada e regravada sem metadados; arquivos disfarçados são rejeitados',async()=>{
  const original=await sharp({create:{width:40,height:20,channels:3,background:'#aabbcc'}}).jpeg().withExif({IFD0:{Artist:'Metadado de teste'}}).toBuffer();
  const result=await processAvatar(original),meta=await sharp(result).metadata();
  assert.equal(meta.format,'jpeg');assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.exif,undefined);
  for(const data of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),Buffer.from('texto'),Buffer.from([137,80,78,71,13,10,26,10])])await assert.rejects(processAvatar(data),code('INVALID_AVATAR'));
});
