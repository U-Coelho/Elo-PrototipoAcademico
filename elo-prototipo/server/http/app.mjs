import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlatform, createSeedState } from '../domain/platform.js';
import { createSessions } from './session.mjs';
import { buildPersonalExport } from '../../src/domain/personal-export.js';

const sourceRoot = fileURLToPath(new URL('../../src/',import.meta.url));
const contentTypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const problem = (status, code, message) => Object.assign(new Error(message),{status,code});
const publicState = (state,actorId,clock) => {
  const service = createPlatform({initialState:state,clock});
  const snapshot = service.getPublicState(actorId);
  return {...snapshot,persistenceAvailable:true,persistence:'postgresql'};
};
const commands = {
  toggleSaved: (p,b) => p.toggleSaved(b.id),
  createContribution: (p,b) => p.createContribution({campaignId:b.campaignId,amountCents:b.amountCents,mode:b.mode,idempotencyKey:b.idempotencyKey,rewardId:b.rewardId}),
  simulatePayment: (p,b) => p.simulatePayment(b.id,b.outcome),
  cancelSubscription: (p,b) => p.cancelSubscription(b.id),
  renewSubscription: (p,b) => p.renewSubscription({contributionId:b.contributionId,idempotencyKey:b.idempotencyKey}),
  requestPayout: (p,b) => p.requestPayout({amountCents:b.amountCents,idempotencyKey:b.idempotencyKey}),
  createCampaign: (p,b) => p.createCampaign({title:b.title,description:b.description,category:b.category,goalCents:b.goalCents,daysLeft:b.daysLeft,monthly:b.monthly,rewards:b.rewards,milestones:b.milestones}),
  updateCreatorProfile: (p,b) => p.updateCreatorProfile({bio:b.bio,links:b.links,creatorId:b.creatorId,location:b.location}),
  createProjectUpdate: (p,b) => p.createProjectUpdate({campaignId:b.campaignId,title:b.title,body:b.body}),
  createProjectComment: (p,b) => p.createProjectComment({campaignId:b.campaignId,body:b.body}),
  updateCampaign: (p,b) => p.updateCampaign({campaignId:b.campaignId,title:b.title,description:b.description,story:b.story,category:b.category,goalCents:b.goalCents,daysLeft:b.daysLeft,monthly:b.monthly,milestones:b.milestones}),
  publishRewardDelivery: (p,b) => p.publishRewardDelivery({contributionId:b.contributionId,message:b.message,url:b.url}),
  acknowledgeRewardDelivery: (p,b) => p.acknowledgeRewardDelivery({deliveryId:b.deliveryId}),
  moderateCampaign: (p,b) => p.moderateCampaign({campaignId:b.campaignId,deleted:b.deleted,reason:b.reason,idempotencyKey:b.idempotencyKey}),
  getCampaignDeletionPreview: (p,b) => p.getCampaignDeletionPreview(b.campaignId),
  moderateAccount: (p,b) => p.moderateAccount({accountId:b.accountId,type:b.type,expiresAt:b.expiresAt,banned:b.banned,reason:b.reason}),
  moderateComment: (p,b) => p.moderateComment({commentId:b.commentId,removed:b.removed,reason:b.reason}),
  sendDirectMessage: (p,b) => p.sendDirectMessage({creatorId:b.creatorId,body:b.body}),
  auditForAccount: (p,b) => p.auditForAccount(b.accountId),
  reset: p => p.reset(),
  diagnostics: p => p.securityDiagnostics(),
};

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw problem(415,'CONTENT_TYPE','Envie o conteúdo como JSON.');
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 32768) throw problem(413,'BODY_TOO_LARGE','A solicitação excede o limite da demonstração.'); chunks.push(chunk); }
  try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; }
  catch { throw problem(400,'INVALID_JSON','A solicitação contém JSON inválido.'); }
}

/** Runtime servers provide authentication with revocable database sessions.
 * The optional persona adapter is kept for isolated legacy tests only.
 * Financial rules and resource authorization always run on this API. */
export function createApp({repository,sessionSecret,secureCookies=false,health=async()=>{},logger=console,clock,authentication=null}) {
  const sessions = createSessions(sessionSecret,{secure:secureCookies});
  const rates = new Map();
  const send = (response,status,body,headers={}) => {
    response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
    response.end(JSON.stringify(body));
  };
  const server = createServer(async (request,response) => {
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    let url;
    try {
      url = new URL(request.url,'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/health' && request.method === 'GET') {
          try { await health(); send(response,200,{ok:true,database:'postgresql',payments:'simulated'}); }
          catch { send(response,503,{ok:false,error:{code:'DB_UNAVAILABLE',message:'O banco não está disponível.'}}); }
          return;
        }
        const key = request.socket.remoteAddress || 'local'; const time = Date.now();
        if (rates.size > 1000) for (const [k,v] of rates) if (v.expires < time) rates.delete(k);
        let rate = rates.get(key); if (!rate || rate.expires < time) { rate = {count:0,expires:time+60000}; rates.set(key,rate); }
        if (++rate.count > 180) throw problem(429,'RATE_LIMIT','Muitas solicitações. Aguarde um minuto e tente novamente.');
        if(authentication&&await authentication.handle({request,response,url,send,readJson}))return;
        let session = authentication?await authentication.resolve(request):sessions.read(request.headers.cookie);
        if (url.pathname === '/api/state' && request.method === 'GET') {
          if(authentication){
            if(!session)session=await authentication.issue(response);
            if(!session.actorId){send(response,200,{state:authentication.guest(),csrfToken:session.csrfToken});return;}
            const snapshot=publicState(await repository.read(session.workspaceId),session.actorId,clock);
            send(response,200,{state:await authentication.decorate(snapshot,session),csrfToken:session.csrfToken});return;
          }
          let state;
          if (session) { try { state = await repository.read(session.workspaceId); } catch(error) { if (error.code !== 'NOT_FOUND') throw error; session = null; } }
          if (!session) { const workspaceId = await repository.createWorkspace(createSeedState()); session = sessions.create(workspaceId); state = await repository.read(workspaceId); response.setHeader('Set-Cookie',sessions.issue(session)); }
          send(response,200,{state:publicState(state,session.actorId,clock),csrfToken:session.csrfToken}); return;
        }
        if (!session||(authentication&&!session.actorId)) throw problem(401,'SESSION_REQUIRED','Recarregue a página para iniciar sua demonstração.');
        if (url.pathname === '/api/export' && request.method === 'GET') {
          const state = await repository.read(session.workspaceId); const api = createPlatform({initialState:state,clock}); api.switchActor(session.actorId);
          if (api.getActor().banned) throw problem(403,'ACCOUNT_BANNED','O acesso a esta conta está bloqueado pelo banimento.');
          let snapshot=api.getPublicState();
          if(authentication)snapshot=await authentication.decorate(snapshot,session);
          send(response,200,buildPersonalExport(snapshot,new Date(clock?clock():Date.now()).toISOString()),{'Content-Disposition':'attachment; filename="elo-meus-dados.json"'}); return;
        }
        if (url.pathname !== '/api/commands') throw problem(404,'NOT_FOUND','Rota não encontrada.');
        if (request.method !== 'POST') throw problem(405,'METHOD_NOT_ALLOWED','Use POST para executar uma operação.');
        const origin = request.headers.origin;
        const protocol = secureCookies ? 'https' : 'http';
        if (origin && origin !== `${protocol}://${request.headers.host}`) throw problem(403,'ORIGIN_REJECTED','A origem da solicitação não é permitida.');
        if (request.headers['sec-fetch-site'] === 'cross-site') throw problem(403,'ORIGIN_REJECTED','Solicitação de outro site bloqueada.');
        if (!sessions.csrfValid(session,request.headers['x-csrf-token'])) throw problem(403,'CSRF_REJECTED','A sessão precisa ser recarregada antes de enviar esta operação.');
        const body = await readJson(request);
        if (typeof body.command !== 'string' || body.command.length > 60 || (body.payload != null && (typeof body.payload !== 'object' || Array.isArray(body.payload)))) throw problem(400,'INVALID_COMMAND','Operação inválida.');
        const payload = body.payload || {};
        if(authentication&&['switchActor','reset'].includes(body.command))throw problem(403,'FORBIDDEN','Esta operação não está disponível em contas autenticadas.');
        if (body.command === 'switchActor') {
          if (!['supporter1','creator1','admin1'].includes(payload.id)) throw problem(400,'INVALID_ACTOR','Personagem não encontrada.');
          session = {...session,actorId:payload.id}; response.setHeader('Set-Cookie',sessions.issue(session));
          const state = await repository.read(session.workspaceId);
          const snapshot=publicState(state,session.actorId,clock);
          send(response,200,{state:snapshot,result:snapshot.actor,csrfToken:session.csrfToken}); return;
        }
        if (!Object.hasOwn(commands,body.command)) throw problem(400,'INVALID_COMMAND','Operação não reconhecida.');
        const result = await repository.transact(session.workspaceId,async stored => {
          const api = createPlatform({initialState:stored,clock}); api.switchActor(session.actorId);
          if (api.getActor().banned) throw problem(403,'ACCOUNT_BANNED','O acesso a esta conta está bloqueado pelo banimento.');
          let value = commands[body.command](api,payload);
          // Reset has no reason to expose the private persistence state.
          if (body.command === 'reset') { api.switchActor(session.actorId); value = {reset:true}; }
          return {state:api.getState(),result:{state:{...api.getPublicState(session.actorId),persistenceAvailable:true,persistence:'postgresql'},result:value,csrfToken:session.csrfToken}};
        });
        if(authentication)result.state=await authentication.decorate(result.state,session);
        send(response,200,result); return;
      }
      if (!['GET','HEAD'].includes(request.method)) throw problem(405,'METHOD_NOT_ALLOWED','Método não permitido.');
      const pathname = decodeURIComponent(url.pathname);
      const target = path.resolve(sourceRoot,`.${pathname === '/' ? '/index.html' : pathname}`);
      const relative = path.relative(sourceRoot,target);
      if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part=>part.startsWith('.')) || !contentTypes[path.extname(target)] || !(await stat(target)).isFile()) throw problem(404,'NOT_FOUND','Recurso não encontrado.');
      response.writeHead(200,{'Content-Type':contentTypes[path.extname(target)],'Cache-Control':'no-cache'});
      response.end(request.method === 'HEAD' ? undefined : await readFile(target));
    } catch(error) {
      if (response.headersSent) { response.end(); return; }
      const conflictCodes = ['INSUFFICIENT_BALANCE','REFUND_INSUFFICIENT_BALANCE','IDEMPOTENCY_CONFLICT','INVALID_TRANSITION','RENEWAL_PENDING','INACTIVE_SUBSCRIPTION','PROJECT_UNAVAILABLE','PROJECT_EXPIRED','REWARD_UNAVAILABLE','SELF_SUPPORT_UNAVAILABLE'];
      const validationCodes = ['INVALID_KEY','INVALID_ACTOR','INVALID_AMOUNT','INVALID_MODE','MONTHLY_UNAVAILABLE','INVALID_SUBSCRIPTION','INVALID_OUTCOME','AMOUNT_OVERFLOW','INVALID_TITLE','INVALID_DESCRIPTION','INVALID_CATEGORY','INVALID_DURATION','DEMO_LIMIT','INVALID_PROFILE','INVALID_LOCATION','INVALID_LINK','INVALID_REWARD','INVALID_REWARD_AMOUNT','INVALID_REWARD_MODE','INVALID_UPDATE','INVALID_COMMENT','INVALID_PROJECT_UPDATE','INVALID_MODERATION','INVALID_MESSAGE','INVALID_MILESTONES','INVALID_DELIVERY'];
      const notFound = ['ENOENT','ENOTDIR','NOT_FOUND','NOT_FOUND_WORKSPACE'].includes(error.code);
      const unavailable = ['ECONNREFUSED','ECONNRESET','ETIMEDOUT','57P01','57P03'].includes(error.code);
      const status = error.status || (['FORBIDDEN','ACCOUNT_BANNED','ACCOUNT_SUSPENDED'].includes(error.code) ? 403 : notFound ? 404 : unavailable ? 503 : conflictCodes.includes(error.code) ? 409 : validationCodes.includes(error.code) ? 400 : 500);
      if (status >= 500) logger.error?.('Falha interna da demonstração.',{code:error.code || 'INTERNAL_ERROR'});
      send(response,status,{error:{code:unavailable ? 'DB_UNAVAILABLE' : status >= 500 ? 'INTERNAL_ERROR' : notFound ? 'NOT_FOUND' : error.code || 'INVALID_REQUEST',...(['username','email','role','password'].includes(error.field)?{field:error.field}:{}),message:unavailable ? 'O banco está temporariamente indisponível. Tente novamente.' : status >= 500 ? 'Não foi possível concluir a operação. Tente novamente.' : notFound ? 'Recurso não encontrado.' : error.message}});
    }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  return server;
}
