import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src');
const destination = path.join(root, 'dist');
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
const required = [
  'index.html','app.js','styles.css','revenue-chart.css','finance-report.css','interface.css',
  'project-detail.css','project-forms.css','creator-search.css','admin-workspace.css',
  'project-milestones.css','reward-deliveries.css',
  'domain/catalog.js','domain/revenue-report.js','domain/creator-search.js',
  'domain/punishment-duration.js','domain/project-milestones.js','domain/reward-deliveries.js',
  'components/discovery.js','components/account-access.js','components/authentication.js',
  'components/avatar.js','components/revenue-chart.js','components/project-detail.js',
  'components/project-forms.js','components/creator-profile.js','components/admin-workspace.js',
  'components/payment-result.js','components/project-milestones.js','components/reward-deliveries.js',
  'components/modal-frame.js','services/api.js',
];
for (const file of required) await readFile(path.join(destination, file));
const assets = await readdir(path.join(destination, 'assets'));
console.log(`Build concluído: ${required.length} entradas verificadas; ${assets.length} recursos locais. Sem dependências externas de execução.`);
