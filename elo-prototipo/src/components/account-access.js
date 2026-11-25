const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export const restrictionDeadline=actor=>actor.moderationExpiresAt
  ? `Até ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(actor.moderationExpiresAt))} (horário de Brasília).`
  : 'Por tempo indefinido.';
export function renderBlockedAccount(actor) {
  return `<main id="main" class="blocked-account-page" tabindex="-1"><section class="panel"><p class="eyebrow">Acesso à conta</p><h1>Conta banida</h1><p>O acesso de ${esc(actor.name)} está bloqueado durante o período da punição.</p><p class="restriction-deadline">${esc(restrictionDeadline(actor))}</p><dl><dt>Motivo</dt><dd>${esc(actor.moderationReason||actor.banReason||'Consulte a administração.')}</dd></dl><div class="blocked-account-actions"><button class="btn" type="button" data-action="refresh-state">Verificar acesso</button><button class="btn secondary" type="button" data-action="personas">Trocar perfil</button></div></section></main>`;
}
