const limit=()=>Object.assign(new Error('O ambiente atingiu o limite de contas. Fale com a administração.'),{status:409,code:'REGISTRATION_LIMIT'});
export async function ensureRegistrationCapacity(client,workspaceId,maxRegisteredUsers=10000){
  const row=(await client.query(`SELECT
    (SELECT count(*) FROM auth_users) AS users,
    (SELECT count(*) FROM auth_users WHERE role IN ('creator','supporter'))
      + (SELECT count(*) FROM creator_profiles p WHERE p.workspace_id=$1
         AND NOT EXISTS(SELECT 1 FROM auth_users u WHERE u.id=p.creator_id AND u.role IN ('creator','supporter'))) AS profiles`,[workspaceId])).rows[0];
  if(Number(row.users)>=maxRegisteredUsers||Number(row.profiles)>=10000)throw limit();
}
export async function insertRegisteredUser(pool,workspaceId,values,maxRegisteredUsers){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('LOCK TABLE auth_users IN SHARE ROW EXCLUSIVE MODE');
    await ensureRegistrationCapacity(client,workspaceId,maxRegisteredUsers);
    const row=(await client.query('INSERT INTO auth_users(id,username,email,role,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',values)).rows[0];
    await client.query('COMMIT');return row;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
