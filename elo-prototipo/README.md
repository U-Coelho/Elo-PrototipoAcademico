# Elo — ideias que conectam

Versão 2 do protótipo acadêmico de financiamento coletivo: **API Node.js + PostgreSQL + Docker Compose**. O catálogo inicial e os pagamentos são fictícios. A versão atual oferece cadastro e autenticação com usuário, e-mail, senha e papel de criador ou apoiador. Não utiliza cartão, CPF, conta bancária ou provedor de pagamento real.

## Executar com Docker

Pré-requisitos: Docker Desktop com o mecanismo iniciado e Compose disponível, além de Node.js 22.9+ para o gerador local de configuração. O host não precisa instalar PostgreSQL. A aplicação e o banco rodam em dois containers.

Extraia o ZIP, abra o PowerShell na pasta `elo-prototipo` e confira que ela contém `compose.yaml`. O arquivo `LEIA-ME-DOCKER-WINDOWS.txt` também apresenta o roteiro de execução. Se o Compose informar que não encontrou configuração, o terminal está em outra pasta; entre na pasta que contém esse arquivo antes de executar.

```sh
node scripts/setup-env.mjs
docker compose up -d --build
```

Abra http://localhost:3000. O primeiro comando gera `.env` com uma senha local do banco e um segredo de sessão aleatórios. Não sobrescreve configurações existentes e não imprime os valores. Não envie `.env` ao GitHub.

Se a porta 3000 já estiver ocupada, altere `PORT=3001` em seu `.env`, execute novamente `docker compose up -d` e abra http://localhost:3001. O endereço localhost funciona no computador que executa os containers; o colega deve iniciar a própria instalação. Na instalação nova, ele cria suas próprias contas e gera seu próprio administrador pelo procedimento abaixo.

A primeira inicialização aplica as migrações SQL. As contas autenticadas compartilham uma plataforma. A primeira ativação reaproveita o workspace mais recentemente atualizado (ou cria o catálogo inicial se não houver nenhum). Os demais cenários antigos permanecem no banco. Os perfis ilustrativos antigos não recebem senhas de acesso. O banco não tem porta publicada no host. O volume `postgres_data` conserva os registros quando os containers são recriados.

```sh
docker compose ps
docker compose logs app
docker compose down
```

`down` encerra o ambiente conservando o volume. Evite opções de remoção de volumes quando quiser preservar os cenários. Reiniciar cenário e trocar de personagem são operações bloqueadas no modo autenticado.

## Cadastro, login e administrador fixo — 25/11/2026

O cadastro solicita usuário (3–32 letras, números, ponto, traço ou sublinhado), e-mail, senha (12–128 caracteres) e tipo de conta. Usuário e e-mail são únicos sem diferenciar maiúsculas. E-mails não são apresentados publicamente. A senha usa scrypt com salt aleatório, N=131072/r=8/p=1; não é armazenada em texto. Sessões opacas de sete dias ficam no PostgreSQL, com cookie HttpOnly/SameSite=Strict, rotação no login e revogação no logout. Há proteção CSRF/origem e limitação de tentativas de autenticação.

Para criar o único administrador reservado (`admin1`, login `admin`, e-mail `admin@elo.local`), execute uma vez no PowerShell, salvando a saída em arquivo privado:

```powershell
docker compose exec -T app node server/setup-admin.mjs | Set-Content -Encoding utf8 .admin-acesso.json
```

O arquivo contém a senha inicial aleatória: abra-o localmente e guarde o acesso. Não compartilhe, publique ou versione esse arquivo. A ferramenta não altera a senha se o administrador já existir. No ambiente preparado por Codex, esse acesso fica em `.local/admin-acesso.json` no projeto de trabalho, fora do ZIP. Cadastro público nunca cria administrador.

A migração `005_authentication.sql` acrescenta usuários, sessões e a referência à plataforma compartilhada; favoritos passam a ser separados por conta. As tabelas anteriores e seus saldos são preservados. Criadores veem suas finanças; apoiadores veem seus próprios apoios; o administrador conserva moderação e logs. O e-mail é um contato cadastrado, ainda sem verificação de titularidade. Recuperação de senha por e-mail e MFA não fazem parte desta etapa.

## Compartilhar o projeto

Compartilhe o ZIP de código e documentação, que inclui este README, o guia Windows, `.env.example` com marcadores e `docs/Documentacao-Arquitetural-Elo.pdf`. O texto editável está em `docs/ARQUITETURA.md`, com os diagramas em `docs/figuras/`.

O pacote não deve conter `.env`, `.local/`, `.admin-acesso.json`, `backups/`, bancos exportados, sessões, `.git/` ou `node_modules/`. Esses arquivos são privados ou pertencem à instalação local. As contas cadastradas e as credenciais da sua instalação não são copiadas para a instalação de quem recebe o código. As credenciais literais usadas em testes são fixtures de teste; não são o acesso administrativo local.

## Explorar a demonstração

1. Abra uma campanha e escolha apoio pontual ou mensal.
2. Revise o valor e selecione pagamento confirmado, pendente ou recusado.
3. Em Meus apoios, confirme ou recuse uma pendência e consulte o comprovante.
4. No apoio mensal original, escolha **Gerar próxima cobrança**. Cada ciclo tem um pagamento próprio; o valor só entra após confirmação. Não há relógio ou cobrança automática.
5. Cancele a recorrência: os pagamentos confirmados ficam no histórico, as cobranças pendentes da assinatura são invalidadas e novas cobranças são bloqueadas.
6. Entre com uma conta de criador. Crie um projeto, escolha a categoria e adicione recompensas opcionais. Em **Editar perfil**, configure bio, links, cidade e UF opcionais. Na criação ou na engrenagem do projeto, escolha uma capa própria (JPG/PNG/WebP estático até 5 MB).
7. Em Financeiro, consulte **Arrecadação no período**, escolhendo um projeto ou todos os seus projetos e os últimos 7 ou 30 dias. Os mesmos filtros atualizam a lista de apoios confirmados e a exportação do período.
8. Com o administrador fixo, abra **Administração** para gerenciar projetos, contas, comentários, mensagens e logs. Registre um motivo ao excluir/restaurar projetos, aplicar/alterar/encerrar punições de conta ou remover/restaurar comentários.

O tema claro/noturno continua disponível e é a única preferência persistida em localStorage. Os dados de negócio vêm da API e ficam no PostgreSQL.

Cada projeto oferece abas **Sobre, Criador, Atualizações e Comentários**. A aba **Recompensas** aparece somente se houver opções cadastradas. O perfil do criador apresenta bio, links, data de criação da conta e quantidade de projetos. Os links são endereços públicos de perfis/sites; não há integração OAuth ou verificação de titularidade de contas externas. Somente o criador responsável publica atualizações; apoiadores e criadores podem comentar, com autoria e data atribuídas pelo servidor.

A busca encontra projetos e criadores. Na seção de criadores, pesquisa nome e bio sem distinguir maiúsculas ou acentos, e abre o perfil público com seus projetos. As categorias disponíveis são **Tecnologia, Arte e cultura, Impacto social, Educação, Jogos, Filmes e vídeos, Design, Ativismo, Artes, Jornalismo e Podcast**.

Ao visualizar seu projeto, o criador encontra a engrenagem **Configurar projeto**. Somente o responsável pode editar o projeto. O diálogo permite editar nome, categoria, descrição, apresentação, meta, prazo restante e apoio mensal sem sair da página. Não altera saldos, contribuições, autoria ou recompensas existentes. A modalidade mensal permanece habilitada enquanto houver recompensas mensais ou assinaturas ativas.

O painel administrativo tem cinco abas: **Projetos, Contas, Comentários, Mensagens e Logs**. Excluir um projeto realiza devoluções integrais simuladas dos apoios confirmados registrados, cancela pendências e encerra assinaturas, preservando o histórico. Criadores excluem os próprios projetos; a administração também pode excluir e restaurar. Sem saldo geral suficiente, a exclusão inteira é bloqueada. Restaurar recupera a publicação, sem desfazer devoluções ou reativar assinaturas. Remover um comentário altera sua visibilidade e permite restauração; ambas as ações exigem motivo. Os logs podem ser filtrados por conta/criador, considerando tanto o responsável pela ação quanto as contas relacionadas.

Há dois tipos de punição de conta: **suspensão**, que permite consultar o conteúdo e bloqueia publicar, apoiar, enviar mensagens e editar; e **banimento**, que bloqueia o acesso à conta e a leitura do conteúdo. A conta suspensa pode cancelar uma assinatura existente para impedir novas renovações; a conta banida não acessa essa operação. Cada punição exige motivo e pode ter uma data de término ou prazo indeterminado. A administração pode alterar o tipo/prazo ou encerrar a punição. O servidor calcula sua vigência pelo próprio relógio, sem depender de cron ou do relógio do navegador.

As ações administrativas próximas ao conteúdo foram concentradas: no perfil, aplicar, alterar ou encerrar punições; no projeto, somente excluir/restaurar; no comentário, remover/restaurar e abrir o perfil do autor. Logs ficam exclusivamente no painel administrativo. A administração não pode editar perfis de outras pessoas nem configurar projetos alheios, inclusive pela API.

Criadores também podem apoiar projetos de outros criadores e acompanhar seus pagamentos em **Meus apoios**. Apoiadores continuam sem permissão de criar projetos. Apoios feitos pelo criador são separados dos recebimentos de suas campanhas; o pagamento simulado usa uma origem externa e não debita a carteira de arrecadação. Apoiar o próprio projeto é bloqueado.

Criadores e apoiadores encontram **Meu perfil** na seção **Meu espaço** da barra lateral, com edição da própria bio e dos links públicos. Os controles de foto ficam exclusivamente em **Meu perfil → Editar perfil → Foto de perfil**. Escolha JPG, PNG ou WebP de até 2 MB, confira a prévia e clique em **Salvar foto**; **Remover foto** restaura as iniciais. Salvar ou remover a foto conserva a bio e os links ainda não salvos no diálogo. O servidor valida o conteúdo, rejeita animações e imagens acima de 16 milhões de pixels, recorta para 512 × 512 e regrava como JPEG sem metadados. A migração aditiva `006_profile_photos.sql` guarda a foto no PostgreSQL, ligada à conta autenticada, sem alterar saldos ou dados existentes. Suspensão e banimento bloqueiam a edição e o envio da foto.

O chat é privado entre a administração e o criador selecionado. O criador responde em **Mensagens** quando sua conta está liberada; o administrador seleciona o destinatário na aba administrativa. Use **Atualizar conversa** para buscar novas mensagens: não há WebSocket ou entrega automática em tempo real. Outros participantes não recebem essas conversas. O corpo das mensagens não é copiado para os logs administrativos. A troca de personas permanece somente no adaptador legado utilizado por testes; os servidores de execução exigem autenticação.

A migração `004_timed_account_moderation.sql` acrescenta tipo e prazo à moderação de contas e converte os banimentos antigos, preservando os registros financeiros. Enquanto houver banimento ativo, a resposta da API para essa persona não entrega as coleções de conteúdo. Um temporizador da interface apenas atualiza o estado apresentado; a autorização e a expiração são sempre decididas pelo servidor.

Pagamentos com recompensa integram o financiamento uma única vez. A barra separa apoio direto (azul acinzentado) e apoio com recompensa (verde azulado), com legenda e valores. Um recebimento de R$ 100,00 com recompensa de preço mínimo R$ 50,00 aumenta o total e a parcela de recompensas em R$ 100,00, sem acrescentar o preço novamente. Pendências e recusas não alteram os totais; renovações confirmadas conservam o vínculo da recompensa. Os valores antigos sem vínculo não são reclassificados por aproximação de preço.

O aviso da simulação fica concentrado no rodapé, com detalhes acessíveis pelo mesmo botão. Os arquivos exportados conservam sua identificação para serem compreendidos fora da aplicação.

O gráfico soma apenas entradas financeiras vinculadas a apoios confirmados, agrupadas pelo dia da confirmação no calendário de Brasília (`America/Sao_Paulo`), incluindo o dia atual. Saldo inicial, arrecadação ilustrativa do catálogo sem lançamento correspondente, repasses, pagamentos pendentes e recusados ficam fora desse histórico. Sem recebimentos no filtro selecionado, a interface explica a ausência de dados em vez de inventar uma curva.

Use **Consultar valores por dia** para abrir a alternativa em tabela. Com o gráfico focado pelo teclado, as setas esquerda/direita consultam os dias, Home/End levam ao primeiro/último e Escape fecha o detalhe. O saldo disponível e os repasses dos cartões continuam sendo totais da conta da criadora; o filtro de projeto não cria uma carteira separada. **Ver extrato completo da conta** mantém o histórico geral, independentemente dos filtros do gráfico.

## Metas, entregas e prazo de exclusão

Na criação e em **Configurar projeto**, o criador pode cadastrar até dez metas adicionais, únicas e acima da principal. São valores totais cumulativos: uma meta principal de R$ 45 mil e uma etapa de R$ 70 mil exigem R$ 70 mil ao todo. Atingir uma etapa não gera pagamento, repasse ou entrega automática.

Em **Meu estúdio → Entregas de recompensas**, o criador disponibiliza mensagem e link HTTPS para cada apoio confirmado com recompensa e sem devolução. O apoiador consulta em **Meus apoios** e confirma o recebimento. Editar a entrega exige nova confirmação; repetir o mesmo envio não duplica a entrega. Só o criador e o apoiador participante recebem esse conteúdo, inclusive na API; o administrador não recebe o link privado. O destino externo é administrado por quem fornece o link.

Após a exclusão e o reembolso integral, o projeto fica recuperável por 30 dias. O criador recupera somente uma exclusão própria; remoção administrativa exige administrador. Ao recuperar, os reembolsos e cancelamentos permanecem. Depois de 720 horas, a rotina de manutenção remove conteúdo, imagens, comentários e entregas, preservando apenas a referência necessária e o histórico financeiro. A rotina executa na inicialização e a cada minuto; não agenda projetos legados sem prazo explícito.

Na revisão de 25/11, a API foi alinhada para permitir criação de campanhas somente por criador. Títulos de diálogos são tratados como texto e os limites de links são validados após normalização. Consulte `docs/REVISAO-FINAL.md` e `docs/VERIFICACAO.md` para as correções e evidências.

## Testes

Para testes de domínio, cliente HTTP, sessões e integração com PostgreSQL embarcado:

```sh
npm ci --ignore-scripts
npm test
npm run check:compose
```

Os testes embarcados usam PGlite (PostgreSQL em WebAssembly), no processo Node, e um adaptador de conexão única serializada. Validam SQL, persistência, rollback e a API, mas não comprovam concorrência entre conexões reais de um servidor PostgreSQL.

Após subir os containers, execute os nove cenários de PostgreSQL real, incluindo duas conexões físicas concorrentes:

```sh
docker compose exec -e ELO_RUN_POSTGRES_TESTS=1 app node --test tests/postgres.test.mjs
```

Esses testes criam cenários UUID próprios e removem somente os cenários que criaram. Sem a ativação explícita e DATABASE_URL, essa suíte registra skip. A inspeção `check:compose` verifica estrutura e convenções; não executa o Docker.

## Prévia de desenvolvimento sem Docker

```sh
npm ci --ignore-scripts
npm run setup
npm run dev:embedded
```

Abra http://127.0.0.1:3000. Essa prévia usa o mesmo backend e esquema SQL, com PostgreSQL embarcado/WASM e dados em `.local/postgres-wasm`. É uma opção de desenvolvimento, separada da configuração principal Docker com PostgreSQL de servidor. Nenhum fallback para dados financeiros no navegador é utilizado.

Para conectar um PostgreSQL externo de testes, configure DATABASE_URL e execute `npm run dev`. A execução normal em Docker obtém a configuração do Compose.

## Backup e restauração do banco Docker

Com o banco em execução:

```sh
npm run db:backup
```

O backup binário é gravado na pasta ignorada `backups/`, sem passar por redirecionamentos de texto do PowerShell. Dumps novos não incluem dados de sessões. O restaurador verifica se a aplicação está parada, usa uma transação única e revoga sessões, inclusive em dumps antigos. Não reinicia a aplicação automaticamente. Para substituir o banco fictício pelo conteúdo de um backup, pare a aplicação, mantenha o banco ligado e use a confirmação explícita:

```sh
docker compose stop app
node scripts/restore.mjs backups/ARQUIVO.dump --confirm-demo-restore
docker compose up -d app
```

A restauração substitui os dados do banco `elo`, incluindo cenários de outros navegadores. É um procedimento manual para o ambiente acadêmico. Um volume persistente não substitui uma cópia de backup.

## Organização e decisões

- `src/app.js`, `src/styles.css`, `src/theme.js`: interface responsiva e temas.
- `src/services/api.js`: cliente HTTP, cache da resposta, CSRF e fila de comandos. Não decide saldo ou permissão.
- `src/domain/catalog.js`: catálogo público fictício compartilhado.
- `src/domain/revenue-report.js`: projeção de leitura dos recebimentos confirmados por projeto, período e dia de Brasília; não altera saldos.
- `src/components/revenue-chart.js`, `src/revenue-chart.css` e `src/finance-report.css`: gráfico de linha, alternativa em tabela e apresentação financeira nos dois temas.
- `server/http/app.mjs`: rotas, validação HTTP, limites e execução dos comandos.
- `server/http/session.mjs`: cookie assinado, atributos HttpOnly/SameSite, expiração e CSRF.
- `server/auth/authentication.mjs`: cadastro, autenticação, sessões revogáveis e rotas autorizadas das fotos.
- `server/profile/avatar.mjs`: limites, decodificação e normalização das fotos com sharp.
- `server/domain/platform.js`: regras de campanhas, apoios, cobranças, financeiro e auditoria.
- `server/repository/postgres.js`: persistência normalizada, transações e bloqueio por cenário.
- `server/db/migrations`: esquema SQL versionado com restrições e chaves estrangeiras.
- `Dockerfile`, `compose.yaml`: aplicação sem root, banco interno, volume e healthcheck.
- `docs/ARQUITETURA.md`: diagramas, coesão, acoplamento, conascência e trade-offs.
- `docs/IHC-E-SEGURANCA.md`: pesquisa e decisões de interface/segurança.
- `docs/VERIFICACAO.md`: evidências e limites da validação.

Cada mutação bloqueia a linha do cenário com FOR UPDATE, reconstrói o domínio e grava as tabelas relacionadas na mesma transação. A implementação substitui o pequeno agregado do cenário dentro da transação. Isso simplifica o protótipo; operações incrementais e bloqueios mais específicos seriam necessários em escala maior.

## Fronteira da simulação

A execução atual usa contas autenticadas; a API resolve identidade e papel pelo cookie de sessão opaco, revogável no PostgreSQL. O teste legado ainda exerce personas fixas em cenários isolados. Uma publicação externa exige HTTPS com COOKIE_SECURE=true, revisão de privacidade e operação; pagamentos continuam simulados.

Não há redundância, replicação ou alta disponibilidade neste escopo. As metas e os prazos são ilustrativos, sem encerramento ou estorno automático por meta. A taxa fictícia é zero; o saldo inicial da criadora é independente da arrecadação ilustrativa do catálogo.

Esta versão Docker deve rodar localmente ou em infraestrutura compatível com containers. O link anterior do Sites contém a prévia estática da versão 1; ele não executa este backend nem este banco. O build em `dist/` prepara somente os arquivos de interface, que dependem da API.

## Ambiente de validação

Em 24/11/2026, o comando padrão identificou 226 testes: 225 aprovados, zero falhas e um skip da suíte opt-in de PostgreSQL real. Essa suíte aprovou separadamente sete cenários (o TAP conta também o pai). A cobertura inclui capas normalizadas, localização, devoluções, limites de autenticação e capacidade, privacidade e concorrência com repasses/confirmacões. Build da interface aprovado com 24 entradas e sete recursos. Um backup anterior à atualização foi restaurado com sucesso em banco temporário separado, sem sessões, preservando o banco em uso. Os resultados da implantação Docker e seus limites estão em `docs/VERIFICACAO.md`. A inspeção de acessibilidade não é certificação WCAG ou teste com participantes.


## Capas, localização e devoluções

O criador pode escolher uma imagem na publicação do projeto. A engrenagem oferece Salvar capa, Descartar seleção e Remover capa própria; são ações separadas da edição do texto para conservar campos ainda não salvos. Sem capa própria, permanece a ilustração padrão. O servidor normaliza para JPEG 1280 × 800, sem metadados, limitado a 1 MiB. Não aceita SVG, animação ou mais de 16 milhões de pixels. A migração 007 guarda as imagens no PostgreSQL.

Cidade e UF em Meu perfil → Editar perfil são públicas e opcionais. Elas determinam a localização dos projetos existentes e novos; limpar ambos remove a localização. Não são solicitados endereço completo nem GPS.

A exclusão apresenta antes o valor a devolver, saldo, pendências e assinaturas. Usa o saldo geral do criador; fundos já repassados não são recompostos automaticamente. Apenas apoios registrados entram na devolução, inclusive recompensas e ciclos mensais; totais ilustrativos do catálogo não viram pagamentos fictícios adicionais. A migração 008 registra devoluções e cancelamentos. O gráfico conserva recebimentos brutos e apresenta devoluções e líquido do período separadamente.

Confira [revisão e segurança](docs/REVISAO-PROJETOS-E-SEGURANCA.md), [direção visual recomendada](docs/DIRECAO-VISUAL.md) e a documentação arquitetural atualizada. Para HTTPS, COOKIE_SECURE=true deve corresponder à configuração real de servidor/proxy; localhost HTTP usa false.


## Design editorial aplicado

A versão de 24/11 apresenta cartões abertos, capas proporcionais, destaque que abre o projeto, navegação discreta e categorias separadas da ordenação. As telas internas seguem a mesma hierarquia nos temas claro e noturno. Em celulares, as categorias podem ser percorridas horizontalmente. Atualize a instalação com docker compose up -d --build e recarregue a página para receber o visual. Detalhes em docs/DIRECAO-VISUAL.md.
