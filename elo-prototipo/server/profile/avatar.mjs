import sharp from 'sharp';
export const MAX_AVATAR_BYTES=2*1024*1024;
const invalid=()=>Object.assign(new Error('Escolha uma imagem JPG, PNG ou WebP válida, sem animação, com até 16 milhões de pixels.'),{status:400,code:'INVALID_AVATAR'});
export async function readAvatar(request){
  if(!['image/jpeg','image/png','image/webp'].includes(String(request.headers['content-type']||'').split(';')[0]))throw invalid();
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>MAX_AVATAR_BYTES)throw Object.assign(new Error('A foto deve ter no máximo 2 MB.'),{status:413,code:'AVATAR_TOO_LARGE'});chunks.push(chunk);}
  return processAvatar(Buffer.concat(chunks));
}
export async function processAvatar(buffer){
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_AVATAR_BYTES)throw invalid();
  const raster=buffer.subarray(0,3).equals(Buffer.from([255,216,255]))||buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP');
  if(!raster)throw invalid();
  try{
    const image=sharp(buffer,{limitInputPixels:16000000,failOn:'warning'}),meta=await image.metadata();
    if(!['jpeg','png','webp'].includes(meta.format)||(meta.pages||1)>1)throw invalid();
    return await image.rotate().resize(512,512,{fit:'cover'}).flatten({background:'#eeeeee'}).jpeg({quality:82}).toBuffer();
  }catch{throw invalid();}
}
