import { spawn } from 'node:child_process';
import { mkdir,open } from 'node:fs/promises';
import path from 'node:path';
await mkdir('backups',{recursive:true});
const destination=path.resolve('backups',`elo-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`);
const file=await open(destination,'wx',0o600);
try {
  const child=spawn('docker',[
    'compose','exec','-T','db','pg_dump','-U','elo','-d','elo',
    '--format=custom','--exclude-table-data=public.auth_sessions',
  ],{stdio:['ignore',file.fd,'inherit']});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  if(code!==0) throw new Error('Falha no backup. O arquivo gerado não deve ser usado para restauração.');
  console.log(`Backup do banco de demonstração: ${destination}`);
} finally {await file.close();}
