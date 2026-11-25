import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeedState} from '../server/domain/platform.js';
import {renderCampaignCard,renderDiscoveryHero} from '../src/components/discovery.js';
const project=()=>structuredClone(createSeedState().campaigns[0]);
const icon=()=>'<svg aria-hidden="true"></svg>';

test('cartão mantém abertura, estado de salvo e valores do financiamento',()=>{
  const p=project();Object.assign(p,{raisedCents:123400,rewardRaisedCents:45600,goalCents:200000,backers:12});
  const before=structuredClone(p),html=renderCampaignCard(p,{saved:true,icon});
  assert.match(html,/data-action="project"/);assert.match(html,/aria-label="Conhecer Verde no concreto"/);
  assert.match(html,/aria-label="Remover dos salvos: Verde no concreto" aria-pressed="true"/);
  assert.match(html,/1\.234,00/);assert.match(html,/62% da meta/);assert.match(html,/12 apoios/);
  assert.match(html,/role="progressbar"/);assert.match(html,/project-progress-rewards/);
  assert.deepEqual(p,before);
});

test('cartão e destaque escapam conteúdo do criador e usam somente capas internas',()=>{
  const p=project();Object.assign(p,{id:'id" onclick="alert(1)',title:'<script>alert(1)</script>',description:'Descrição <img onerror="x">',creator:'Ana & <João>',image:'https://externo.example/foto.jpg'});
  for(const html of [renderCampaignCard(p,{icon}),renderDiscoveryHero(p,{icon})]){
    assert.doesNotMatch(html,/<script>|<img onerror|src="https:| onclick="/);
    assert.match(html,/&lt;script&gt;/);assert.match(html,/Ana &amp; &lt;João&gt;/);assert.match(html,/src="assets\/campaign-4\.svg"/);
  }
});

test('projeto excluído conserva abertura e indicação sem oferecer salvar',()=>{
  const html=renderCampaignCard({...project(),deletedAt:'2026-11-24T12:00:00Z'},{icon});
  assert.match(html,/Excluído/);assert.match(html,/data-action="project"/);assert.doesNotMatch(html,/data-action="save"/);
});

test('destaque permite conhecer o projeto e conserva capa própria segura',()=>{
  const p=project();p.image='/api/project-images/c1?v=123';
  const html=renderDiscoveryHero(p,{icon});
  assert.match(html,/data-action="project" data-id="c1"/);assert.match(html,/Conhecer projeto/);
  assert.match(html,/src="\/api\/project-images\/c1\?v=123"/);assert.match(html,/data-action="scroll-projects"/);
});

test('catálogo vazio conserva introdução e ação para encontrar projetos sem inventar destaque',()=>{
  const html=renderDiscoveryHero(null,{icon});
  assert.match(html,/<h1/);assert.match(html,/data-action="scroll-projects"/);assert.doesNotMatch(html,/<img|data-action="project"/);
});
