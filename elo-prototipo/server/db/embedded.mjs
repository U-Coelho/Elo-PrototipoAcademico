export async function createEmbeddedPool(dataDir='memory://') {
  const {PGlite} = await import('@electric-sql/pglite');
  const db = await PGlite.create(dataDir);
  let tail = Promise.resolve();
  const connect = async () => {
    let unlock; const previous = tail;
    tail = new Promise(resolve=>{unlock=resolve;});
    await previous;
    let released = false;
    return {query:async(text,params)=>{
      const result = params?.length ? await db.query(text,params) : await db.exec(text);
      if (Array.isArray(result)) { const last = result.at(-1) || {rows:[]}; return {...last,rowCount:last.rows?.length || last.affectedRows || 0}; }
      return {...result,rowCount:result.rows?.length || result.affectedRows || 0};
    },release:()=>{if(!released){released=true;unlock();}}};
  };
  return {connect,query:async(text,params)=>{const client=await connect();try{return await client.query(text,params);}finally{client.release();}},end:()=>db.close(),embedded:true};
}
