import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthThrottle, createWorkLimiter } from '../server/security/limits.mjs';

const rateLimited = { status: 429, code: 'AUTH_RATE_LIMIT' };

test('changing identifiers and authenticating successfully do not reset the IP budget', () => {
  const throttle = createAuthThrottle();
  const ip = '192.0.2.1';
  for (let i = 0; i < 30; i++) {
    throttle.check(ip, `user-${i}`);
    throttle.success(ip, `user-${i}`);
  }

  assert.throws(() => throttle.check(ip, 'completely-new-user'), rateLimited);
  assert.doesNotThrow(() => throttle.check('192.0.2.2', 'completely-new-user'));
});

test('identity normalization shares the limit and success clears only that identity', () => {
  const throttle = createAuthThrottle();
  const ip = '192.0.2.1';
  for (let i = 0; i < 8; i++) {
    throttle.check(ip, 'user@example.test');
    throttle.check(ip, 'other@example.test');
  }

  assert.throws(() => throttle.check(ip, ' USER@Example.Test '), rateLimited);
  assert.doesNotThrow(() => throttle.check('192.0.2.2', 'user@example.test'));
  throttle.success(ip, ' User@Example.Test ');
  assert.doesNotThrow(() => throttle.check(ip, 'user@example.test'));
  assert.throws(() => throttle.check(ip, 'other@example.test'), rateLimited);
});

test('a flooded IP and a flooded identity recover at the 15-minute boundary', () => {
  let now = 0;
  const throttle = createAuthThrottle({ clock: () => now });
  for (let i = 0; i < 30; i++) throttle.check('192.0.2.1', `user-${i}`);
  for (let i = 0; i < 8; i++) throttle.check('192.0.2.2', 'user-0');

  now = 899_999;
  assert.throws(() => throttle.check('192.0.2.1', 'user-0'), rateLimited);
  assert.throws(() => throttle.check('192.0.2.2', 'user-0'), rateLimited);
  now++;
  throttle.check('192.0.2.1', 'user-0');
  throttle.check('192.0.2.2', 'user-0');
});

test('when the IP map fills, unknown IPs cannot evict an active blocked IP', () => {
  let now = 0;
  const throttle = createAuthThrottle({ clock: () => now, maxIpEntries: 1 });
  for (let i = 0; i < 30; i++) throttle.check('192.0.2.1', `user-${i}`);

  assert.throws(() => throttle.check('192.0.2.2', 'user-0'), rateLimited);
  assert.throws(() => throttle.check('192.0.2.1', 'user-99'), rateLimited);
  now = 900_000;
  assert.doesNotThrow(() => throttle.check('192.0.2.2', 'user-0'));
});

test('when the identity map fills, new names cannot evict a blocked identity', () => {
  let now = 0;
  const throttle = createAuthThrottle({ clock: () => now, maxIdentityEntries: 1 });
  for (let i = 0; i < 8; i++) throttle.check('192.0.2.1', 'known-user');

  assert.throws(() => throttle.check('192.0.2.1', 'new-user'), rateLimited);
  assert.throws(() => throttle.check('192.0.2.1', 'known-user'), rateLimited);
  now = 900_000;
  assert.doesNotThrow(() => throttle.check('192.0.2.1', 'new-user'));
});

test('the authentication throttle requires a finite rate window and map capacities', () => {
  assert.throws(() => createAuthThrottle({ windowMs: 0 }), RangeError);
  assert.throws(() => createAuthThrottle({ maxIpEntries: Infinity }), RangeError);
  assert.throws(() => createAuthThrottle({ maxIdentityEntries: Infinity }), RangeError);
});

test('authentication admits two jobs and queues four in order even when a job fails', { timeout: 2000 }, async () => {
  const { run } = createAuthThrottle();
  const starts = [];
  const gates = Array.from({ length: 6 }, () => Promise.withResolvers());
  const started = Array.from({ length: 6 }, () => Promise.withResolvers());
  const failure = new Error('hash failed');
  const jobs = gates.map((gate, i) => run(() => {
    starts.push(i);
    started[i].resolve();
    return gate.promise;
  }));
  const firstRejected = assert.rejects(jobs[0], failure);

  await assert.rejects(run(() => assert.fail('job beyond capacity ran')), {
    status: 429,
    code: 'AUTH_BUSY',
  });
  assert.deepEqual(starts, [0, 1]);

  gates[0].reject(failure);
  await firstRejected;
  await started[2].promise;
  assert.deepEqual(starts, [0, 1, 2]);
  gates[1].resolve(1);
  await started[3].promise;
  assert.deepEqual(starts, [0, 1, 2, 3]);

  for (let i = 2; i < gates.length; i++) gates[i].resolve(i);
  assert.deepEqual(await Promise.all(jobs.slice(1)), [1, 2, 3, 4, 5]);
  assert.deepEqual(starts, [0, 1, 2, 3, 4, 5]);
});

test('the image limiter reports its own overload error and frees a synchronous throw', async () => {
  const { run } = createWorkLimiter({
    maxActive: 1, maxPending: 0, code: 'IMAGE_BUSY', message: 'Tente enviar a imagem novamente.',
  });
  const gate = Promise.withResolvers();
  const active = run(() => gate.promise);
  await assert.rejects(run(() => assert.fail('rejected decoder ran')), {
    status: 429,
    code: 'IMAGE_BUSY',
    message: 'Tente enviar a imagem novamente.',
  });
  gate.resolve();
  await active;
  const failure = new Error('decoder rejected input');
  await assert.rejects(run(() => { throw failure; }), failure);
  assert.equal(await run(() => 42), 42);
});
