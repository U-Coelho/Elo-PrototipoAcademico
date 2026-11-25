import { mkdir } from 'node:fs/promises';
import { createEmbeddedPool } from './db/embedded.mjs';
import { createPostgresRepository } from './repository/postgres.js';
import { createApp } from './http/app.mjs';
import {createAuthentication} from './auth/authentication.mjs';
import {createProjectCleanup} from './projects/cleanup.mjs';

if (!process.env.SESSION_SECRET) throw new Error('Execute npm run setup antes de iniciar a demonstração.');
await mkdir('.local',{recursive:true});
const pool = await createEmbeddedPool('.local/postgres-wasm');
const repository = createPostgresRepository(pool); await repository.initialize();
const authentication=createAuthentication({pool,repository});await authentication.workspace();
const cleanup=createProjectCleanup({pool,repository:authentication.repository});cleanup.start();
const server = createApp({repository:authentication.repository,authentication,sessionSecret:process.env.SESSION_SECRET,health:()=>pool.query('SELECT 1')});
const port = Number(process.env.PORT || 3000);
server.listen(port,'127.0.0.1',()=>console.log(`Prévia de desenvolvimento · PostgreSQL embarcado/WASM\nLocal: http://127.0.0.1:${port}\nLogin e cadastro ativos; pagamentos simulados.`));
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{server.close(async()=>{await cleanup.stop();await pool.end();process.exit(0);});server.closeIdleConnections();});
