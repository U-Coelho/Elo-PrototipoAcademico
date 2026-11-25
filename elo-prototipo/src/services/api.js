import {buildPersonalExport} from '../domain/personal-export.js';
/** Browser adapter. The API owns permissions, balances and persistence. */
export async function createApiPlatform({ fetcher = globalThis.fetch.bind(globalThis) } = {}) {
  let state, csrfToken;
  let queue = Promise.resolve();
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = (message, code = 'API_UNAVAILABLE', field) => { const error = new Error(message); error.code = code; if(['username','email','role','password'].includes(field))error.field=field;throw error; };

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', ...options, signal: controller.signal });
    } catch (error) {
      fail(error.name === 'AbortError' ? 'O servidor demorou para responder. Confira a conexão e tente novamente.' : 'Não foi possível conectar ao servidor. Confira se a aplicação e o banco estão em execução.');
    } finally { clearTimeout(timer); }
    let body;
    try { body = await response.json(); } catch { fail('O servidor não retornou uma resposta válida.'); }
    if (!response.ok) fail(body.error?.message || body.message || 'Não foi possível concluir a operação.', body.error?.code || body.code || `HTTP_${response.status}`,body.error?.field);
    return body;
  }

  function adopt(body) {
    const incoming = body.state;
    if (!incoming || !Array.isArray(incoming.actors) || !Array.isArray(incoming.campaigns) || !Array.isArray(incoming.contributions) || !incoming.summary || !incoming.actors.some(a => a.id === incoming.actorId)) fail('O estado recebido da API está incompleto.');
    state = clone(incoming);
    if (typeof body.csrfToken === 'string') csrfToken = body.csrfToken;
    return body.result;
  }

  const enqueue = run => {const result=queue.then(run);queue=result.catch(()=>{});return result;};
  const refresh = () => enqueue(async () => { adopt(await request('/api/state')); return api.getState(); });
  function requireCsrf() {
    if (!csrfToken) fail('A sessão precisa ser recarregada.', 'SESSION_REQUIRED');
    return csrfToken;
  }
  const command = (name, payload = {}) => {
    const run = async () => {
      return adopt(await request('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': requireCsrf() },
        body: JSON.stringify({ command: name, payload }),
      }));
    };
    return enqueue(run);
  };
  const authenticate=(operation,payload={})=>enqueue(async()=>{
    await request(`/api/auth/${operation}`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken},body:JSON.stringify(payload)});
    adopt(await request('/api/state'));return api.getState();
  });
  const photoRequest=(file=null)=>enqueue(async()=>{
    await request('/api/profile/avatar',{method:file?'POST':'DELETE',headers:{'X-CSRF-Token':csrfToken,...(file?{'Content-Type':file.type}:{})},...(file?{body:file}:{})});
    adopt(await request('/api/state'));return api.getState();
  });
  const projectRequest = (path, method, body, contentType) => enqueue(async () => {
    const response = await request(path, {
      method,
      headers: { 'X-CSRF-Token': requireCsrf(), ...(contentType ? { 'Content-Type': contentType } : {}) },
      body,
    });
    adopt(response.state ? response : await request('/api/state'));
    return response.result;
  });
  const projectImagePath = campaignId => `/api/projects/${encodeURIComponent(campaignId)}/image`;
  const api = {
    uploadAvatar:file=>photoRequest(file),
    removeAvatar:()=>photoRequest(),
    login:payload=>authenticate('login',payload),
    register:payload=>authenticate('register',payload),
    logout:()=>authenticate('logout'),
    getState: () => clone(state),
    getActor: () => clone(state.actor || state.actors.find(a => a.id === state.actorId)),
    getAccounts: () => clone(state.accounts || state.actors),
    listCampaigns: () => clone(state.campaigns),
    getCampaign(id) { const campaign = state.campaigns.find(c => c.id === id); if (!campaign) fail('Campanha não encontrada.', 'NOT_FOUND'); return clone(campaign); },
    getSummary: () => clone(state.summary),
    getLedger: () => clone(state.ledger || []),
    audit() { if (api.getActor().role !== 'admin') fail('A trilha completa está disponível à personagem administradora.', 'FORBIDDEN'); return clone(state.auditLog || []); },
    switchActor: id => command('switchActor', { id }),
    toggleSaved: id => command('toggleSaved', { id }),
    createContribution: payload => command('createContribution', payload),
    simulatePayment: (id, outcome = 'confirmed') => command('simulatePayment', { id, outcome }),
    cancelSubscription: id => command('cancelSubscription', { id }),
    renewSubscription: payload => command('renewSubscription', payload),
    requestPayout: payload => command('requestPayout', payload),
    createCampaign(payload, thumbnail = null) {
      if (!thumbnail) return command('createCampaign', payload);
      const body = new FormData();
      body.set('payload', JSON.stringify(payload));
      body.set('thumbnail', thumbnail);
      return projectRequest('/api/projects', 'POST', body);
    },
    uploadCampaignImage: (campaignId, file) => projectRequest(projectImagePath(campaignId), 'POST', file, file.type),
    removeCampaignImage: campaignId => projectRequest(projectImagePath(campaignId), 'DELETE'),
    updateCreatorProfile: payload => command('updateCreatorProfile', payload),
    createProjectUpdate: payload => command('createProjectUpdate', payload),
    createProjectComment: payload => command('createProjectComment', payload),
    updateCampaign: payload => command('updateCampaign', payload),
    publishRewardDelivery: payload => command('publishRewardDelivery',payload),
    acknowledgeRewardDelivery: payload => command('acknowledgeRewardDelivery',payload),
    getCampaignDeletionPreview: campaignId => command('getCampaignDeletionPreview', { campaignId }),
    moderateCampaign: payload => command('moderateCampaign', payload),
    moderateAccount: payload => command('moderateAccount', payload),
    moderateComment: payload => command('moderateComment', payload),
    sendDirectMessage: payload => command('sendDirectMessage', payload),
    auditForAccount: accountId => command('auditForAccount', { accountId }),
    reset: () => command('reset'),
    securityDiagnostics: () => command('diagnostics'),
    refresh,
    exportData: () => enqueue(async () => JSON.stringify(await request('/api/export'), null, 2)),
    exportSnapshot() {
      const actor = api.getActor();
      if (actor.banned) fail('O acesso a esta conta está bloqueado pelo banimento.', 'ACCOUNT_BANNED');
      return JSON.stringify(buildPersonalExport({...state, actor}), null, 2);
    },
  };
  await refresh();
  return api;
}
