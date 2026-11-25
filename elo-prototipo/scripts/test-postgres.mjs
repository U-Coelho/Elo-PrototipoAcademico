import { spawn } from 'node:child_process';
if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL apontando para um PostgreSQL de demonstração.');
const child=spawn(process.execPath,['--test','tests/postgres.test.mjs'],{stdio:'inherit',env:{...process.env,ELO_RUN_POSTGRES_TESTS:'1'}});
child.on('exit',code=>{process.exitCode=code??1;});
