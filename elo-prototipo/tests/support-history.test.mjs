import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSupportHistoryStatus} from '../src/components/support-history.js';

const actor={id:'supporter1',role:'supporter'};
const campaign={id:'c1',creatorId:'creator1'};
const pending={id:'p1',status:'pending',supporterId:actor.id,campaignId:campaign.id};
const confirmed={...pending,status:'confirmed',mode:'monthly',subscriptionStatus:'active'};
const render=context=>renderSupportHistoryStatus({...context,icon:()=>''});

test('pagamento devolvido preserva comprovante e não oferece nova cobrança',()=>{
  const html=render({actor,campaign,support:{...confirmed,refundStatus:'completed',subscriptionStatus:'canceled'}});
  assert.match(html,/Apoio devolvido/);
  assert.match(html,/data-action="receipt"/);
  assert.doesNotMatch(html,/data-action="renew-subscription"|data-action="support"/);
});

test('pagamento pendente de projeto excluído fica cancelado no histórico',()=>{
  const html=render({actor,campaign:null,support:{...pending,status:'canceled',cancellationReason:'project_deleted'}});
  assert.match(html,/Cobrança cancelada pela exclusão do projeto/);
  assert.doesNotMatch(html,/data-action=/);
});

test('projeto indisponível ou conta suspensa bloqueia confirmação e renovação, mas permite cancelar assinatura ativa',()=>{
  for(const context of [
    {actor,campaign:null},
    {actor,campaign:{...campaign,deletedAt:'2026-11-24T13:00:00Z'}},
    {actor,campaign,creator:{id:'creator1',suspended:true}},
    {actor:{...actor,suspended:true},campaign},
  ]){
    assert.doesNotMatch(render({...context,support:pending}),/data-action="pending-confirm"/);
    const active=render({...context,support:confirmed});
    assert.doesNotMatch(active,/data-action="renew-subscription"/);
    assert.match(active,/data-action="cancel-subscription"/);
  }
  assert.match(render({actor,campaign,support:pending}),/data-action="pending-confirm"/);
  assert.match(render({actor,campaign,support:confirmed}),/data-action="renew-subscription"/);
});
