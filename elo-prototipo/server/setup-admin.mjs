import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {hashPassword} from './auth/passwords.mjs';
import {createPostgresRepository} from './repository/postgres.js';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
  await createPostgresRepository(pool).initialize();
  const existing=(await pool.query("SELECT id FROM auth_users WHERE role='admin'")).rows[0];
  if(existing)console.log(JSON.stringify({created:false,message:'Administrador já configurado. A senha não foi alterada.'}));
  else{
    const password=randomBytes(24).toString('base64url');
    await pool.query('INSERT INTO auth_users(id,username,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',['admin1','admin','admin@elo.local','admin',await hashPassword(password)]);
    console.log(JSON.stringify({created:true,username:'admin',email:'admin@elo.local',password}));
  }
}finally{await pool.end();}
