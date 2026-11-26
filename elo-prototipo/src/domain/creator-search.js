import {formatProfileLocation} from './profile-location.js';

export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR').trim();


export function searchCreators({campaigns=[],creatorProfiles=[],accounts=[],query='',includeBanned=false}={}) {
  const creators=new Map(), accountMap=new Map(accounts.map(a=>[a.id,a]));
  for(const account of accounts) if(account.role==='creator') creators.set(account.id,{id:account.id,name:account.name});
  for(const campaign of campaigns) if(!creators.has(campaign.creatorId)) creators.set(campaign.creatorId,{id:campaign.creatorId,name:campaign.creator});
  const profiles=new Map(creatorProfiles.map(p=>[p.creatorId,p])), term=normalizeSearch(query);
  return [...creators.values()].map(creator=>{
    const profile=profiles.get(creator.id)||{},account=accountMap.get(creator.id);
    const projects=campaigns.filter(c=>c.creatorId===creator.id&&!c.deletedAt);
    return {...creator,avatarUrl:account?.avatarUrl||null,bio:profile.bio||'',links:profile.links||[],joinedAt:profile.joinedAt||null,location:profile.location||null,banned:Boolean(account?.banned),projectCount:projects.length,campaigns:projects};
  }).filter(c=>(includeBanned||!c.banned)&&(!term||normalizeSearch(`${c.name} ${c.bio} ${formatProfileLocation(c.location)}`).includes(term)))
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
