import {projectImage} from './project-image.js';
import {renderFundingProgress} from './project-detail.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((value||0)/100);
const number=value=>new Intl.NumberFormat('pt-BR').format(value||0);
const percent=p=>Math.round(p.raisedCents/p.goalCents*100);

export function renderCampaignCard(campaign,{saved=false,icon=()=>''}={}) {
  const status=campaign.deletedAt?'Excluído':campaign.monthly?'Apoio mensal':campaign.featured?'Em destaque':'';
  return `<article class="campaign-card">
    <div class="card-cover"><button class="card-image-button" data-action="project" data-id="${esc(campaign.id)}" aria-label="Conhecer ${esc(campaign.title)}"><img src="${projectImage(campaign.image)}" alt="" loading="lazy" width="1280" height="800"></button>
    ${campaign.deletedAt?'':`<button class="save-button ${saved?'saved':''}" data-action="save" data-id="${esc(campaign.id)}" aria-label="${saved?'Remover dos salvos':'Salvar projeto'}: ${esc(campaign.title)}" aria-pressed="${saved}">${icon('bookmark')}</button>`}</div>
    <div class="card-body"><div class="card-kicker"><span class="card-category">${esc(campaign.category)}</span>${status?`<span class="card-status${campaign.deletedAt?' card-status--deleted':''}">${esc(status)}</span>`:''}</div>
    <h3><button class="card-title" data-action="project" data-id="${esc(campaign.id)}">${esc(campaign.title)}</button></h3>
    <div class="creator-line">por ${esc(campaign.creator)}</div><p class="card-description">${esc(campaign.description)}</p>
    <div class="card-funding">${renderFundingProgress(campaign,{compact:true})}<div class="funding-line"><strong>${money(campaign.raisedCents)}</strong><span>${percent(campaign)}% da meta</span></div><div class="card-footer"><span>${number(campaign.backers)} apoios</span><span>${campaign.daysLeft} dias restantes</span></div></div></div>
  </article>`;
}

export function renderDiscoveryHero(featured,{icon=()=>''}={}) {
  return `<section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy"><p class="eyebrow">Criatividade em movimento</p><h1 id="hero-title">Boas ideias merecem<br class="hero-line-break"> uma chance.</h1><p>Descubra projetos independentes e faça parte do que vem a seguir.</p><button type="button" class="text-button hero-link" data-action="scroll-projects">Encontrar um projeto ${icon('arrowRight')}</button></div>
    ${featured?`<article class="featured-project"><button class="featured-cover" data-action="project" data-id="${esc(featured.id)}" aria-label="Conhecer ${esc(featured.title)}"><img src="${projectImage(featured.image)}" alt="" width="1280" height="800" fetchpriority="high"></button><div class="featured-copy"><p class="eyebrow">Em destaque · ${esc(featured.category)}</p><h2><button data-action="project" data-id="${esc(featured.id)}">${esc(featured.title)}</button></h2><p class="featured-author">por ${esc(featured.creator)}</p><div class="featured-funding"><strong>${money(featured.raisedCents)}</strong><span>${percent(featured)}% da meta</span></div><button type="button" class="text-button" data-action="project" data-id="${esc(featured.id)}">Conhecer projeto ${icon('arrowRight')}</button></div></article>`:''}
  </section>`;
}
