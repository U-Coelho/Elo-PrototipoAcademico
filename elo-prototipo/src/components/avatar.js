const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export const safeAvatarUrl=value=>typeof value==='string'&&/^\/api\/avatars\/[a-zA-Z0-9_-]{1,160}(?:\?v=\d+)?$/.test(value)?value:null;
export function avatarContent(account={}){
  const url=safeAvatarUrl(account.avatarUrl);
  return url?`<img class="avatar-photo" src="${esc(url)}" alt="Foto de ${esc(account.name||'perfil')}" loading="lazy">`:esc(account.initials||String(account.name||'').trim().split(/\s+/).map(w=>w[0]||'').slice(0,2).join(''));
}
