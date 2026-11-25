import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { COOKIE_NAME, createSessions } from '../server/http/session.mjs';

// Chave conhecida apenas para testes; não corresponde à configuração do ambiente.
const SECRET = 'session-test-fixture-' + 'a'.repeat(48);
const WORKSPACE = '09ad09b5-b135-4f93-9906-cb069f845399';
const START = Date.parse('2026-11-20T15:00:00Z');
const AGE_SECONDS = 7 * 24 * 60 * 60;
const cookiePair = header => header.split(';', 1)[0];
const tokenFrom = header => cookiePair(header).slice(COOKIE_NAME.length + 1);
const encodeSigned = value => {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  const signature = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${COOKIE_NAME}=${payload}.${signature}`;
};

test('sessão rejeita segredo ausente, curto, espaços e placeholder de configuração', () => {
  for (const secret of [undefined, null, 1234, true, '', 'curto', 'a'.repeat(31), ' '.repeat(64), ` ${'a'.repeat(31)} `, 'SUBSTITUA_POR_UM_SEGREDO_ALEATORIO_VALIDO', 'suBstItUa_' + 'a'.repeat(40)]) {
    assert.throws(() => createSessions(secret), /SESSION_SECRET/);
  }
  assert.doesNotThrow(() => createSessions('a'.repeat(32)));
});

test('sessão cria identificador de cenário, personagem e token CSRF independente', () => {
  const sessions = createSessions(SECRET, { now: () => START });
  const first = sessions.create(WORKSPACE), second = sessions.create(WORKSPACE);
  assert.equal(first.workspaceId, WORKSPACE);
  assert.equal(first.actorId, 'supporter1');
  assert.match(first.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.csrfToken, second.csrfToken);
  assert.equal(first.expires, START + AGE_SECONDS * 1000);
  assert.deepEqual(sessions.read(cookiePair(sessions.issue(first))), first);
});

test('cookie utiliza HttpOnly, SameSite Strict, Path e prazo; Secure é configurável', () => {
  for (const secure of [false, true]) {
    const sessions = createSessions(SECRET, { secure, now: () => START });
    const header = sessions.issue(sessions.create(WORKSPACE));
    assert.match(header, /^elo_demo=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+;/);
    assert.match(header, /; Path=\//);
    assert.match(header, /; HttpOnly(?:;|$)/);
    assert.match(header, /; SameSite=Strict(?:;|$)/);
    assert.match(header, new RegExp(`; Max-Age=${AGE_SECONDS}(?:;|$)`));
    assert.equal(/; Secure(?:;|$)/.test(header), secure);
  }
});

test('cookie adulterado não permite trocar personagem ou cenário mantendo assinatura', () => {
  const sessions = createSessions(SECRET, { now: () => START });
  const session = sessions.create(WORKSPACE);
  const original = sessions.issue(session), [payload, signature] = tokenFrom(original).split('.');
  for (const patch of [
    { actorId: 'admin1' },
    { workspaceId: '38d04770-4e48-499c-9ce2-30273b4b0bb8' },
    { csrfToken: 'b'.repeat(43) },
    { expires: session.expires + AGE_SECONDS * 1000 },
  ]) {
    const changed = Buffer.from(JSON.stringify({ ...session, ...patch })).toString('base64url');
    assert.equal(sessions.read(`${COOKIE_NAME}=${changed}.${signature}`), null);
  }
  const changedSignature = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  assert.equal(sessions.read(`${COOKIE_NAME}=${payload}.${changedSignature}`), null);
  assert.deepEqual(sessions.read(cookiePair(original)), session);
});

test('cookie assinado com outro segredo é rejeitado', () => {
  const original = createSessions(SECRET, { now: () => START });
  const other = createSessions('other-test-key-' + 'b'.repeat(48), { now: () => START });
  const cookie = original.issue(original.create(WORKSPACE));
  assert.equal(other.read(cookiePair(cookie)), null);
});

test('sessão expira no limite exato e não é prorrogada pela leitura', () => {
  let clock = START;
  const sessions = createSessions(SECRET, { now: () => clock });
  const session = sessions.create(WORKSPACE), cookie = cookiePair(sessions.issue(session));
  clock = session.expires - 1;
  assert.equal(sessions.read(cookie).expires, session.expires);
  clock = session.expires;
  assert.equal(sessions.read(cookie), null);
  clock += 1000;
  assert.equal(sessions.read(cookie), null);
});

test('leitura de cookies ausentes, malformados ou excessivos falha de forma segura', () => {
  const sessions = createSessions(SECRET, { now: () => START });
  const valid = tokenFrom(sessions.issue(sessions.create(WORKSPACE)));
  for (const cookie of [undefined, null, '', 'other=value', `${COOKIE_NAME}=`, `${COOKIE_NAME}=abc`, `${COOKIE_NAME}=.sig`, `${COOKIE_NAME}=payload.`, `${COOKIE_NAME}=${valid}.extra`, `${COOKIE_NAME}=${'x'.repeat(2049)}`, `${COOKIE_NAME}=payload.sig`, `other=${valid}`]) {
    assert.equal(sessions.read(cookie), null);
  }
});

test('payload com assinatura válida ainda exige formato e prazo válidos', () => {
  const sessions = createSessions(SECRET, { now: () => START });
  const valid = sessions.create(WORKSPACE);
  for (const patch of [
    { workspaceId: '../outro-cenario' }, { workspaceId: null }, { actorId: 'creator2' },
    { actorId: 'admin' }, { csrfToken: 'x'.repeat(42) }, { csrfToken: 'x'.repeat(44) },
    { csrfToken: null }, { expires: String(valid.expires) }, { expires: START },
    { expires: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.equal(sessions.read(encodeSigned({ ...valid, ...patch })), null);
  for (const payload of [null, [], {}, 12, 'invalid']) assert.equal(sessions.read(encodeSigned(payload)), null);
});

test('cookie válido é localizado entre outros cookies e seleção assinada de personagem permanece válida', () => {
  const sessions = createSessions(SECRET, { now: () => START });
  const session = { ...sessions.create(WORKSPACE), actorId: 'creator1' };
  const cookie = `other=value; ${cookiePair(sessions.issue(session))}; preference=light`;
  assert.deepEqual(sessions.read(cookie), session);
});

test('CSRF exige token exato e rejeita ausência, alteração, tipo e tamanho incorretos', () => {
  const sessions = createSessions(SECRET, { now: () => START });
  const session = sessions.create(WORKSPACE);
  assert.equal(sessions.csrfValid(session, session.csrfToken), true);
  const altered = (session.csrfToken[0] === 'A' ? 'B' : 'A') + session.csrfToken.slice(1);
  for (const token of [undefined, null, '', 123, altered, session.csrfToken.slice(1), session.csrfToken + 'x', 'é'.repeat(43)]) {
    assert.equal(sessions.csrfValid(session, token), false);
  }
  assert.equal(sessions.csrfValid(undefined, session.csrfToken), false);
  assert.equal(sessions.csrfValid({}, session.csrfToken), false);
});
