import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderCreatorRewardDeliveries,renderRewardDeliveryForm,renderSupportRewardDelivery} from '../src/components/reward-deliveries.js';
const actor={id:'creator1',role:'creator'},backer={id:'supporter1',role:'supporter'},campaign={id:'p1',creatorId:'creator1',title:'Meu jogo'},support={id:'s1',campaignId:'p1',creatorId:'creator1',supporterId:'supporter1',supporterName:'Ana',campaignTitle:'Meu jogo',rewardId:'r1',rewardTitle:'Jogo',status:'confirmed',refundStatus:'none'};
const delivery={id:'d1',contributionId:'s1',creatorId:'creator1',supporterId:'supporter1',campaignId:'p1',message:'Sua cópia <script>teste</script>',url:'https://example.test/privado',status:'available',version:1};
test('estúdio mostra entregas só para recompensas pagas e de projetos do próprio criador',()=>{
 const html=renderCreatorRewardDeliveries({contributions:[support,{...support,id:'s2',status:'failed'},{...support,id:'s3',refundStatus:'completed'}],campaigns:[campaign],deliveries:[],actor});
 assert.match(html,/Disponibilizar recompensa/);assert.match(html,/data-id="s1"/);assert.doesNotMatch(html,/data-id="s[23]"/);
 assert.equal(renderCreatorRewardDeliveries({contributions:[support],campaigns:[campaign],deliveries:[delivery],actor:backer}),'');
});
test('apoiador só vê sua entrega autorizada e link externo seguro, nunca promessa em pagamento recusado',()=>{
 const html=renderSupportRewardDelivery({support,campaign,delivery,actor:backer});assert.match(html,/https:\/\/example.test\/privado/);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/Confirmar recebimento/);assert.match(html,/&lt;script&gt;/);
 for(const item of [{...support,status:'failed'},{...support,status:'pending'},{...support,refundStatus:'completed'}])assert.equal(renderSupportRewardDelivery({support:item,campaign,delivery,actor:backer}),'');
 assert.equal(renderSupportRewardDelivery({support,campaign,delivery,actor:{id:'outro',role:'supporter'}}),'');
 assert.doesNotMatch(renderSupportRewardDelivery({support,campaign,delivery:{...delivery,url:'javascript:alert(1)'},actor:backer}),/href="javascript/);
});
test('confirmação e suspensão mostram estado em texto, sem novo botão de alteração',()=>{
 assert.match(renderSupportRewardDelivery({support,campaign,delivery:{...delivery,status:'received'},actor:backer}),/Recebimento confirmado/);
 assert.doesNotMatch(renderSupportRewardDelivery({support,campaign,delivery,actor:{...backer,suspended:true}}),/data-action="acknowledge-reward"/);
});
test('formulário de entrega oferece mensagem e link opcional, sem dados de endereço nem upload',()=>{
 const html=renderRewardDeliveryForm(support,delivery);assert.match(html,/id="reward-delivery-form"/);assert.match(html,/name="message"/);assert.match(html,/name="url"/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/type="file"|endereço residencial/);
});
