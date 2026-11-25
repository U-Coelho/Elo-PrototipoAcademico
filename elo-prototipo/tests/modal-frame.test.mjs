import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderModalFrame} from '../src/components/modal-frame.js';

test('título e subtítulo são texto literal mesmo com fragmentos de HTML incompletos',()=>{
  const body='<form id="reward-delivery-form"><button>Enviar</button></form>';
  const html=renderModalFrame({title:'Conta <img src=x',subtitle:'<style media=all /',body,closeIcon:'<svg aria-hidden="true"></svg>'});
  assert.match(html,/Conta &lt;img src=x<\/h2>/);assert.match(html,/<p>&lt;style media=all \/<\/p>/);
  assert.doesNotMatch(html,/<style|<img/);assert.match(html,/aria-label="Fechar janela"/);assert.ok(html.includes(body));
});

test('ampersands e aspas são escapados uma única vez pelo componente da janela',()=>{
  const html=renderModalFrame({title:'Arte & cultura',subtitle:'Equipe "A" & João',body:'<p>Conteúdo interno.</p>'});
  assert.match(html,/Arte &amp; cultura/);assert.match(html,/Equipe &quot;A&quot; &amp; João/);assert.doesNotMatch(html,/&amp;amp;/);
});

test('janela sem subtítulo conserva identificação, conteúdo e fechamento acessível',()=>{
  const html=renderModalFrame({title:'Pagamento recusado',body:'<p>Referência da tentativa.</p>'});
  assert.match(html,/id="modal-title" tabindex="-1"/);assert.doesNotMatch(html,/<p><\/p>/);assert.match(html,/data-action="close-modal"/);assert.match(html,/class="modal-content"><p>Referência da tentativa\.<\/p>/);
});
