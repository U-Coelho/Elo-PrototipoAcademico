import {createPlatform} from '../domain/platform.js';

export function createProjectCleanup({pool,repository,clock=Date.now,logger=console}) {
  let running=null,timer=null;
  async function clean(){
    const at=new Date(clock()).toISOString();
    const {rows}=await pool.query(`SELECT DISTINCT workspace_id FROM campaigns
      WHERE extra ? 'purgeAfter' AND NOT (extra ? 'purgedAt')
      AND extra->>'purgeAfter' <= $1 ORDER BY workspace_id LIMIT 100`,[at]);
    const removed=[];
    for(const {workspace_id:id} of rows){
      const result=await repository.transact(id,state=>{
        const p=createPlatform({initialState:state,clock});
        const ids=p.purgeExpiredProjects();return {state:p.getState(),result:ids};
      });removed.push(...result);
    }
    return removed;
  }
  const run=()=>{if(!running)running=clean().finally(()=>{running=null;});return running;};
  const tick=()=>run().catch(()=>logger.error('A limpeza de projetos expirados será tentada novamente.'));
  return {run,start(){if(timer)return;void tick();timer=setInterval(()=>void tick(),60000);timer.unref();},async stop(){if(timer)clearInterval(timer);timer=null;if(running)await running.catch(()=>{});}};
}
