import {once} from 'node:events';
import {createEmbeddedPool} from '../../server/db/embedded.mjs';
import {createPostgresRepository} from '../../server/repository/postgres.js';
import {createAuthentication} from '../../server/auth/authentication.mjs';
import {hashPassword} from '../../server/auth/passwords.mjs';
import {createApp} from '../../server/http/app.mjs';

export const fixturePassword='Senha fictícia longa de integração 2026!';
export async function authenticatedFixture(options={}) {
  const pool=await createEmbeddedPool(),repository=createPostgresRepository(pool);
  await repository.initialize();
  const authentication=createAuthentication({pool,repository,...options});
  await authentication.workspace();
  const passwordHash=await hashPassword(fixturePassword);
  for(const [id,name,role] of [['admin1','admin','admin'],['user-media-owner','media_owner','creator'],['user-media-other','media_other','creator'],['user-media-viewer','media_viewer','supporter']]) {
    await pool.query('INSERT INTO auth_users(id,username,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',[id,name,`${name}@example.test`,role,passwordHash]);
  }
  const server=createApp({repository:authentication.repository,authentication,sessionSecret:'segredo-de-fixture-sem-dados-reais-com-32-caracteres',logger:{error(){}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  async function client(name) {
    let cookie='',csrf='',state;
    async function raw(path,{body,headers={},method=body?'POST':'GET'}={}) {
      const response=await fetch(base+path,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...headers},...(body?{body}:{})});
      if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
      return response;
    }
    async function request(path,body) {
      const response=await raw(path,{body:body?JSON.stringify(body):undefined,headers:body?{'Content-Type':'application/json'}:{}});
      const json=await response.json();if(json.state)state=json.state;if(json.csrfToken)csrf=json.csrfToken;
      return {status:response.status,body:json};
    }
    await request('/api/state');
    if(name){const result=await request('/api/auth/login',{identifier:name,password:fixturePassword});if(result.status!==200)throw new Error(`Login da fixture recusado: ${result.status}`);await request('/api/state');}
    return {raw,request,command:(command,payload={})=>request('/api/commands',{command,payload}),get cookie(){return cookie;},get state(){return state;}};
  }
  return {pool,repository,authentication,server,base,client,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();}};
}

export const projectPayload=(overrides={})=>({title:'Projeto da fixture de imagem',description:'Uma proposta fictícia para verificar imagem, perfil e persistência.',category:'Jogos',goalCents:100000,daysLeft:30,monthly:false,rewards:[],...overrides});
export function projectForm(payload,bytes,type='image/png') {
  const form=new FormData();form.set('payload',JSON.stringify(payload));if(bytes)form.set('thumbnail',new File([bytes],'arquivo.png',{type}));return form;
}
