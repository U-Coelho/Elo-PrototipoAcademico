import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBlockedAccount,restrictionDeadline} from '../src/components/account-access.js';
import {punishmentExpiry} from '../src/domain/punishment-duration.js';

test('tela banida mostra motivo e prazo sem navegação ou conteúdo da conta',()=>{
  const markup=renderBlockedAccount({name:'<script>nome</script>',moderationReason:'<img src=x> motivo',moderationExpiresAt:'2026-12-01T15:00:00.000Z'});
  assert.match(markup,/Conta banida/);assert.match(markup,/01\/12\/2026/);assert.match(markup,/12:00/);
  assert.match(markup,/&lt;script&gt;/);assert.doesNotMatch(markup,/<script>|<img |global-search|data-action="navigate"/);
  assert.match(markup,/data-action="refresh-state"/);assert.match(markup,/data-action="personas"/);
  assert.equal(restrictionDeadline({moderationExpiresAt:null}),'Por tempo indefinido.');
});
test('prazo escolhido usa a duração exata e distingue indefinido de data personalizada',()=>{
  const now=Date.parse('2026-11-23T12:00:00Z');
  assert.equal(punishmentExpiry('1h','',now),'2026-11-23T13:00:00.000Z');
  assert.equal(punishmentExpiry('1d','',now),'2026-11-24T12:00:00.000Z');
  assert.equal(punishmentExpiry('7d','',now),'2026-11-30T12:00:00.000Z');
  assert.equal(punishmentExpiry('30d','',now),'2026-12-23T12:00:00.000Z');
  assert.equal(punishmentExpiry('indefinite','',now),null);
  assert.equal(punishmentExpiry('custom','2026-11-23T12:01:00Z',now),'2026-11-23T12:01:00.000Z');
  for(const [duration,until] of [['custom',''],['custom','inválido'],['custom','2026-11-23T12:00:00Z'],['custom','2026-11-22T12:00:00Z'],['desconhecido','']])assert.throws(()=>punishmentExpiry(duration,until,now),/prazo válido/);
});
