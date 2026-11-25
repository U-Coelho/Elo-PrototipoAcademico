import { spawnSync } from 'node:child_process';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';

function runDocker(args, options, failureMessage) {
  const result = spawnSync('docker', args, options);
  if (result.error || result.status !== 0) throw new Error(failureMessage);
  return result.stdout;
}

function requireAppStopped() {
  const output = runDocker(
    ['compose', 'ps', '--all', '--format', 'json', 'app'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    'Não foi possível verificar o estado da aplicação no Docker Compose.',
  ).trim();

  let containers;
  try {
    // Compose versions emit either one JSON array or one JSON object per line.
    containers = output.startsWith('[')
      ? JSON.parse(output)
      : output.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  } catch {
    throw new Error('O Docker Compose retornou um estado da aplicação inválido.');
  }
  const stoppedStates = new Set(['created', 'exited']);
  if (!containers.every(container => container?.Service === 'app' && stoppedStates.has(container.State))) {
    throw new Error('A aplicação precisa estar parada. Execute docker compose stop app antes de restaurar.');
  }
}

const [filename, confirmation] = process.argv.slice(2);
if (!filename || confirmation !== '--confirm-demo-restore') {
  throw new Error('Uso: node scripts/restore.mjs backups/ARQUIVO.dump --confirm-demo-restore. Isso substitui os dados do banco de demonstração elo.');
}
const root = await realpath('backups');
const source = await realpath(filename);
const relative = path.relative(root, source);
if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
  throw new Error('Selecione um backup dentro da pasta backups deste projeto.');
}

const file = await open(source, 'r');
try {
  const signature = Buffer.alloc(5);
  await file.read(signature, 0, 5, 0);
  if (signature.toString() !== 'PGDMP') {
    throw new Error('Arquivo inválido: esperado backup PostgreSQL em formato custom.');
  }
  requireAppStopped();
  runDocker([
    'compose', 'exec', '-T', 'db', 'pg_restore', '-U', 'elo', '-d', 'elo',
    '--single-transaction', '--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error',
  ], { stdio: [file.fd, 'inherit', 'inherit'] }, 'Falha na restauração. Mantenha a aplicação parada e confira o erro.');

  // Older backups may predate authentication and do not always have this table.
  const revokeSessions = `DO $$
  BEGIN
    IF to_regclass('public.auth_sessions') IS NOT NULL THEN
      DELETE FROM public.auth_sessions;
    END IF;
  END;
  $$;`;
  runDocker([
    'compose', 'exec', '-T', 'db', 'psql', '-X', '-U', 'elo', '-d', 'elo',
    '--set=ON_ERROR_STOP=1', '--command', revokeSessions,
  ], { stdio: ['ignore', 'inherit', 'inherit'] }, 'Banco restaurado, mas houve falha ao revogar as sessões. Mantenha a aplicação parada até concluir a revogação.');
  console.log('Banco fictício restaurado e sessões revogadas. Para iniciar a aplicação, execute docker compose up -d app.');
} finally {
  await file.close();
}
