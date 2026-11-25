import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt),options={N:131072,r:8,p:1,maxmem:256*1024*1024};
export function validPassword(value){return typeof value==='string'&&value.length>=12&&value.length<=128&&!/[\u0000]/.test(value);}
export async function hashPassword(password){
  if(!validPassword(password))throw Object.assign(new Error('Use uma senha de 12 a 128 caracteres.'),{code:'INVALID_PASSWORD',status:400,field:'password'});
  const salt=randomBytes(16).toString('hex'),key=await derive(password,salt,64,options);
  return `scrypt$131072$8$1$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password,encoded){
  if(typeof password!=='string'||password.length>128)return false;
  const parts=String(encoded).split('$');
  if(parts.length!==6||parts.slice(0,4).join('$')!=='scrypt$131072$8$1'||!/^[a-f0-9]{32}$/.test(parts[4])||!/^[a-f0-9]{128}$/.test(parts[5]))return false;
  const actual=await derive(password,parts[4],64,options);
  return timingSafeEqual(actual,Buffer.from(parts[5],'hex'));
}
