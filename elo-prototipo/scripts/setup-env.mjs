import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
try { await access('.env'); console.log('.env já existe; nenhuma configuração foi alterada.'); }
catch {
  const password = randomBytes(24).toString('hex');
  const secret = randomBytes(48).toString('base64url');
  await writeFile('.env', `# Configuração local da demonstração. Não versionar.\nPOSTGRES_PASSWORD=${password}\nSESSION_SECRET=${secret}\nPORT=3000\nHOST=127.0.0.1\nDATABASE_URL=postgresql://elo:${password}@127.0.0.1:5432/elo\n`, { flag: 'wx', mode: 0o600 });
  console.log('.env criado com credenciais aleatórias locais. Nenhum valor secreto foi exibido.');
}
