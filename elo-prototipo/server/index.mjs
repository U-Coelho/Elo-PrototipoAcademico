import pg from 'pg';
import { createPostgresRepository } from './repository/postgres.js';
import { createApp } from './http/app.mjs';
import { createAuthentication } from './auth/authentication.mjs';
import {createProjectCleanup} from './projects/cleanup.mjs';

const {Pool} = pg;
if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL. Execute npm run setup e inicie o banco PostgreSQL.');
const pool = new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000,statement_timeout:10000,idle_in_transaction_session_timeout:15000});
pool.on('error',()=>console.error('Conexão ociosa do banco interrompida.'));
const repository = createPostgresRepository(pool);
await repository.initialize();
const authentication=createAuthentication({pool,repository,secure:process.env.COOKIE_SECURE==='true'});
await authentication.workspace();
const cleanup=createProjectCleanup({pool,repository:authentication.repository});cleanup.start();
const server = createApp({repository:authentication.repository,authentication,sessionSecret:process.env.SESSION_SECRET,secureCookies:process.env.COOKIE_SECURE === 'true',health:()=>pool.query('SELECT 1')});
const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
server.listen(port,host,()=>console.log(`Elo · PostgreSQL · pagamentos simulados\nLocal: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{server.close(async()=>{await cleanup.stop();await pool.end();process.exit(0);});server.closeIdleConnections();});
