import pg from 'pg';
import { applyMigrations } from './migrations.js';

if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL para executar as migrações.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try { await applyMigrations(pool); console.log('Migrações do Elo aplicadas.'); }
finally { await pool.end(); }
