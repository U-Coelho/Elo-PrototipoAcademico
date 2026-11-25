const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)/100);
export function renderPaymentResult(c={}, {icon=()=>''}={}) {
  const refunded=c.refundStatus==='completed'||c.status==='refunded';
  const canceled=c.status==='canceled'||(c.cancellationReason&&c.status!=='confirmed');
  const recurring=!refunded&&c.status==='confirmed'&&c.subscriptionStatus==='canceled';
  const paid=c.status==='confirmed'&&!refunded&&!recurring;
  const pending=c.status==='pending'&&!canceled;
  const failed=c.status==='failed'&&!canceled;
  const title=refunded?'Apoio devolvido':canceled?'Pagamento cancelado':recurring?'Recorrência cancelada':paid?'Apoio confirmado':pending?'Apoio aguardando confirmação':failed?'Pagamento recusado':'Pagamento não confirmado';
  const heading=paid?'Pagamento confirmado':title;
  const explanation=refunded?'O valor foi devolvido. O pagamento original permanece no histórico.':recurring?'A recorrência foi cancelada; o pagamento confirmado permanece no histórico.':paid?`Seu apoio a ${esc(c.campaignTitle)} foi registrado.`:pending?'Nenhum valor foi creditado. Acompanhe a confirmação em Meus apoios.':failed||canceled?'Nenhum valor foi creditado. Você pode criar um novo apoio quando quiser.':'Consulte Meus apoios para verificar a situação.';
  const reference=c.status==='confirmed'||refunded?'Referência do pagamento':'Referência da tentativa';
  const reward=c.rewardTitle?`<p>${paid?'Recompensa:':'Recompensa escolhida:'} ${esc(c.rewardTitle)}</p>${paid?'':'<p class="form-hint">A seleção não confirma a entrega.</p>'}`:'';
  return {title,body:`<div class="confirmation"><div class="confirmation-icon">${icon(paid?'check':pending?'clock':'close')}</div><h3>${heading}</h3><span class="funding-big">${brl(c.amountCents)}${c.mode==='monthly'&&!c.isRenewal?'<small> / mês</small>':''}</span><p>${explanation}</p>${reward}<div class="receipt-reference"><span>${reference}</span><strong>${esc(c.transactionId)}</strong></div></div><div class="modal-footer"><button type="button" class="btn secondary" data-action="modal-navigate" data-page="projeto/${esc(c.campaignId)}">Ver projeto</button><button type="button" class="btn" data-action="modal-navigate" data-page="apoios">Ver meus apoios</button></div>`};
}
