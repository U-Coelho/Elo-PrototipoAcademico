import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Run the actual scripts and file IO, replacing only the external Docker commands.
const dockerStub = `data:text/javascript,${encodeURIComponent(`
  import childProcess from 'node:child_process';
  import { EventEmitter } from 'node:events';
  import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
  import { syncBuiltinESMExports } from 'node:module';
  function docker(command, args, options) {
    if (command !== 'docker' || options.shell) throw new Error('Unexpected command');
    let status = 0;
    let stdout = '';
    const entry = { args };
    if (args.includes('ps')) {
      status = Number(process.env.ELO_TEST_PS_STATUS);
      stdout = process.env.ELO_TEST_PS_OUTPUT;
    } else if (args.includes('pg_restore')) {
      entry.input = readFileSync(options.stdio[0], 'utf8');
      status = Number(process.env.ELO_TEST_RESTORE_STATUS);
    } else if (args.includes('pg_dump')) {
      writeFileSync(options.stdio[1], 'PGDMPtest dump');
    } else if (args.includes('psql')) {
      status = Number(process.env.ELO_TEST_PSQL_STATUS);
    } else {
      throw new Error('Unexpected Docker operation');
    }
    appendFileSync(process.env.ELO_TEST_COMMAND_LOG, JSON.stringify(entry) + '\\n');
    return { status, stdout };
  }
  childProcess.spawnSync = docker;
  childProcess.spawn = (...args) => {
    const { status, stdout } = docker(...args);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    setImmediate(() => {
      child.stdout.emit('data', stdout);
      child.emit('close', status);
    });
    return child;
  };
  syncBuiltinESMExports();
`)}`;

async function runScript(t, script, options = {}) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'elo-backup-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const log = path.join(cwd, 'commands.jsonl');
  await writeFile(log, '');
  const backups = path.join(cwd, 'backups');
  const restore = script === 'restore';
  if (restore) {
    await mkdir(backups);
    await writeFile(path.join(backups, 'fixture.dump'), 'PGDMPtest dump');
  }
  const scriptPath = fileURLToPath(new URL(`../scripts/${script}.mjs`, import.meta.url));
  const args = restore ? ['backups/fixture.dump', '--confirm-demo-restore'] : [];
  const result = spawnSync(process.execPath, ['--import', dockerStub, scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      ELO_TEST_PS_OUTPUT: options.psOutput ?? '{"Service":"app","State":"exited"}\n',
      ELO_TEST_PS_STATUS: String(options.psStatus ?? 0),
      ELO_TEST_RESTORE_STATUS: String(options.restoreStatus ?? 0),
      ELO_TEST_PSQL_STATUS: String(options.psqlStatus ?? 0),
      ELO_TEST_COMMAND_LOG: log,
    },
  });
  if (result.error) throw result.error;
  const commands = (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  return { ...result, backups, commands };
}

test('backup writes the custom dump and excludes only the session table data', async t => {
  const result = await runScript(t, 'backup');
  assert.equal(result.status, 0, result.stderr);
  const [filename] = await readdir(result.backups);
  assert.match(filename, /\.dump$/);
  assert.equal(await readFile(path.join(result.backups, filename), 'utf8'), 'PGDMPtest dump');
  assert.deepEqual(result.commands, [{
    args: [
      'compose', 'exec', '-T', 'db', 'pg_dump', '-U', 'elo', '-d', 'elo',
      '--format=custom', '--exclude-table-data=public.auth_sessions',
    ],
  }]);
});

test('restore refuses to make database changes while any app container is active', async t => {
  const result = await runScript(t, 'restore', {
    psOutput: '{"Service":"app","State":"exited"}\n{"Service":"app","State":"paused"}\n',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /docker compose stop app/);
  assert.deepEqual(result.commands, [{ args: ['compose', 'ps', '--all', '--format', 'json', 'app'] }]);
});

test('restore refuses an unknown app state or a failed Compose command', async t => {
  for (const options of [{ psOutput: '{"Service":"app"}' }, { psStatus: 1 }, { psOutput: 'unparseable' }]) {
    const result = await runScript(t, 'restore', options);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.commands, [{ args: ['compose', 'ps', '--all', '--format', 'json', 'app'] }]);
  }
});

test('restore applies the custom dump atomically and then revokes sessions without starting app', async t => {
  const result = await runScript(t, 'restore', { psOutput: '[{"Service":"app","State":"exited"}]' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.commands.length, 3);
  assert.deepEqual(result.commands[0].args, ['compose', 'ps', '--all', '--format', 'json', 'app']);
  assert.deepEqual(result.commands[1], {
    args: [
      'compose', 'exec', '-T', 'db', 'pg_restore', '-U', 'elo', '-d', 'elo',
      '--single-transaction', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error',
    ],
    input: 'PGDMPtest dump',
  });
  const cleanup = result.commands[2].args;
  assert.deepEqual(cleanup.slice(0, -1), [
    'compose', 'exec', '-T', 'db', 'psql', '-X', '-U', 'elo', '-d', 'elo',
    '--set=ON_ERROR_STOP=1', '--command',
  ]);
  assert.match(cleanup.at(-1), /IF to_regclass\('public\.auth_sessions'\) IS NOT NULL THEN\s+DELETE FROM public\.auth_sessions;/);
  assert.match(result.stdout, /docker compose up -d app/);
});

test('restore skips session revocation if the transaction fails', async t => {
  const result = await runScript(t, 'restore', { restoreStatus: 1 });
  assert.notEqual(result.status, 0);
  assert.equal(result.commands.length, 2);
  assert.ok(result.commands[1].args.includes('pg_restore'));
  assert.match(result.stderr, /mantenha a aplicação parada/i);
  assert.equal(result.stdout, '');
});

test('restore reports a revocation failure and keeps app stopped', async t => {
  const result = await runScript(t, 'restore', { psqlStatus: 1 });
  assert.notEqual(result.status, 0);
  assert.equal(result.commands.length, 3);
  assert.ok(result.commands[2].args.includes('psql'));
  assert.match(result.stderr, /mantenha a aplicação parada/i);
  assert.equal(result.stdout, '');
});
