import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticatedFixture,fixturePassword} from './helpers/authenticated-fixture.mjs';
const registration=(suffix,password=fixturePassword)=>({username:`quota_${suffix}`,email:`quota_${suffix}@example.test`,role:'supporter',password});

test('cadastros concorrentes respeitam o último lugar disponível sem invalidar a plataforma',async()=>{
  const fixture=await authenticatedFixture({maxRegisteredUsers:5});
  try{
    const one=await fixture.client(),two=await fixture.client();
    const responses=await Promise.all([one.request('/api/auth/register',registration('a')),two.request('/api/auth/register',registration('b'))]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    assert.equal(responses.find(r=>r.status===409).body.error.code,'REGISTRATION_LIMIT');
    assert.equal(Number((await fixture.pool.query('SELECT count(*) FROM auth_users')).rows[0].count),5);
    const winner=responses[0].status===200?one:two;
    const state=await winner.request('/api/state');assert.equal(state.status,200);assert.equal(state.body.state.auth.authenticated,true);
  }finally{await fixture.close();}
});

test('capacidade de perfis considera o catálogo legado antes de aceitar outro cadastro',async()=>{
  const fixture=await authenticatedFixture();
  try{
    const guest=await fixture.client();
    const legacy=Number((await fixture.pool.query('SELECT count(*) FROM creator_profiles')).rows[0].count);
    const existingProfiles=Number((await fixture.pool.query("SELECT count(*) FROM auth_users WHERE role IN ('creator','supporter')")).rows[0].count);
    const extra=10000-legacy-existingProfiles;
    await fixture.pool.query(`INSERT INTO auth_users(id,username,email,role,password_hash)
      SELECT 'capacity-'||n,'capacity_'||n,'capacity_'||n||'@example.test','supporter',
      (SELECT password_hash FROM auth_users WHERE id='user-media-owner')
      FROM generate_series(1,$1::int) AS n`,[extra]);
    const before=Number((await fixture.pool.query('SELECT count(*) FROM auth_users')).rows[0].count);assert.ok(before<10000);
    const result=await guest.request('/api/auth/register',registration('sem_perfil'));
    assert.equal(result.status,409);assert.equal(result.body.error.code,'REGISTRATION_LIMIT');
    assert.equal(Number((await fixture.pool.query('SELECT count(*) FROM auth_users')).rows[0].count),before);
  }finally{await fixture.close();}
});

test('trocar identificador e e-mail não contorna o orçamento de autenticação por IP',async()=>{
  const fixture=await authenticatedFixture();
  try{
    const guest=await fixture.client();
    for(let i=0;i<30;i++){
      const result=await guest.request('/api/auth/register',{...registration(`tentativa_${i}`,'curta'),identifier:`ignorar_${i}`});
      assert.equal(result.status,400);
    }
    const limited=await guest.request('/api/auth/register',{...registration('tentativa_31','curta'),identifier:'outro_identificador'});
    assert.equal(limited.status,429);assert.equal(limited.body.error.code,'AUTH_RATE_LIMIT');
    assert.equal(Number((await fixture.pool.query('SELECT count(*) FROM auth_users')).rows[0].count),4);
  }finally{await fixture.close();}
});
