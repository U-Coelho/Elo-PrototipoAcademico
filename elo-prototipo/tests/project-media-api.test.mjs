import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {authenticatedFixture,projectPayload,projectForm} from './helpers/authenticated-fixture.mjs';

let app,owner,other,viewer,admin,photo;
before(async()=>{
  app=await authenticatedFixture();owner=await app.client('media_owner');other=await app.client('media_other');viewer=await app.client('media_viewer');admin=await app.client('admin');
  photo=await sharp({create:{width:50,height:35,channels:3,background:'#98a2b3'}}).png().withExif({IFD0:{Artist:'Metadado da fixture'}}).toBuffer();
});
after(async()=>app?.close());
async function createWithPhoto(){const response=await owner.raw('/api/projects',{body:projectForm(projectPayload(),photo)});assert.equal(response.status,201);const json=await response.json();await owner.request('/api/state');return owner.state.campaigns.find(c=>c.id===json.result.id);}

test('criação com capa normalizada é atômica, autenticada e persiste após outra mutação',async()=>{
  const project=await createWithPhoto();assert.match(project.image,/^\/api\/project-images\/.+\?v=\d+$/);
  const read=await viewer.raw(project.image);assert.equal(read.status,200);assert.equal(read.headers.get('content-type'),'image/jpeg');
  const bytes=Buffer.from(await read.arrayBuffer()),meta=await sharp(bytes).metadata();assert.equal(meta.width,1280);assert.equal(meta.height,800);assert.equal(meta.exif,undefined);
  assert.equal((await fetch(app.base+project.image)).status,401);
  assert.equal((await owner.command('updateCreatorProfile',{bio:'Uma bio que regrava o agregado.',links:[]})).status,200);
  const again=await owner.raw(project.image);assert.equal(again.status,200);assert.deepEqual(Buffer.from(await again.arrayBuffer()),bytes);
  assert.equal(Number((await app.pool.query('SELECT count(*) FROM project_images WHERE campaign_id=$1',[project.id])).rows[0].count),1);
  await owner.command('toggleSaved',{id:project.id});
  const exported=await owner.request('/api/export');assert.equal(exported.status,200);
  assert.equal(exported.body.actor.email,'media_owner@example.test');
  assert.ok(exported.body.savedCampaignIds.includes(project.id));
  assert.equal(exported.body.campaigns.find(c=>c.id===project.id).image,project.image);
  assert.equal(exported.body.accounts,undefined);assert.equal(exported.body.csrfToken,undefined);
  assert.ok(exported.body.creatorProfiles.every(p=>p.creatorId===owner.state.actor.id));
});

test('arquivo disfarçado, campos duplicados e excesso de tamanho não publicam projeto parcial',async()=>{
  await owner.request('/api/state');const beforeCount=owner.state.campaigns.filter(c=>c.creatorId===owner.state.actor.id).length;
  for(const [bytes,type,status] of [[Buffer.from('<svg onload="alert(1)"/>'),'image/png',400],[Buffer.from('não é foto'),'image/jpeg',400],[Buffer.alloc(5*1024*1024+1),'image/png',413]]){
    const result=await owner.raw('/api/projects',{body:projectForm(projectPayload(),bytes,type)});assert.equal(result.status,status);
  }
  const duplicated=projectForm(projectPayload(),photo);duplicated.append('payload',JSON.stringify(projectPayload({title:'Duplicado indevido'})));
  assert.equal((await owner.raw('/api/projects',{body:duplicated})).status,400);
  await owner.request('/api/state');assert.equal(owner.state.campaigns.filter(c=>c.creatorId===owner.state.actor.id).length,beforeCount);
});

test('somente o dono ativo altera a capa, com CSRF; remoção volta ao preset',async()=>{
  const project=await createWithPhoto(),path=`/api/projects/${project.id}/image`;
  for(const account of [other,viewer,admin])assert.equal((await account.raw(path,{body:photo,headers:{'Content-Type':'image/png'}})).status,403);
  assert.equal((await owner.raw(path,{body:photo,headers:{'Content-Type':'image/png','X-CSRF-Token':'errado'}})).status,403);
  assert.equal((await owner.raw(path,{body:photo,headers:{'Content-Type':'image/png',Origin:'https://outro.example'}})).status,403);
  assert.equal((await owner.raw(path,{body:photo,headers:{'Content-Type':'image/png'}})).status,200);
  assert.equal((await owner.raw(path,{method:'DELETE'})).status,200);
  await owner.request('/api/state');assert.match(owner.state.campaigns.find(c=>c.id===project.id).image,/^assets\/campaign-[1-6]\.svg$/);
  assert.equal((await owner.raw(project.image)).status,404);
});

test('imagem compacta acima de 16 MP e WebP animado são recusados sem alterar a capa',async()=>{
  const project=await createWithPhoto(),path=`/api/projects/${project.id}/image`;
  const oversized=await sharp({create:{width:4001,height:4000,channels:3,background:'#555555'}}).png().toBuffer();
  assert.ok(oversized.length<5*1024*1024);
  const pixels=Buffer.from([...Array(4).fill([255,0,0,255]).flat(),...Array(4).fill([0,0,255,255]).flat()]);
  const animated=await sharp(pixels,{raw:{width:2,height:4,channels:4,pageHeight:2}}).webp({loop:0,delay:[100,100]}).toBuffer();
  assert.equal((await sharp(animated,{animated:true}).metadata()).pages,2);
  const previous=Buffer.from(await (await owner.raw(project.image)).arrayBuffer());
  for(const [bytes,type] of [[oversized,'image/png'],[animated,'image/webp']]){
    const result=await owner.raw(path,{body:bytes,headers:{'Content-Type':type}});assert.equal(result.status,400);assert.equal((await result.json()).error.code,'INVALID_PROJECT_IMAGE');
  }
  assert.deepEqual(Buffer.from(await (await owner.raw(project.image)).arrayBuffer()),previous);
});

test('localização opcional do perfil atualiza projetos existentes, novos e pode ser apagada',async()=>{
  const location={city:'Franca',region:'SP',countryCode:'BR'};
  assert.equal((await owner.command('updateCreatorProfile',{bio:'Perfil localizado.',links:[],location})).status,200);
  const created=await owner.command('createCampaign',projectPayload());assert.equal(created.status,200);assert.equal(created.body.result.location,'Franca, SP');
  assert.ok(owner.state.campaigns.filter(c=>c.creatorId===owner.state.actor.id).every(c=>c.location==='Franca, SP'));
  assert.equal((await owner.command('updateCreatorProfile',{bio:'Outro local.',links:[],location:{city:'Curitiba',region:'PR',countryCode:'BR'}})).status,200);
  assert.ok(owner.state.campaigns.filter(c=>c.creatorId===owner.state.actor.id).every(c=>c.location==='Curitiba, PR'));
  assert.equal((await owner.command('updateCreatorProfile',{bio:'Sem local público.',links:[],location:null})).status,200);
  assert.ok(owner.state.campaigns.filter(c=>c.creatorId===owner.state.actor.id).every(c=>!c.location));
  assert.equal((await owner.command('updateCreatorProfile',{bio:'Inválido.',links:[],location:{city:'Franca',region:'XX',countryCode:'BR'}})).status,400);
});

test('suspensão conserva leitura da capa mas bloqueia alteração; banimento bloqueia leitura do titular',async()=>{
  const project=await createWithPhoto(),id=owner.state.actor.id,path=`/api/projects/${project.id}/image`;
  try {
    assert.equal((await admin.command('moderateAccount',{accountId:id,type:'suspension',expiresAt:null,reason:'Verificação de upload suspenso.'})).status,200);
    assert.equal((await owner.raw(path,{body:photo,headers:{'Content-Type':'image/png'}})).status,403);
    assert.equal((await owner.raw(path,{method:'DELETE'})).status,403);assert.equal((await owner.raw(project.image)).status,200);
    await admin.command('moderateAccount',{accountId:id,type:'ban',expiresAt:null,reason:'Verificação de leitura banida.'});
    assert.equal((await owner.raw(project.image)).status,403);assert.equal((await viewer.raw(project.image)).status,404);
  } finally {await admin.command('moderateAccount',{accountId:id,type:'none',expiresAt:null,reason:'Verificação de imagem concluída.'});}
});
