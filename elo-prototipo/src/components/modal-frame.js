const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

export function renderModalFrame({title,subtitle='',body='',closeIcon=''}={}) {
  return `<div class="modal-head"><div><h2 id="modal-title" tabindex="-1">${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar janela">${closeIcon}</button></div><div class="modal-content">${body}</div>`;
}
