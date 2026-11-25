import {readAvatar} from '../profile/avatar.mjs';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createPlatform,createSeedState} from '../domain/platform.js';
import {hashPassword,verifyPassword} from './passwords.mjs';
import {createAuthThrottle} from '../security/limits.mjs';
import {ensureRegistrationCapacity,insertRegisteredUser} from './registration.mjs';
import {createProjectMedia} from '../profile/project-media.mjs';
import {imageWork} from '../profile/project-image.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const safeUser=row=>({id:row.id,name:row.username,username:row.username,role:row.role,firstName:row.username,initials:row.username.slice(0,2).toUpperCase(),roleLabel:row.role==='creator'?'Criador':row.role==='admin'?'Administrador':'Apoiador',joinedAt:new Date(row.created_at).toISOString(),avatarUrl:row.avatar_updated_at?`/api/avatars/${encodeURIComponent(row.id)}?v=${new Date(row.avatar_updated_at).getTime()}`:null});
const failure=(status,code,message)=>Object.assign(new Error(message),{status,code});
export function createAuthentication({pool,repository,secure=false,clock=()=>Date.now(),maxRegisteredUsers=10000}){
  if(!Number.isSafeInteger(maxRegisteredUsers)||maxRegisteredUsers<1||maxRegisteredUsers>10000)throw new RangeError('Limite de contas inválido.');
  let workspacePromise,dummyPromise;const throttle=createAuthThrottle({clock});
  const workspace=()=>workspacePromise??=(async()=>{
    let setting=(await pool.query('SELECT workspace_id FROM platform_settings WHERE singleton=true')).rows[0];
    if(setting)return setting.workspace_id;
    const previous=(await pool.query('SELECT id FROM demo_workspaces ORDER BY updated_at DESC LIMIT 1')).rows[0];
    const id=previous?.id||await repository.createWorkspace(createSeedState());
    await pool.query('INSERT INTO platform_settings(singleton,workspace_id) VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING',[id]);
    return (await pool.query('SELECT workspace_id FROM platform_settings WHERE singleton=true')).rows[0].workspace_id;
  })();
  async function users(){return (await pool.query('SELECT u.id,u.username,u.email,u.role,u.created_at,a.updated_at AS avatar_updated_at FROM auth_users u LEFT JOIN account_avatars a ON a.account_id=u.id ORDER BY u.created_at,u.id')).rows;}
  async function enrich(state,registered){registered??=await users();state.registeredActors=registered.map(safeUser);
    for(const user of registered)if(['creator','supporter'].includes(user.role)&&!state.creatorProfiles.some(p=>p.creatorId===user.id))state.creatorProfiles.push({id:`profile-${user.id}`,creatorId:user.id,bio:'',links:[],joinedAt:new Date(user.created_at).toISOString()});
    return state;
  }
  const wrapped={...repository,read:async id=>enrich(await repository.read(id)),transact:async(id,fn)=>{const registered=await users();return repository.transact(id,async(state,client)=>fn(await enrich(state,registered),client));}};
  const projectMedia=createProjectMedia({pool,repository:wrapped,resolve,check});
  const cookie=token=>`elo_auth=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure?'; Secure':''}`;
  async function resolve(request){
    const token=String(request.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith('elo_auth='))?.slice(9);
    if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
    const row=(await pool.query(`SELECT s.*,u.role FROM auth_sessions s LEFT JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2`,[digest(token),new Date(clock()).toISOString()])).rows[0];
    return row?{tokenHash:row.token_hash,actorId:row.user_id,csrfToken:row.csrf_token,workspaceId:await workspace()}:null;
  }
  async function issue(response,userId=null,previous=null){
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('base64url');
    await pool.query('DELETE FROM auth_sessions WHERE expires_at<=$1',[new Date(clock()).toISOString()]);
    if(previous)await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[previous.tokenHash]);
    await pool.query('INSERT INTO auth_sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)',[digest(token),userId,csrf,new Date(clock()+604800000).toISOString()]);
    response.setHeader('Set-Cookie',cookie(token));return {actorId:userId,csrfToken:csrf,workspaceId:await workspace(),tokenHash:digest(token)};
  }
  function check(request,session){
    const origin=request.headers.origin,expected=`${secure?'https':'http'}://${request.headers.host}`;
    if((origin&&origin!==expected)||request.headers['sec-fetch-site']==='cross-site')throw failure(403,'ORIGIN_REJECTED','Origem não permitida.');
    if(!session||!equal(request.headers['x-csrf-token'],session.csrfToken))throw failure(403,'CSRF_REJECTED','Recarregue a página antes de continuar.');
  }
  async function decorate(snapshot,session){
    const registered=await users(),own=registered.find(u=>u.id===session.actorId);
    snapshot.auth={enabled:true,authenticated:true};snapshot.actor={...snapshot.actor,username:own.username,email:own.email};
    snapshot.actors=[snapshot.actor];
    snapshot.accounts=snapshot.accounts.map(a=>({...a,...(a.id===session.actorId||own.role==='admin'?{email:registered.find(u=>u.id===a.id)?.email||null}:{})}));
    return projectMedia.decorate(snapshot,session);
  }
  function guest(){const actor={id:'guest',name:'Visitante',role:'guest',initials:'',firstName:'Visitante'};return {actorId:'guest',actor,actors:[actor],auth:{enabled:true,authenticated:false},campaigns:[],contributions:[],accounts:[],savedCampaignIds:[],summary:{},ledger:[],payouts:[],creatorProfiles:[],projectComments:[],projectUpdates:[],auditLog:[]};}
  async function handle({request,response,url,send,readJson}){
    if(url.pathname==='/api/profile/avatar'||url.pathname.startsWith('/api/avatars/'))return handleAvatar({request,response,url,send});
    if(await projectMedia.handle({request,response,url,send}))return true;
    if(!url.pathname.startsWith('/api/auth/'))return false;
    if(request.method!=='POST')throw failure(405,'METHOD_NOT_ALLOWED','Use POST.');
    const session=await resolve(request);check(request,session);const body=await readJson(request);
    if(url.pathname==='/api/auth/logout'){await issue(response,null,session);send(response,200,{ok:true});return true;}
    if(!['/api/auth/login','/api/auth/register'].includes(url.pathname))throw failure(404,'NOT_FOUND','Rota não encontrada.');
    const identifier=String(url.pathname.endsWith('/register')?body.email||'':body.identifier||body.email||'').trim().toLowerCase();
    const ip=request.socket.remoteAddress||'local';throttle.check(ip,identifier);
    let user;
    if(url.pathname.endsWith('/register')){
      const username=typeof body.username==='string'?body.username.trim():'';
      const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const invalid=(field,message)=>Object.assign(failure(400,'INVALID_REGISTRATION',message),{field});
      if(username.length<3||username.length>32)throw invalid('username','O usuário precisa ter de 3 a 32 caracteres.');
      if(!/^[a-zA-Z0-9_.-]+$/.test(username))throw invalid('username','No usuário, use letras sem acento, números, ponto, traço ou sublinhado, sem espaços. Exemplo: mario_rodrigues.');
      if(['admin','administrador','system'].includes(username.toLowerCase()))throw invalid('username','Esse nome de usuário é reservado. Escolha outro.');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw invalid('email','Informe um e-mail válido, como nome@example.test.');
      if(!['creator','supporter'].includes(body.role))throw invalid('role','Selecione o tipo de conta: Criador ou Apoiador.');
      const workspaceId=await workspace();
      await ensureRegistrationCapacity(pool,workspaceId,maxRegisteredUsers);
      if((await pool.query('SELECT 1 FROM auth_users WHERE lower(username)=$1 OR lower(email)=$2 LIMIT 1',[username.toLowerCase(),email])).rowCount)throw failure(409,'ACCOUNT_EXISTS','Usuário ou e-mail indisponível.');
      const passwordHash=await throttle.run(()=>hashPassword(body.password)),id=`user-${randomUUID()}`;
      try{user=await insertRegisteredUser(pool,workspaceId,[id,username,email,body.role,passwordHash],maxRegisteredUsers);}
      catch(error){if(error.code==='23505')throw failure(409,'ACCOUNT_EXISTS','Usuário ou e-mail indisponível.');throw error;}
    }else{
      user=(await pool.query('SELECT * FROM auth_users WHERE lower(email)=$1 OR lower(username)=$1',[identifier])).rows[0];
      const valid=await throttle.run(async()=>{
        if(!user)dummyPromise??=hashPassword(randomBytes(24).toString('hex')).catch(error=>{dummyPromise=null;throw error;});
        return verifyPassword(body.password,user?.password_hash||await dummyPromise);
      });
      if(!user||!valid)throw failure(401,'INVALID_CREDENTIALS','Usuário/e-mail ou senha incorretos.');
    }
    throttle.success(ip,identifier);await issue(response,user.id,session);send(response,200,{ok:true});return true;
  }
  async function handleAvatar({request,response,url,send}){
    const session=await resolve(request);if(!session?.actorId)throw failure(401,'SESSION_REQUIRED','Entre na sua conta para continuar.');
    const state=await wrapped.read(session.workspaceId),api=createPlatform({initialState:state});api.switchActor(session.actorId);
    if(api.getActor().banned)throw failure(403,'ACCOUNT_BANNED','O acesso à conta está bloqueado.');
    if(url.pathname.startsWith('/api/avatars/')){
      if(request.method!=='GET')throw failure(405,'METHOD_NOT_ALLOWED','Use GET.');
      const id=url.pathname.slice('/api/avatars/'.length);
      if(!/^[a-zA-Z0-9_-]{1,160}$/.test(id))throw failure(404,'NOT_FOUND','Foto não encontrada.');
      const target=api.getPublicState().accounts.find(a=>a.id===id);
      if(!target||(target.banned&&api.getActor().role!=='admin'))throw failure(404,'NOT_FOUND','Foto não encontrada.');
      const row=(await pool.query('SELECT image FROM account_avatars WHERE account_id=$1',[id])).rows[0];
      if(!row)throw failure(404,'NOT_FOUND','Foto não encontrada.');
      response.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-cache','Content-Disposition':'inline'});response.end(Buffer.from(row.image));return true;
    }
    if(!['POST','DELETE'].includes(request.method))throw failure(405,'METHOD_NOT_ALLOWED','Use POST ou DELETE.');
    check(request,session);
    if(api.getActor().restricted)throw failure(403,'ACCOUNT_SUSPENDED','A conta está suspensa para alterações.');
    if(!['creator','supporter'].includes(api.getActor().role))throw failure(403,'FORBIDDEN','A foto só pode ser alterada pelo dono do perfil.');
    const image=request.method==='POST'?await imageWork.run(()=>readAvatar(request)):null;
    await wrapped.transact(session.workspaceId,async(stored,client)=>{
      const service=createPlatform({initialState:stored});service.switchActor(session.actorId);service.profilePhotoChanged(!image);
      if(image)await client.query('INSERT INTO account_avatars(account_id,image,updated_at) VALUES($1,$2,now()) ON CONFLICT(account_id) DO UPDATE SET image=excluded.image,updated_at=excluded.updated_at',[session.actorId,image]);
      else await client.query('DELETE FROM account_avatars WHERE account_id=$1',[session.actorId]);
      return {state:service.getState(),result:{ok:true}};
    });
    send(response,200,{ok:true});return true;
  }
  return {repository:wrapped,workspace,resolve,issue,decorate,guest,handle};
}
