import { createHash } from 'node:crypto';

const failure = (code, message) => Object.assign(new Error(message), { status: 429, code });
const rateLimit = () => failure('AUTH_RATE_LIMIT', 'Muitas tentativas. Aguarde 15 minutos.');

export function createWorkLimiter({
  maxActive,
  maxPending,
  code = 'AUTH_BUSY',
  message = 'Muitas solicitações simultâneas. Tente novamente em instantes.',
}) {
  if (!Number.isSafeInteger(maxActive) || maxActive < 1 || !Number.isSafeInteger(maxPending) || maxPending < 0) {
    throw new RangeError('Os limites de execução e fila devem ser inteiros válidos.');
  }
  const pending = [];
  let active = 0;

  function start(task) {
    active++;
    return Promise.resolve().then(task).finally(() => {
      active--;
      pending.shift()?.();
    });
  }

  function run(task) {
    if (active < maxActive) return start(task);
    if (pending.length === maxPending) return Promise.reject(failure(code, message));
    return new Promise(resolve => pending.push(() => resolve(start(task))));
  }

  return { run };
}

function createAttemptBudget(maxEntries, maxAttempts, windowMs) {
  const entries = new Map();

  function consume(key, now) {
    // Every new bucket has the same window length, so insertion order is expiry order.
    for (const [expiredKey, entry] of entries) {
      if (entry.expiresAt > now) break;
      entries.delete(expiredKey);
    }
    let entry = entries.get(key);
    if (!entry) {
      // Preserve active buckets under saturation so new keys cannot reset a limit.
      if (entries.size >= maxEntries) throw rateLimit();
      entry = { attempts: 0, expiresAt: now + windowMs };
      entries.set(key, entry);
    }
    if (entry.attempts >= maxAttempts) throw rateLimit();
    entry.attempts++;
  }

  return { consume, clear: key => entries.delete(key) };
}

function identityKey(ip, identifier) {
  const canonical = String(identifier ?? '').trim().toLowerCase();
  const hash = createHash('sha256').update(canonical).digest('hex');
  return `${ip}:${hash}`;
}

export function createAuthThrottle({
  clock = () => Date.now(),
  windowMs = 15 * 60 * 1000,
  maxIpEntries = 2_000,
  maxIdentityEntries = 10_000,
} = {}) {
  if (![windowMs, maxIpEntries, maxIdentityEntries].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new RangeError('A janela e os limites de tentativas devem ser inteiros positivos.');
  }
  const ipBudget = createAttemptBudget(maxIpEntries, 30, windowMs);
  const identityBudget = createAttemptBudget(maxIdentityEntries, 8, windowMs);
  const { run } = createWorkLimiter({ maxActive: 2, maxPending: 4 });
  let lastTime = -Infinity;

  function check(ip, identifier) {
    // A wall-clock adjustment must not reorder expiration times or reset a budget.
    const now = Math.max(lastTime, clock());
    lastTime = now;
    ipBudget.consume(ip, now);
    identityBudget.consume(identityKey(ip, identifier), now);
  }

  function success(ip, identifier) {
    identityBudget.clear(identityKey(ip, identifier));
  }

  return { check, success, run };
}
