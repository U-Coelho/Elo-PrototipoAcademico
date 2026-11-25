const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const text=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|<\/?[a-z][^>]*>/i.test(v);
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function normalizeRewardDeliveryUrl(value){if(value==='')return '';try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||value.length>1000||u.href.length>1000)throw new Error();return u.href;}catch{fail('INVALID_DELIVERY','Use um link HTTPS válido de até 1.000 caracteres após normalização, sem credenciais.');}}
const eligible=(c,p)=>Boolean(c&&p&&!p.deletedAt&&!p.purgedAt&&c.campaignId===p.id&&c.creatorId===p.creatorId&&c.status==='confirmed'&&c.rewardId&&c.refundStatus!=='completed');
export function canAccessRewardDelivery({contribution,campaign,actor}){return eligible(contribution,campaign)&&!actor?.banned&&(actor?.id===contribution.creatorId||actor?.id===contribution.supporterId);}
function active(actor){if(actor?.banned)fail('ACCOUNT_BANNED','A conta está banida.');if(actor?.suspended||actor?.restricted)fail('ACCOUNT_SUSPENDED','A conta está suspensa para alterações.');}
export function prepareRewardDelivery({contribution,campaign,actor,previous=null,message,url='',now,id}){
  active(actor);
  if(actor?.role!=='creator'||actor.id!==campaign?.creatorId)fail('FORBIDDEN','Somente o criador responsável pode entregar a recompensa.');
  if(!eligible(contribution,campaign))fail('REWARD_UNAVAILABLE','A recompensa exige um pagamento confirmado, sem devolução, de projeto disponível.');
  if(!text(message,5,2000)||typeof url!=='string')fail('INVALID_DELIVERY','Escreva uma mensagem de 5 a 2.000 caracteres.');
  const normalized=normalizeRewardDeliveryUrl(url.trim()),body=message.trim();
  if(previous&&(previous.contributionId!==contribution.id||previous.creatorId!==actor.id))fail('INVALID_DELIVERY','Entrega incompatível com o apoio.');
  if(previous?.message===body&&previous.url===normalized)return {delivery:structuredClone(previous),duplicate:true};
  return {delivery:{id:previous?.id||id,contributionId:contribution.id,campaignId:campaign.id,creatorId:actor.id,supporterId:contribution.supporterId,message:body,url:normalized,status:'available',version:(previous?.version||0)+1,createdAt:previous?.createdAt||now,updatedAt:now,acknowledgedAt:null},duplicate:false};
}
export function acknowledgeRewardDelivery({delivery,contribution,campaign,actor,now}){
  active(actor);if(actor?.id!==contribution?.supporterId)fail('FORBIDDEN','Somente o apoiador pode confirmar o recebimento.');
  if(!eligible(contribution,campaign)||!delivery||delivery.contributionId!==contribution.id)fail('REWARD_UNAVAILABLE','Esta entrega não está disponível.');
  if(delivery.status==='received')return {delivery:structuredClone(delivery),duplicate:true};
  return {delivery:{...delivery,status:'received',acknowledgedAt:now},duplicate:false};
}
export function validRewardDelivery(v){
  if(!v||![v.id,v.contributionId,v.campaignId,v.creatorId,v.supporterId].every(x=>text(x,1,160))||!text(v.message,5,2000)||typeof v.url!=='string'||!['available','received'].includes(v.status)||!Number.isSafeInteger(v.version)||v.version<1||!date(v.createdAt)||!date(v.updatedAt)||Date.parse(v.updatedAt)<Date.parse(v.createdAt))return false;
  try{if(normalizeRewardDeliveryUrl(v.url)!==v.url)return false;}catch{return false;}
  return v.status==='available'?v.acknowledgedAt===null:date(v.acknowledgedAt)&&Date.parse(v.acknowledgedAt)>=Date.parse(v.updatedAt);
}
