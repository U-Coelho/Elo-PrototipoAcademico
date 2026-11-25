import sharp from 'sharp';
import {createWorkLimiter} from '../security/limits.mjs';

export const MAX_PROJECT_IMAGE_BYTES=5*1024*1024;
export const imageWork=createWorkLimiter({maxActive:2,maxPending:4,code:'IMAGE_BUSY',message:'Há muitas imagens sendo processadas. Tente novamente em instantes.'});
const problem=(status,code,message)=>Object.assign(new Error(message),{status,code});
const invalid=()=>problem(400,'INVALID_PROJECT_IMAGE','Escolha uma imagem JPG, PNG ou WebP estática válida, com até 16 milhões de pixels.');

async function readLimited(request,limit){
  const declared=Number(request.headers['content-length']);
  if(Number.isFinite(declared)&&declared>limit)throw problem(413,'PROJECT_IMAGE_TOO_LARGE','A capa deve ter no máximo 5 MB.');
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>limit)throw problem(413,'PROJECT_IMAGE_TOO_LARGE','A capa deve ter no máximo 5 MB.');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
export async function processProjectImage(buffer){
  if(buffer.length>MAX_PROJECT_IMAGE_BYTES)throw problem(413,'PROJECT_IMAGE_TOO_LARGE','A capa deve ter no máximo 5 MB.');
  const raster=buffer.subarray(0,3).equals(Buffer.from([255,216,255]))||buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP');
  if(!raster)throw invalid();
  try{
    const image=sharp(buffer,{limitInputPixels:16000000,failOn:'warning'}),metadata=await image.metadata();
    if(!['jpeg','png','webp'].includes(metadata.format)||(metadata.pages||1)>1)throw invalid();
    const output=await image.rotate().resize(1280,800,{fit:'cover'}).flatten({background:'#eeeeee'}).jpeg({quality:80}).toBuffer();
    if(output.length>1048576)throw invalid();
    return output;
  }catch(error){if(error.code==='PROJECT_IMAGE_TOO_LARGE')throw error;throw invalid();}
}
export async function readProjectImage(request){
  const type=String(request.headers['content-type']||'').split(';')[0].toLowerCase();
  if(!['image/jpeg','image/png','image/webp'].includes(type))throw invalid();
  return processProjectImage(await readLimited(request,MAX_PROJECT_IMAGE_BYTES));
}
export async function readProjectForm(request){
  const type=String(request.headers['content-type']||'');
  if(!/^multipart\/form-data\s*;/i.test(type))throw problem(415,'CONTENT_TYPE','Envie o projeto como formulário com uma capa opcional.');
  const buffer=await readLimited(request,MAX_PROJECT_IMAGE_BYTES+65536);
  let form;try{form=await new Request('http://elo.invalid/',{method:'POST',headers:{'Content-Type':type},body:buffer}).formData();}catch{throw problem(400,'INVALID_PROJECT_FORM','O formulário do projeto está incompleto.');}
  if([...form.keys()].some(key=>!['payload','thumbnail'].includes(key))||form.getAll('payload').length!==1||form.getAll('thumbnail').length>1)throw problem(400,'INVALID_PROJECT_FORM','Envie os dados e no máximo uma capa.');
  const raw=form.get('payload');let payload;
  try{if(typeof raw!=='string'||Buffer.byteLength(raw)>32768)throw new Error();payload=JSON.parse(raw);if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error();}catch{throw problem(400,'INVALID_PROJECT_FORM','Os dados do projeto são inválidos.');}
  const file=form.get('thumbnail');let image=null;
  if(file){if(typeof file.arrayBuffer!=='function'||!['image/jpeg','image/png','image/webp'].includes(file.type))throw invalid();if(file.size>MAX_PROJECT_IMAGE_BYTES)throw problem(413,'PROJECT_IMAGE_TOO_LARGE','A capa deve ter no máximo 5 MB.');image=await processProjectImage(Buffer.from(await file.arrayBuffer()));}
  return {payload,image};
}
