import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'elo_demo';
const duration = 7 * 24 * 60 * 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));

export function createSessions(secret, { secure = false, now = () => Date.now() } = {}) {
  if (typeof secret !== 'string' || secret.trim().length < 32 || /substitua/i.test(secret)) throw new Error('Configure SESSION_SECRET aleatório com pelo menos 32 caracteres. Execute npm run setup.');
  const sign = payload => createHmac('sha256',secret).update(payload).digest('base64url');
  const issue = session => {
    const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
    return `${COOKIE_NAME}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${duration}${secure ? '; Secure' : ''}`;
  };
  return {
    create(workspaceId) { return { workspaceId, actorId:'supporter1', csrfToken:randomBytes(32).toString('base64url'), expires:now()+duration*1000 }; },
    read(cookie) {
      const token = String(cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length+1);
      if (!token || token.length > 2048) return null;
      const [payload,signature,...rest] = token.split('.');
      if (rest.length || !payload || !equal(signature,sign(payload))) return null;
      try {
        const s = JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
        if (!uuid.test(s.workspaceId) || !['supporter1','creator1','admin1'].includes(s.actorId) || typeof s.csrfToken !== 'string' || s.csrfToken.length !== 43 || !Number.isSafeInteger(s.expires) || s.expires <= now()) return null;
        return s;
      } catch { return null; }
    },
    issue,
    csrfValid: (session, token) => equal(session?.csrfToken,token),
  };
}
