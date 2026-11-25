import {createPlatform} from '../domain/platform.js';
import {imageWork,readProjectForm,readProjectImage} from './project-image.mjs';
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
const validId=id=>/^[a-zA-Z0-9_-]{1,160}$/.test(id);
const imageUrl=row=>`/api/project-images/${encodeURIComponent(row.campaign_id)}?v=${new Date(row.updated_at).getTime()}`;

export function createProjectMedia({pool,repository,resolve,check}){
  async function decorate(snapshot,session){
    if(snapshot.accessBlocked)return snapshot;
    const rows=(await pool.query('SELECT campaign_id,updated_at FROM project_images WHERE workspace_id=$1',[session.workspaceId])).rows;
    const images=new Map(rows.map(row=>[row.campaign_id,imageUrl(row)]));
    snapshot.campaigns=snapshot.campaigns.map(project=>({...project,...(images.has(project.id)?{image:images.get(project.id)}:{})}));
    snapshot.contributions=snapshot.contributions.map(support=>({...support,...(images.has(support.campaignId)?{campaignImage:images.get(support.campaignId)}:{})}));
    return snapshot;
  }
  async function handle({request,response,url,send}){
    const create=url.pathname==='/api/projects';
    const writeMatch=/^\/api\/projects\/([^/]+)\/image$/.exec(url.pathname);
    const readMatch=/^\/api\/project-images\/([^/]+)$/.exec(url.pathname);
    if(!create&&!writeMatch&&!readMatch)return false;
    const session=await resolve(request);if(!session?.actorId)fail(401,'SESSION_REQUIRED','Entre na sua conta para continuar.');
    const state=await repository.read(session.workspaceId),service=createPlatform({initialState:state});service.switchActor(session.actorId);
    if(service.getActor().banned)fail(403,'ACCOUNT_BANNED','O acesso à conta está bloqueado.');
    if(readMatch){
      if(request.method!=='GET')fail(405,'METHOD_NOT_ALLOWED','Use GET.');
      const id=readMatch[1];if(!validId(id))fail(404,'NOT_FOUND','Capa não encontrada.');
      const visible=service.getPublicState();
      if(!visible.campaigns.some(c=>c.id===id)&&!visible.contributions.some(c=>c.campaignId===id&&c.supporterId===session.actorId))fail(404,'NOT_FOUND','Capa não encontrada.');
      const row=(await pool.query('SELECT image FROM project_images WHERE workspace_id=$1 AND campaign_id=$2',[session.workspaceId,id])).rows[0];
      if(!row)fail(404,'NOT_FOUND','Capa não encontrada.');
      response.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-cache','Content-Disposition':'inline'});response.end(Buffer.from(row.image));return true;
    }
    if((create&&request.method!=='POST')||(!create&&!['POST','DELETE'].includes(request.method)))fail(405,'METHOD_NOT_ALLOWED','Método não permitido.');
    check(request,session);
    if(service.getActor().restricted)fail(403,'ACCOUNT_SUSPENDED','A conta está suspensa para alterações.');
    if(service.getActor().role!=='creator')fail(403,'FORBIDDEN','Somente o criador responsável pode alterar a capa.');
    const id=writeMatch?.[1];
    if(!create){if(!validId(id))fail(404,'NOT_FOUND','Projeto não encontrado.');const project=service.getCampaign(id);if(project.creatorId!==session.actorId)fail(403,'FORBIDDEN','Somente o responsável pode alterar a capa.');if(project.deletedAt)fail(409,'PROJECT_UNAVAILABLE','O projeto está excluído.');}
    let image=null,payload;
    if(create){({image,payload}=await imageWork.run(()=>readProjectForm(request)));}
    else if(request.method==='POST')image=await imageWork.run(()=>readProjectImage(request));
    const result=await repository.transact(session.workspaceId,async(stored,client)=>{
      const api=createPlatform({initialState:stored});api.switchActor(session.actorId);
      const project=create?api.createCampaign(payload):api.getCampaign(id);
      if(!create||image)api.campaignImageChanged(project.id,!image);
      if(image)await client.query('INSERT INTO project_images(workspace_id,campaign_id,image,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(workspace_id,campaign_id) DO UPDATE SET image=excluded.image,updated_at=excluded.updated_at',[session.workspaceId,project.id,image]);
      else if(!create)await client.query('DELETE FROM project_images WHERE workspace_id=$1 AND campaign_id=$2',[session.workspaceId,project.id]);
      return {state:api.getState(),result:project};
    });
    send(response,create?201:200,{ok:true,result});return true;
  }
  return {decorate,handle};
}
