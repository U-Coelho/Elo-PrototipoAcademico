import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiPlatform } from '../src/services/api.js';

const fixture = () => ({
  actorId: 'supporter1',
  actors: [{ id: 'supporter1', name: 'Ana fictícia', role: 'supporter' }],
  campaigns: [{ id: 'c1', title: 'Campanha fictícia' }],
  contributions: [{ id: 'support-1', amountCents: 5000, status: 'pending' }],
  ledger: [], payouts: [], auditLog: [], savedCampaignIds: [],
  creatorProfiles: [], projectUpdates: [], projectComments: [],
  summary: { totalSupportedCents: 0, availableBalanceCents: 0 },
  persistence: 'postgresql', persistenceAvailable: true,
});
const initial = (state = fixture()) => Response.json({ state, csrfToken: 'csrf-fixture' });

test('foto usa corpo binário, CSRF e atualização do estado após salvar ou remover',async()=>{
  const calls=[],file=new File([new Uint8Array([137,80,78,71])],'foto.png',{type:'image/png'});
  const api=await createApiPlatform({fetcher:async(path,options)=>{calls.push({path,options});return path==='/api/state'?initial():Response.json({ok:true});}});
  await api.uploadAvatar(file);
  assert.equal(calls[1].path,'/api/profile/avatar');assert.equal(calls[1].options.body,file);assert.equal(calls[1].options.method,'POST');
  assert.equal(calls[1].options.headers['Content-Type'],'image/png');assert.equal(calls[1].options.headers['X-CSRF-Token'],'csrf-fixture');
  assert.equal(calls[2].path,'/api/state');
  await api.removeAvatar();assert.equal(calls[3].options.method,'DELETE');assert.equal(calls[4].path,'/api/state');
});

test('cria o projeto e a capa em uma única requisição multipart autenticada', async () => {
  const file = new File(['capa'], 'capa.png', {type:'image/png'});
  const payload = {title:'Novo projeto', goalCents:10000};
  const created = {id:'new-project', image:'/api/project-images/new-project?v=1795521600000'};
  let calls=[];
  const api = await createApiPlatform({fetcher:async (path,options)=>{
    calls.push([path,options]);
    if(path==='/api/state')return initial({...fixture(),campaigns:calls.length>1?[created]:[]});
    return Response.json({ok:true,result:created});
  }});
  assert.deepEqual(await api.createCampaign(payload,file),created);
  assert.deepEqual(calls.map(([path])=>path),['/api/state','/api/projects','/api/state']);
  const [,options]=calls[1];
  assert.equal(options.method,'POST');
  assert.equal(options.headers['X-CSRF-Token'],'csrf-fixture');
  assert.equal(options.headers['Content-Type'],undefined);
  assert.deepEqual(JSON.parse(options.body.get('payload')),payload);
  assert.equal(options.body.get('thumbnail'),file);
  assert.equal(api.getCampaign(created.id).image,created.image);
});

test('alterar e remover a capa só adota o estado confirmado pelo servidor', async () => {
  const file = new File(['capa'], 'capa.webp', {type:'image/webp'});
  const calls=[];
  const image='/api/project-images/c1?v=1795521600000';
  let currentImage;
  const api=await createApiPlatform({fetcher:async(path,options)=>{
    if(path==='/api/state')return initial({...fixture(),campaigns:[{id:'c1',image:currentImage}]});
    calls.push([path,options.method,options.headers['X-CSRF-Token'],options.headers['Content-Type'],options.body]);
    currentImage=options.method==='POST'?image:'assets/campaign-4.svg';
    return Response.json({ok:true});
  }});
  await api.uploadCampaignImage('c1',file);
  assert.equal(api.getCampaign('c1').image,image);
  await api.removeCampaignImage('c1');
  assert.equal(api.getCampaign('c1').image,'assets/campaign-4.svg');
  assert.deepEqual(calls,[['/api/projects/c1/image','POST','csrf-fixture','image/webp',file],['/api/projects/c1/image','DELETE','csrf-fixture',undefined,undefined]]);
});

test('prévia de exclusão e tentativas após conflito usam o contrato de comandos',async()=>{
  const calls=[];
  const preview={campaignId:'c1',requiredCents:6000,availableCents:1000,shortfallCents:5000,confirmedCount:2,pendingCount:1,subscriptionCount:1,canDelete:false};
  const api=await createApiPlatform({fetcher:async(path,options)=>{
    if(path==='/api/state')return initial();
    const command=JSON.parse(options.body);calls.push(command);
    if(command.command==='getCampaignDeletionPreview')return Response.json({state:fixture(),result:preview});
    if(calls.length===2)return Response.json({error:{code:'REFUND_INSUFFICIENT_BALANCE',message:'Saldo insuficiente.'}},{status:409});
    return Response.json({state:fixture(),result:{id:'c1',deletionSummary:{refundedCents:6000}}});
  }});
  const payload={campaignId:'c1',deleted:true,reason:'Encerramento do projeto',idempotencyKey:'same-deletion'};
  assert.deepEqual(await api.getCampaignDeletionPreview('c1'),preview);
  await assert.rejects(api.moderateCampaign(payload),error=>error.code==='REFUND_INSUFFICIENT_BALANCE');
  assert.equal((await api.moderateCampaign(payload)).deletionSummary.refundedCents,6000);
  assert.deepEqual(calls,[{command:'getCampaignDeletionPreview',payload:{campaignId:'c1'}},...Array(2).fill({command:'moderateCampaign',payload})]);
});

test('erro de cadastro conserva o campo informado pela API sem alterar o estado',async()=>{
  const api=await createApiPlatform({fetcher:async path=>path==='/api/state'?initial():Response.json({error:{code:'INVALID_REGISTRATION',field:'username',message:'Use um usuário sem espaços.'}},{status:400})});
  const before=api.getState();
  await assert.rejects(api.register({username:'Mario Rodrigues'}),error=>error.code==='INVALID_REGISTRATION'&&error.field==='username'&&/sem espaços/.test(error.message));
  assert.deepEqual(api.getState(),before);
});

test('atualização atrasada de prazo não restaura a persona anterior após trocar de perfil',async()=>{
  const identities=[{id:'admin1',name:'Rafael',role:'admin'},{id:'creator1',name:'Marina',role:'creator'}];
  let identity='admin1',reads=0,releaseRead,signalRead;
  const blockedRead=new Promise(resolve=>{releaseRead=resolve;}),readStarted=new Promise(resolve=>{signalRead=resolve;});
  const trace=[];
  const snapshot=()=>({...fixture(),actorId:identity,actors:identities});
  const api=await createApiPlatform({fetcher:async(path,options)=>{
    if(path==='/api/state'){
      const captured=snapshot();
      if(++reads===2){trace.push('refresh:start');signalRead();await blockedRead;trace.push('refresh:end');}
      return initial(captured);
    }
    trace.push('switch');identity=JSON.parse(options.body).payload.id;
    return Response.json({state:snapshot(),result:identities.find(actor=>actor.id===identity)});
  }});
  const refresh=api.refresh();await readStarted;
  const switching=api.switchActor('creator1');await Promise.resolve();
  assert.deepEqual(trace,['refresh:start']);
  releaseRead();await Promise.all([refresh,switching]);
  assert.equal(api.getActor().id,'creator1');assert.deepEqual(trace,['refresh:start','refresh:end','switch']);
});

test('bootstrap exige API disponível e não inicia um cenário local alternativo', async () => {
  const calls = [];
  await assert.rejects(createApiPlatform({ fetcher: async (...args) => { calls.push(args); throw new TypeError('offline'); } }), /Não foi possível conectar ao servidor/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/state');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].cache, 'no-store');
});

test('comando inclui CSRF, cookies de mesma origem e a chave idempotente informada', async () => {
  const calls = [];
  const api = await createApiPlatform({ fetcher: async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/state') return initial();
    return Response.json({ state: fixture(), result: { id: 'new-support' } });
  } });
  const payload = { campaignId: 'c1', amountCents: 5000, mode: 'once', idempotencyKey: 'same-operation' };
  const result = await api.createContribution(payload);
  assert.equal(result.id, 'new-support');
  assert.equal(calls[1].path, '/api/commands');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'csrf-fixture');
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[1].options.body), { command: 'createContribution', payload });
});

test('a interface só adota o crédito confirmado depois da resposta do servidor', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const api = await createApiPlatform({ fetcher: async path => {
    if (path === '/api/state') return initial();
    await blocked;
    const state = fixture();
    state.contributions[0].status = 'confirmed';
    state.summary.totalSupportedCents = 5000;
    return Response.json({ state, result: state.contributions[0] });
  } });
  const confirmation = api.simulatePayment('support-1', 'confirmed');
  assert.equal(api.getSummary().totalSupportedCents, 0);
  assert.equal(api.getState().contributions[0].status, 'pending');
  release();
  await confirmation;
  assert.equal(api.getSummary().totalSupportedCents, 5000);
  assert.equal(api.getState().contributions[0].status, 'confirmed');
});

test('comandos são serializados e uma recusa não interrompe os comandos seguintes', async () => {
  const trace = [];
  let release, inFlight = 0, maximum = 0;
  const blocked = new Promise(resolve => { release = resolve; });
  const api = await createApiPlatform({ fetcher: async (path, options) => {
    if (path === '/api/state') return initial();
    const { payload } = JSON.parse(options.body);
    inFlight++; maximum = Math.max(maximum, inFlight); trace.push(`start:${payload.id}`);
    if (payload.id === 'first') await blocked;
    trace.push(`end:${payload.id}`); inFlight--;
    if (payload.id === 'first') return Response.json({ error: { code: 'FORBIDDEN', message: 'Operação não permitida.' } }, { status: 403 });
    const state = fixture(); state.savedCampaignIds = ['second'];
    return Response.json({ state, result: true });
  } });
  const first = api.toggleSaved('first');
  const rejection = assert.rejects(first, error => error.code === 'FORBIDDEN');
  const second = api.toggleSaved('second');
  await Promise.resolve();
  assert.deepEqual(trace, ['start:first']);
  release();
  await rejection;
  assert.equal(await second, true);
  assert.equal(maximum, 1);
  assert.deepEqual(trace, ['start:first', 'end:first', 'start:second', 'end:second']);
  assert.deepEqual(api.getState().savedCampaignIds, ['second']);
});

test('getters retornam cópias e a exportação contém somente os dados públicos esperados', async () => {
  const api = await createApiPlatform({ fetcher: async () => initial() });
  api.getState().contributions[0].amountCents = -100;
  api.listCampaigns().length = 0;
  api.getActor().role = 'admin';
  api.getSummary().totalSupportedCents = 99999;
  assert.equal(api.getState().contributions[0].amountCents, 5000);
  assert.equal(api.listCampaigns().length, 1);
  assert.equal(api.getActor().role, 'supporter');
  assert.equal(api.getSummary().totalSupportedCents, 0);
  assert.throws(() => api.audit(), error => error.code === 'FORBIDDEN');
  const exported = JSON.parse(api.exportSnapshot());
  assert.match(exported.warning, /dados fictícios/);
  assert.equal(exported.csrfToken, undefined);
  assert.equal(exported.idempotency, undefined);
});

test('exportação inclui os salvos e o download usa o snapshot autorizado pelo servidor',async()=>{
  const own={id:'supporter1',name:'Ana',role:'supporter',email:'ana@example.com'};
  const other={id:'creator1',name:'Perfil alheio',email:'outro@example.com'};
  const state={...fixture(),actor:own,accounts:[own,other],savedCampaignIds:['c1'],creatorProfiles:[{creatorId:other.id,bio:'Bio de outra pessoa'}],directMessages:[{creatorId:other.id,body:'Conversa alheia'}]};
  const authorized={actor:own,savedCampaignIds:['c1'],campaigns:[{id:'c1'}]};
  const api=await createApiPlatform({fetcher:async path=>path==='/api/state'?initial(state):path==='/api/export'?Response.json(authorized):Response.json({}, {status:404})});
  const local=JSON.parse(api.exportSnapshot());
  assert.deepEqual(local.savedCampaignIds,['c1']);
  assert.doesNotMatch(JSON.stringify(local),/outro@example|Bio de outra|Conversa alheia/);
  assert.deepEqual(JSON.parse(await api.exportData()),authorized);
});

test('resposta sem estado válido não sobrescreve o último estado confirmado', async () => {
  let commands = 0;
  const api = await createApiPlatform({ fetcher: async path => {
    if (path === '/api/state') return initial();
    commands++;
    return commands === 1 ? Response.json({ result: true, state: { actorId: 'invalid' } }) : Response.json({ state: fixture(), result: true });
  } });
  await assert.rejects(api.toggleSaved('c1'), /estado recebido da API está incompleto/);
  assert.equal(api.getActor().id, 'supporter1');
  assert.equal(await api.toggleSaved('c1'), true);
});

test('comando sem token da sessão não envia uma mutação desprotegida', async () => {
  let calls = 0;
  const api = await createApiPlatform({ fetcher: async () => { calls++; return Response.json({ state: fixture() }); } });
  await assert.rejects(api.toggleSaved('c1'), error => error.code === 'SESSION_REQUIRED');
  assert.equal(calls, 1);
});

test('comandos de comunidade e criação encaminham os campos sem alterar a identidade local',async()=>{
  const calls=[];
  const api=await createApiPlatform({fetcher:async(path,options)=>{
    if(path==='/api/state')return initial();
    calls.push(JSON.parse(options.body));return Response.json({state:fixture(),result:{id:'stored'}});
  }});
  const cases=[
    ['updateCreatorProfile',{bio:'Bio pública',links:[{label:'Portfólio',url:'https://portfolio.example'}],creatorId:'creator1'}],
    ['createProjectUpdate',{campaignId:'c1',title:'Novidades do projeto',body:'Planejamento concluído.'}],
    ['createProjectComment',{campaignId:'c1',body:'Como posso acompanhar as oficinas?'}],
    ['createCampaign',{title:'Projeto com recompensa',rewards:[{title:'Guia',description:'Guia digital',amountCents:5000,monthly:false}]}],
    ['createContribution',{campaignId:'c1',rewardId:'reward-1',amountCents:5000,mode:'once',idempotencyKey:'reward-client'}],
  ];
  for(const[name,payload]of cases){assert.equal((await api[name](payload)).id,'stored');}
  assert.deepEqual(calls,cases.map(([command,payload])=>({command,payload})));
  assert.equal(api.getActor().id,'supporter1');
});

test('comandos administrativos encaminham parâmetros e adotam o estado autorizado da API',async()=>{
  const calls=[];
  const state={...fixture(),actor:{...fixture().actors[0],banned:true},accounts:[{id:'creator1',name:'Marina',role:'creator',banned:false}]};
  const api=await createApiPlatform({fetcher:async(path,options)=>{
    if(path==='/api/state')return initial(state);
    const body=JSON.parse(options.body);calls.push(body);
    return Response.json({state,result:body.command==='auditForAccount'?[{id:'audit-1',relatedAccountIds:['creator1']}]:{id:'stored'}});
  }});
  const cases=[
    ['updateCampaign',{campaignId:'c1',title:'Título atualizado',category:'Jogos',goalCents:50000}],
    ['moderateCampaign',{campaignId:'c1',deleted:true,reason:'Projeto em revisão.'}],
    ['moderateAccount',{accountId:'creator1',type:'suspension',expiresAt:'2027-01-10T12:00:00.000Z',reason:'Perfil em revisão.'}],
    ['moderateComment',{commentId:'comment-1',removed:true,reason:'Conteúdo em revisão.'}],
    ['sendDirectMessage',{creatorId:'creator1',body:'Mensagem da administração.'}],
  ];
  for(const[name,payload]of cases)assert.equal((await api[name](payload)).id,'stored');
  assert.deepEqual(await api.auditForAccount('creator1'),[{id:'audit-1',relatedAccountIds:['creator1']}]);
  assert.deepEqual(calls,[...cases.map(([command,payload])=>({command,payload})),{command:'auditForAccount',payload:{accountId:'creator1'}}]);
  assert.equal(api.getActor().banned,true);api.getAccounts()[0].name='Mutação externa';assert.equal(api.getAccounts()[0].name,'Marina');
});

test('estado de banimento elimina conteúdo anterior e a atualização aceita a liberação do servidor',async()=>{
  const identity={...fixture().actors[0],banned:true,restricted:true,moderationType:'ban',moderationExpiresAt:'2027-01-10T12:00:00.000Z',moderationReason:'Revisão da conta.'};
  const blocked={...fixture(),accessBlocked:true,actor:identity,actors:[identity],campaigns:[],contributions:[],accounts:[],accountModerations:[],directMessages:[]};
  let incoming=fixture();
  const api=await createApiPlatform({fetcher:async(path)=>{
    if(path==='/api/state')return initial(incoming);
    incoming=blocked;return Response.json({state:blocked,result:identity});
  }});
  assert.equal(api.listCampaigns().length,1);
  await api.switchActor('supporter1');
  assert.equal(api.getState().accessBlocked,true);assert.deepEqual(api.listCampaigns(),[]);assert.deepEqual(api.getState().contributions,[]);
  assert.equal(api.getActor().moderationType,'ban');assert.throws(()=>api.exportSnapshot(),error=>error.code==='ACCOUNT_BANNED');
  incoming={...fixture(),actor:{...fixture().actors[0],banned:false,restricted:false,moderationType:'none'}};
  await api.refresh();
  assert.equal(api.getActor().restricted,false);assert.equal(api.listCampaigns().length,1);assert.equal(JSON.parse(api.exportSnapshot()).actor.id,api.getActor().id);
});
