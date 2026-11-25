const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
export function renderProjectMilestones(campaign) {
  if(!campaign.milestones?.length)return '';
  const steps=[{id:'principal',title:'Meta principal',description:'Financiamento inicial do projeto.',amountCents:campaign.goalCents},...campaign.milestones];
  let next=false;const total=campaign.raisedCents||0;
  return `<section class="project-milestones" aria-label="Metas do projeto"><h2>Metas do projeto</h2><p>Etapas de financiamento e o que o criador planeja disponibilizar.</p><ol>${steps.map(step=>{
    const reached=total>=step.amountCents,status=reached?'reached':!next?'next':'future';if(!reached)next=true;
    const percentage=Math.min(100,Math.round(total/step.amountCents*100));
    return `<li data-milestone-id="${esc(step.id)}" data-milestone-status="${status}"${status==='next'?' aria-current="step"':''}><div class="milestone-heading"><h3>${esc(step.title)}</h3><span>${reached?'Alcançada':status==='next'?'Próxima meta':'Meta futura'}</span></div><strong>${brl(step.amountCents)}</strong>${step.description?`<p>${esc(step.description)}</p>`:''}<div class="milestone-progress" role="progressbar" aria-label="Progresso de ${esc(step.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}" aria-valuetext="${brl(total)} de ${brl(step.amountCents)}, ${percentage}%"><span style="width:${percentage}%"></span></div><div class="milestone-caption"><span>${percentage}% desta meta</span><span>${reached?'Meta alcançada':`Faltam ${brl(step.amountCents-total)}`}</span></div></li>`;
  }).join('')}</ol></section>`;
}

export function renderMilestoneDraft(index, milestone = {}) {
  const prefix=`milestone-draft-${index}`,amount=milestone.amountCents===undefined?'':(milestone.amountCents/100).toFixed(2).replace('.',',');
  return `<fieldset class="milestone-draft" data-milestone-draft><legend>Meta adicional</legend><div class="form-group"><label for="${prefix}-title">Nome da etapa</label><input id="${prefix}-title" data-milestone-title required minlength="3" maxlength="100" value="${esc(milestone.title)}"></div><div class="form-group"><label for="${prefix}-description">O que será disponibilizado?</label><textarea id="${prefix}-description" data-milestone-description maxlength="600">${esc(milestone.description)}</textarea></div><div class="form-group"><label for="${prefix}-amount">Valor total da meta em reais</label><input id="${prefix}-amount" data-milestone-amount inputmode="decimal" required maxlength="13" value="${esc(amount)}"></div><button type="button" class="text-button" data-action="remove-milestone">Remover meta</button></fieldset>`;
}

export function renderMilestoneEditor(milestones=[]) {
  return `<section class="draft-section" aria-labelledby="campaign-milestones-title"><div class="draft-heading"><div><h3 id="campaign-milestones-title">Metas adicionais <span class="muted">· opcional</span></h3><p>Defina até 10 etapas acima da meta principal. Informe o valor total a alcançar, por exemplo R$ 70.000 para a versão alpha.</p></div><button type="button" class="btn secondary small" data-action="add-milestone">Adicionar meta</button></div><div id="campaign-milestones">${milestones.map((m,i)=>renderMilestoneDraft(i,m)).join('')}</div></section>`;
}
