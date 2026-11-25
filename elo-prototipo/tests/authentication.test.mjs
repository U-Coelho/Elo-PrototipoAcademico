import sharp from 'sharp';
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createEmbeddedPool} from '../server/db/embedded.mjs';
import {createPostgresRepository} from '../server/repository/postgres.js';
import {createAuthentication} from '../server/auth/authentication.mjs';
import {hashPassword,verifyPassword} from '../server/auth/passwords.mjs';
import {createApp} from '../server/http/app.mjs';
let pool,server,base;
let authTime=Date.now();
// Functional scenarios share one app; keep their admission windows independent.
beforeEach(()=>{authTime+=16*60*1000;});
const password='Uma frase fictícia para testes 2026!';
before(async()=>{
  pool=await createEmbeddedPool();const repository=createPostgresRepository(pool);await repository.initialize();
  const authentication=createAuthentication({pool,repository,clock:()=>authTime});await authentication.workspace();
  await pool.query('INSERT INTO auth_users(id,username,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',['admin1','admin','admin@example.test','admin',await hashPassword(password)]);
  server=createApp({repository:authentication.repository,authentication,sessionSecret:'segredo-ficticio-com-mais-de-32-caracteres'});
  server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await pool?.end();});
async function client(){
  let cookie='',csrf='',state;
  async function request(path,body,headers={}){
    const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json','X-CSRF-Token':csrf}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    const result=await response.json();if(result.state)state=result.state;if(result.csrfToken)csrf=result.csrfToken;
    return {status:response.status,body:result};
  }
  await request('/api/state');
  return {request,avatar:(body,type='image/png',headers={})=>fetch(base+'/api/profile/avatar',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':type,...headers},body}),removeAvatar:()=>fetch(base+'/api/profile/avatar',{method:'DELETE',headers:{Cookie:cookie,'X-CSRF-Token':csrf}}),get state(){return state;},get cookie(){return cookie;},command:(command,payload={})=>request('/api/commands',{command,payload}),register:async(username,role='creator')=>{const r=await request('/api/auth/register',{username,email:`${username}@example.test`,role,password});await request('/api/state');return r;},login:async(identifier)=>{const r=await request('/api/auth/login',{identifier,password});await request('/api/state');return r;}};
}
test('visitante não recebe conteúdo e cadastro não concede privilégios administrativos',async()=>{
  const c=await client();assert.equal(c.state.auth.authenticated,false);assert.deepEqual(c.state.campaigns,[]);
  assert.equal((await c.command('switchActor',{id:'admin1'})).status,401);
  for(const input of [{username:'intruso',email:'i@example.test',role:'admin',password},{username:'admin',email:'a@example.test',role:'creator',password},{username:'valido',email:'v@example.test',role:'creator',password:'curta'}])assert.equal((await c.request('/api/auth/register',input)).status,400);
  assert.equal((await c.request('/api/auth/login',{identifier:'admin',password},{'X-CSRF-Token':'errado'})).status,403);
  assert.equal((await c.request('/api/auth/login',{identifier:'admin',password},{Origin:'https://outro.example'})).status,403);
});
test('cadastro identifica o campo inválido e explica espaços no usuário',async()=>{
  const c=await client(),base={username:'usuario_valido',email:'validacao@example.test',role:'creator',password};
  for(const [patch,field,explanation] of [[{username:'Mario Rodrigues'},'username',/sem espaços/],[{username:'mr'},'username',/3 a 32/],[{username:'admin'},'username',/reservado/],[{email:'email-invalido'},'email',/e-mail válido/],[{role:''},'role',/Selecione o tipo/],[{password:'curta'},'password',/12 a 128/]]){
    const result=await c.request('/api/auth/register',{...base,...patch});
    assert.equal(result.status,400);assert.equal(result.body.error.field,field);assert.match(result.body.error.message,explanation);
    assert.equal(result.body.state,undefined);
  }
});
test('criador autenticado publica com autoria da sessão e e-mail privado',async()=>{
  const creator=await client();assert.equal((await creator.register('criador_teste')).status,200);
  const id=creator.state.actor.id;assert.match(id,/^user-/);assert.equal(creator.state.actor.email,'criador_teste@example.test');
  const created=await creator.command('createCampaign',{title:'Projeto da conta real',description:'Projeto com autoria derivada da sessão autenticada.',category:'Jogos',goalCents:100000,daysLeft:30,monthly:false,rewards:[],creatorId:'admin1'});
  assert.equal(created.status,200);assert.equal(created.body.result.creatorId,id);
  assert.equal((await creator.command('switchActor',{id:'admin1'})).status,403);assert.equal((await creator.command('reset')).status,403);
  const second=await client();assert.equal((await second.login('CRIADOR_TESTE@EXAMPLE.TEST')).status,200);assert.equal(second.state.actor.id,id);
  assert.ok(second.state.campaigns.some(c=>c.creatorId===id));
  const viewer=await client();await viewer.register('apoiador_teste','supporter');
  assert.equal(viewer.state.accounts.find(a=>a.id===id).email,undefined);assert.equal(viewer.state.actors.length,1);
  assert.doesNotMatch(JSON.stringify(viewer.state),/password_hash|scrypt\$/);
  assert.equal((await viewer.command('updateCampaign',{campaignId:created.body.result.id,title:'Tentativa de alteração'})).status,403);
});
test('favoritos, comentários e finanças pertencem à conta autenticada',async()=>{
  const first=await client();await first.register('primeiro_apoio','supporter');
  const second=await client();await second.register('segundo_apoio','supporter');
  await first.command('toggleSaved',{id:'c1'});await second.request('/api/state');assert.deepEqual(second.state.savedCampaignIds,[]);
  assert.ok(first.state.savedCampaignIds.includes('c1'));
  const comment=await first.command('createProjectComment',{campaignId:'c1',body:'Comentário autenticado.',authorId:'admin1'});
  assert.equal(comment.status,200);assert.equal(comment.body.result.authorId,first.state.actor.id);
  const contribution=await first.command('createContribution',{campaignId:'c1',amountCents:5000,mode:'once',idempotencyKey:'real-account-contribution'});
  assert.equal(contribution.status,200);await first.command('simulatePayment',{id:contribution.body.result.id,outcome:'confirmed'});
  await second.request('/api/state');assert.deepEqual(second.state.contributions,[]);assert.deepEqual(second.state.ledger,[]);
  assert.equal((await second.command('simulatePayment',{id:contribution.body.result.id,outcome:'confirmed'})).status,403);
});
test('logout revoga cookie no servidor e a senha fica somente como hash',async()=>{
  const c=await client();await c.register('logout_teste','supporter');const oldCookie=c.cookie;
  assert.equal((await c.request('/api/auth/logout',{})).status,200);
  const replay=await fetch(base+'/api/state',{headers:{Cookie:oldCookie}});assert.equal((await replay.json()).state.auth.authenticated,false);
  await c.request('/api/state');assert.equal((await c.request('/api/auth/login',{identifier:'logout_teste',password:'Uma senha incorreta longa.'})).status,401);
  assert.equal((await c.login('logout_teste')).status,200);
  const row=(await pool.query("SELECT password_hash FROM auth_users WHERE username='logout_teste'")).rows[0];
  assert.notEqual(row.password_hash,password);assert.equal(await verifyPassword(password,row.password_hash),true);
});
test('administrador fixo consulta contatos e pune contas reais',async()=>{
  const creator=await client();await creator.register('punicao_teste');const id=creator.state.actor.id;
  const admin=await client();assert.equal((await admin.login('admin')).status,200);assert.equal(admin.state.actor.id,'admin1');
  assert.equal(admin.state.accounts.find(a=>a.id===id).email,'punicao_teste@example.test');
  assert.equal((await admin.command('moderateAccount',{accountId:id,type:'suspension',expiresAt:null,reason:'Suspensão de teste autenticado.'})).status,200);
  await creator.request('/api/state');assert.equal(creator.state.actor.suspended,true);assert.ok(creator.state.campaigns.length);
  assert.equal((await creator.command('createProjectComment',{campaignId:'c1',body:'Bloqueado.'})).status,403);
  await admin.command('moderateAccount',{accountId:id,type:'ban',expiresAt:null,reason:'Banimento de teste autenticado.'});
  await creator.request('/api/state');assert.equal(creator.state.accessBlocked,true);assert.deepEqual(creator.state.campaigns,[]);
  await admin.command('moderateAccount',{accountId:id,type:'none',expiresAt:null,reason:'Liberação após revisão autenticada.'});
  await creator.request('/api/state');assert.equal(creator.state.actor.restricted,false);
});
test('unicidade ignora maiúsculas, só há um administrador e tentativas inválidas são limitadas',async()=>{
  const c=await client();await c.register('unicidade_teste');const second=await client();
  assert.equal((await second.request('/api/auth/register',{username:'UNICIDADE_TESTE',email:'outro@example.test',role:'supporter',password})).status,409);
  assert.equal((await second.request('/api/auth/register',{username:'outro_unico',email:'UNICIDADE_TESTE@EXAMPLE.TEST',role:'supporter',password})).status,409);
  assert.equal(Number((await pool.query("SELECT count(*) FROM auth_users WHERE role='admin'")).rows[0].count),1);
  for(let i=0;i<8;i++)assert.equal((await second.request('/api/auth/login',{identifier:'nao_existe',password})).status,401);
  assert.equal((await second.request('/api/auth/login',{identifier:'nao_existe',password})).status,429);
  const hashA=await hashPassword(password),hashB=await hashPassword(password);assert.notEqual(hashA,hashB);
  assert.equal(await verifyPassword('Senha incorreta mas longa.',hashA),false);
});

test('foto de apoiador persiste, exige sessão/CSRF e só pode ser alterada pelo próprio usuário',async()=>{
  const owner=await client();await owner.register('foto_apoiador','supporter');
  const photo=await sharp({create:{width:30,height:50,channels:3,background:'#8899aa'}}).png().toBuffer();
  const anonymous=await fetch(base+'/api/profile/avatar',{method:'POST',headers:{'Content-Type':'image/png'},body:photo});assert.equal(anonymous.status,401);
  assert.equal((await owner.avatar(photo,'image/png',{'X-CSRF-Token':'errado'})).status,403);
  assert.equal((await owner.avatar(Buffer.from('<svg/>'),'image/png')).status,400);
  assert.equal((await owner.avatar(Buffer.alloc(2*1024*1024+1),'image/png')).status,413);
  assert.equal((await owner.avatar(photo)).status,200);await owner.request('/api/state');const url=owner.state.actor.avatarUrl;
  assert.match(url,/^\/api\/avatars\/user-/);
  assert.equal((await fetch(base+url)).status,401);
  const read=await fetch(base+url,{headers:{Cookie:owner.cookie}});assert.equal(read.status,200);assert.equal(read.headers.get('content-type'),'image/jpeg');assert.equal((await sharp(Buffer.from(await read.arrayBuffer())).metadata()).width,512);
  const other=await client();await other.register('foto_criador','creator');
  assert.equal((await other.removeAvatar()).status,200);assert.equal((await fetch(base+url,{headers:{Cookie:owner.cookie}})).status,200);
  const admin=await client();await admin.login('admin');
  assert.equal((await admin.command('updateCreatorProfile',{creatorId:owner.state.actor.id,bio:'Alteração proibida',links:[]})).status,403);
  await admin.command('moderateAccount',{accountId:owner.state.actor.id,type:'suspension',expiresAt:null,reason:'Teste de suspensão da foto.'});
  assert.equal((await owner.avatar(photo)).status,403);assert.equal((await owner.removeAvatar()).status,403);
  await admin.command('moderateAccount',{accountId:owner.state.actor.id,type:'none',expiresAt:null,reason:'Teste de foto concluído.'});
  assert.equal((await owner.removeAvatar()).status,200);await owner.request('/api/state');assert.equal(owner.state.actor.avatarUrl,null);
  assert.equal((await fetch(base+url,{headers:{Cookie:owner.cookie}})).status,404);
});
test('criador autenticado apoia sem herdar direitos de dono e apoiador mantém perfil próprio',async()=>{
  const creator=await client();await creator.register('criador_apoia');
  const before=creator.state.summary.availableBalanceCents;
  const support=await creator.command('createContribution',{campaignId:'c1',amountCents:5000,mode:'once',idempotencyKey:'creator-real-pledge'});
  assert.equal(support.status,200);assert.equal((await creator.command('simulatePayment',{id:support.body.result.id,outcome:'confirmed'})).status,200);
  assert.equal(creator.state.summary.totalSupportedCents,5000);assert.equal(creator.state.summary.availableBalanceCents,before);
  assert.equal((await creator.command('updateCampaign',{campaignId:'c1',title:'Tentativa de editar campanha apoiada'})).status,403);
  const supporter=await client();await supporter.register('perfil_apoiador','supporter');
  assert.equal((await supporter.command('updateCreatorProfile',{bio:'Meu perfil como apoiador.',links:[]})).status,200);
  const reloaded=await client();await reloaded.login('perfil_apoiador');assert.equal(reloaded.state.creatorProfiles.find(p=>p.creatorId===reloaded.state.actor.id).bio,'Meu perfil como apoiador.');
});
