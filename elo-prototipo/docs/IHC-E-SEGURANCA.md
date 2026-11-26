# Elo — decisões de IHC, acessibilidade e segurança

Registro de pesquisa e evolução. A implementação vigente e seus limites são descritos na documentação arquitetural revisada em 25/11/2026, em [ARQUITETURA.md](ARQUITETURA.md), e na [revisão final](REVISAO-FINAL.md).

## 1. Contexto e segurança das contas — 24/11/2026

A versão atual recebe cadastro com usuário, e-mail, senha e papel de criador ou apoiador. O catálogo inicial e as operações financeiras continuam fictícios. O cadastro não aceita administrador. A conta administrativa fixa é criada por ferramenta local com senha aleatória, sem credencial pública no código ou no ZIP.

As senhas são armazenadas usando scrypt N=2^17/r=8/p=1, salt aleatório de 16 bytes e comparação resistente a diferenças de tempo. Parâmetros alinhados à [OWASP — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) e à API [Node.js crypto.scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback). O token opaco de sessão é aleatório, guardado como hash no PostgreSQL e enviado em cookie HttpOnly/SameSite=Strict. Login rotaciona a sessão; logout a revoga. Há proteção CSRF/origem e limitação de tentativas. A implantação local permanece em loopback; uma publicação externa exige HTTPS e COOKIE_SECURE=true.

E-mail de contato é privado para o próprio usuário e a administração. A interface pública apresenta usuário, papel e conteúdos publicados. E-mail ainda não é verificado; recuperação de senha por e-mail e MFA não foram implementados. Senhas, tokens e arquivos de acesso administrativo devem permanecer fora do repositório, do pacote e dos logs. O modelo legado de personas livres permanece somente nos testes, sem troca de identidade pela API em execução.

A tela de cadastro apresenta somente os campos necessários, rótulos visíveis e autocomplete apropriado; o seletor oferece somente criador/apoiador. Login aceita usuário ou e-mail, retorna erro genérico para credenciais inválidas e possui botão de saída. Esses controles não equivalem a auditoria de segurança ou teste com participantes.

## 2. Sete heurísticas aplicadas à interface

As heurísticas de Nielsen são princípios de inspeção de usabilidade, e não uma certificação. A aplicação ao projeto é uma decisão de design baseada nas referências abaixo.

| Princípio | Decisão para o Elo | Evidência a verificar |
| --- | --- | --- |
| Visibilidade do estado do sistema | Mostrar feedback após ações e diferenciar apoio registrado, pendente, confirmado e falha conforme os estados implementados. | O usuário compreende o resultado sem repetir o clique por falta de resposta. |
| Correspondência com o mundo real | Usar termos como campanha, apoio, meta, arrecadação e repasse; formatar valores em reais. | Não expor identificadores internos, nomes de módulos ou códigos de erro como orientação principal. |
| Controle e liberdade | Disponibilizar voltar e cancelar, preservar dados durante revisão e permitir saída clara de diálogos. | A pessoa consegue corrigir a operação sem ficar presa no fluxo. |
| Consistência e padrões | Manter navegação, nomes, botões e convenções de estado consistentes nos dois temas. | A mesma ação conserva significado, posição relativa e comportamento. |
| Prevenção de erros | Validar valor, mostrar resumo e esclarecer a modalidade antes da confirmação simulada. | Um valor inválido recebe orientação acionável e não gera movimentação. |
| Reconhecimento em vez de memorização | Exibir rótulos e resumo de campanha, valor e modalidade; apresentar navegação com nomes visíveis. | A pessoa não precisa lembrar informações de uma tela anterior para concluir o apoio. |
| Estética e design minimalista | Priorizar conteúdo decisório, espaçamento, agrupamento e uma ação principal por contexto. | Elementos decorativos e detalhes secundários não competem com o objetivo da tela. |

Fontes: [NN/G — 10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/) e [NN/G — Aesthetic and Minimalist Design](https://www.nngroup.com/articles/aesthetic-minimalist-design/). O minimalismo deve preservar informações necessárias à decisão; retirar rótulos ou esconder custos pode prejudicar a experiência.

## 3. Direção visual e temas

A direção proposta utiliza superfícies claras ou escuras, tipografia legível, espaçamento consistente, bordas discretas e uma cor de destaque reservada às ações e informações relevantes. A hierarquia deve distinguir título, explicação, dados de campanha, valor e ação.

A revisão de 23/11 adota uma direção utilitária/editorial: superfícies neutras em camadas, cartões apenas onde ajudam a agrupar ou comparar informações, títulos objetivos e cantos de 6–8 px. Foram removidos slogans repetidos, caixas decorativas e a elevação dos cartões ao passar o ponteiro. Os indicadores financeiros compartilham uma faixa com divisórias; as imagens conservam as cores dos projetos.

| Papel | Claro | Noturno |
| --- | --- | --- |
| Fundo | `#F6F6F7` | `#232428` |
| Navegação lateral | `#EDEDF0` | `#1D1E22` |
| Superfície | `#FFFFFF` | `#2B2D31` |
| Superfície secundária | `#EEEEF0` | `#34363C` |
| Texto principal | `#232428` | `#F0F0F2` |
| Texto secundário | `#62646C` | `#B4B5BD` |
| Destaque azul acinzentado | `#44536B` | `#BAC8DF` |

A paleta é uma escolha própria para o Elo. O uso de cinzas em camadas e de cor com função específica se apoia no [Carbon Design System — Color](https://www.carbondesignsystem.com/building-blocks/foundations/color/overview). O [relato do Discord sobre contraste e saturação](https://discord.com/blog/refining-discords-mobile-experience-with-your-feedback) também reforça a importância de considerar preferências diferentes, em vez de presumir que um único tema escuro atende a todos. Os estados continuam acompanhados de texto/ícone, com verde para confirmação, âmbar para pendência e vermelho para recusa.

Foram calculados 14 pares de tokens em cada tema. Todos os pares textuais examinados superaram 4,5:1; as bordas necessárias dos campos superaram 3:1. A medição de tokens cobre essas combinações, não substitui uma auditoria de todos os estados e componentes renderizados. Referência: [W3C — Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

- Preferência explícita entre modo claro e modo escuro, com rótulo acessível e escolha preservada.
- Possibilidade de usar a preferência do sistema como valor inicial, sem substituir uma escolha explícita do visitante.
- Conteúdo e funcionalidade equivalentes nos dois modos.
- Avaliação separada de texto, links, botões, campos, mensagens e foco em cada tema.
- Uso moderado de movimento e ausência de animações que dificultem a conclusão de uma tarefa.

Modo escuro não garante menor fadiga ou melhor acessibilidade para todas as pessoas. Ele é uma preferência de apresentação que também precisa cumprir critérios de legibilidade. A capacidade de detectar preferência de esquema de cor é descrita em [W3C — Media Queries, `prefers-color-scheme`](https://www.w3.org/TR/mediaqueries-5/#prefers-color-scheme); a especificação consultada é um documento em evolução.

### Arrecadação no período

A área Financeiro utiliza um único gráfico de linha, com seleção de projeto e dos últimos 7 ou 30 dias. O total, a quantidade de pagamentos e a lista dos apoios que o compõem acompanham os mesmos filtros. O título “Arrecadação no período” evita confundir recebimentos com saldo disponível ou repasses; os cartões da conta continuam globais e essa distinção aparece na interface.

A série utiliza somente entradas registradas e vinculadas a pagamentos confirmados, agrupadas por dia de Brasília (`America/Sao_Paulo`). Valores iniciais da demonstração, repasses, pendências e recusas não são convertidos em receita histórica. O estado vazio explica quando ainda não há recebimentos no período. A linha usa segmentos retos, sem sugerir picos intermediários inexistentes.

O gráfico fornece instruções de teclado, leitura do dia selecionado e a alternativa **Consultar valores por dia** em tabela. Tab alcança o gráfico; setas esquerda/direita percorrem os dias; Home/End selecionam as extremidades; Escape dispensa o detalhe. A lista de apoios permite conferir projeto, confirmação e valor de cada entrada. Esses recursos apoiam reconhecimento, transparência e acesso sem depender apenas da cor ou do ponteiro; precisam ser verificados nos dois temas e não constituem, isoladamente, certificação de acessibilidade.

## 4. Critérios de acessibilidade a verificar

| Aspecto | Referência e interpretação correta | Aplicação no protótipo |
| --- | --- | --- |
| Contraste de texto | WCAG 1.4.3, nível AA: pelo menos **4,5:1** para texto comum e **3:1** para texto grande. Grande corresponde a pelo menos 18 pt, ou 14 pt em negrito, aproximadamente 24 e 18,7 CSS px. | Verificar pares texto/fundo em ambos os temas, inclusive textos secundários e campos. |
| Contraste não textual | WCAG 1.4.11, AA: **3:1** para informação visual necessária à identificação de controles e estados contra cores adjacentes. | Conferir bordas necessárias de campos, ícones funcionais e indicadores de foco autorais. Bordas puramente decorativas têm tratamento distinto. |
| Informação além da cor | WCAG 1.4.1, nível A: cor não pode ser a única forma de transmitir significado. | Combinar texto e, quando útil, ícone com a cor do estado. |
| Foco por teclado | WCAG 2.4.7, AA: foco visível. WCAG 2.4.11, AA: o componente focado não pode ficar inteiramente oculto por conteúdo criado pela aplicação. | Não remover o contorno sem substituto; verificar cabeçalhos e barras fixas. |
| Alvos de interação | WCAG 2.5.8, AA: alvo de pelo menos **24 × 24 CSS px**, admitidas as exceções do critério, como espaçamento suficiente. | Preferir **44 × 44 CSS px** ou mais para ações principais. Esse tamanho é referência do critério enhanced AAA, não o mínimo AA. |
| Reflow | WCAG 1.4.10, AA: conteúdo vertical utilizável na largura equivalente a **320 CSS px**, ressalvadas exceções que exigem layout bidimensional. | Não cortar botões, formulários ou informações essenciais nas telas estreitas. |
| Prevenção de erro financeiro | WCAG 3.3.4, AA: ao menos reversibilidade, verificação com correção ou revisão/confirmação em submissões abrangidas pelo critério. | Apresentar resumo revisável antes do apoio simulado. |

Referências diretas: [Contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [Contraste não textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [Uso de cor](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [Foco visível](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [Foco não oculto](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [Tamanho mínimo de alvo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) e [Prevenção de erros](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html).

Em diálogos modais, mover o foco para dentro, manter a sequência de Tab/Shift+Tab no diálogo, permitir Escape e devolver o foco ao acionador quando apropriado. Ver [WAI — Dialog Modal Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Esses critérios são uma seleção útil para o projeto. Atendê-los isoladamente não comprova conformidade integral com WCAG 2.2.

## 5. Mensagens da simulação

A revisão de 23/11 concentra a identificação **“Protótipo acadêmico · pagamentos simulados”** em um único acesso no rodapé. Esse botão abre as informações completas do cenário e da ausência de pagamentos reais. As páginas, formulários e mensagens de sucesso deixam de repetir o mesmo aviso. Exportações continuam identificadas individualmente, pois podem ser lidas fora da aplicação.

O fluxo continua apresentando informações necessárias à decisão: projeto, valor, modalidade, recompensa escolhida, taxa e estado do pagamento. Mensagens distinguem confirmação, pendência e recusa, sem depender de avisos repetitivos ou de cor isolada. O Laboratório mantém explicações técnicas em seu contexto próprio.

### Perfil, abas e composição do financiamento

As abas Sobre, Criador, Atualizações e Comentários organizam informações relacionadas. Recompensas aparece somente quando o criador cadastra opções. Setas, Home e End percorrem as abas; seleção, foco, controles e painéis são associados por atributos ARIA. Em telas pequenas, somente a faixa de abas possui rolagem horizontal própria.

A aba Criador apresenta bio, links, data de criação e contagem derivada dos projetos. A data não é editável. Links externos usam HTTP(S), recusam credenciais na URL e abrem com `noopener noreferrer`; são links públicos, sem alegação de autenticação OAuth ou conta verificada. Publicações e comentários usam autoria/data do servidor e texto escapado. A API autoriza atualizações somente ao dono do projeto e comentários aos perfis participantes previstos.

A barra usa azul acinzentado para apoios diretos e verde azulado para pagamentos com recompensa, com separador e legenda que informa os dois valores. As recompensas integram o total, sem acrescentar seu preço novamente. O texto acessível do progresso também descreve as parcelas e a meta, permitindo compreensão sem distinguir as cores.

### Busca, configuração e administração

A pesquisa agrupa resultados de projetos e criadores; nome e bio dos criadores são comparados sem diferenciar caixa ou acentos. O perfil público permite reconhecer a autoria e consultar suas campanhas. As onze categorias aparecem nos filtros e nos formulários, mantendo os mesmos nomes do domínio e da restrição SQL.

A engrenagem **Configurar projeto** aparece somente para o criador responsável em condições de edição. Ela abre um diálogo na própria página e conserva o contexto ao salvar ou cancelar. O formulário altera apenas os dados configuráveis, sem oferecer edição de saldos, autoria ou pagamentos. A modalidade mensal não pode ser desligada enquanto houver recompensas mensais ou assinaturas ativas.

O painel administrativo separa Projetos, Contas, Comentários, Mensagens e Logs. Ações de moderação apresentam o alvo e seus efeitos antes da confirmação, exigem motivo e oferecem restauração ou encerramento da punição. A exclusão lógica preserva contribuições e lançamentos; o conteúdo deixa a área pública sem destruir o histórico financeiro. No perfil, a administração encontra somente punições; no projeto, excluir/restaurar; no comentário, remover/restaurar e abrir o perfil do autor. Logs ficam exclusivamente no painel. A administração não edita perfis ou configura projetos alheios. Essa distribuição reduz ações concorrentes em cada página e mantém um local previsível para punições e auditoria.

**Meu perfil** aparece na seção **Meu espaço** da navegação de criadores e apoiadores. A página principal apresenta o perfil; os controles de foto aparecem somente ao abrir **Editar perfil**, junto da edição de bio e links. O titular pode escolher uma foto, conferir a prévia e salvá-la, ou remover a imagem e voltar às iniciais. A atualização da seção de foto preserva os outros campos ainda não salvos. O campo informa formatos aceitos e limite antes do envio; erro e resultado são apresentados em texto. A foto não substitui o nome nem o papel da conta. Criadores também encontram **Meus apoios** para apoiar outros projetos; os indicadores financeiros distinguem valores recebidos dos valores apoiados.

O diálogo de punição distingue **suspensão** de **banimento**, apresenta o motivo e permite prazo definido ou indeterminado. Suspensão permite ler os posts e demais conteúdos disponíveis, bloqueando publicar, apoiar, editar e enviar mensagens. Permite cancelar uma assinatura existente para impedir renovações. Banimento bloqueia o acesso à conta e ao conteúdo, inclusive esse cancelamento. A administração pode alterar tipo/prazo ou encerrar a punição. A tela do titular informa o estado, o motivo e o término quando definido.

Essas restrições são aplicadas no servidor. Uma persona banida recebe uma resposta de acesso bloqueado sem as coleções de conteúdo da aplicação; esconder elementos no navegador não é a medida de proteção. A expiração usa o relógio do servidor e dispensa cron. O temporizador da interface serve apenas para atualizar o estado visível, sem conceder acesso com base no relógio local.

As conversas são privadas entre administração e criador. O botão **Atualizar conversa** explicita a atualização manual, sem sugerir presença online, WebSocket ou entrega em tempo real. O servidor atribui o remetente e filtra as mensagens por participante. Os logs administrativos registram o envio e as contas envolvidas, sem copiar o corpo da mensagem. O filtro por conta considera ações realizadas e eventos em que ela é alvo ou parte relacionada.

## 6. Segurança: controles do protótipo e limites

| Área | Tratamento na aplicação com API e PostgreSQL | Evolução para operação real |
| --- | --- | --- |
| Identidade e acesso | Login real; scrypt com salt, sessão opaca revogável, cookie `HttpOnly`/`SameSite=Strict`, CSRF e autorização por papel e propriedade no backend. | Recuperação de conta, verificação de e-mail, gestão operacional de credenciais e autenticação reforçada para ações críticas. |
| Requisições | Verificação de origem nas mutações e limite de corpo da requisição; campos e operação validados pela API/domínio. | HTTPS, gestão operacional, monitoramento, limitação de abuso e revisão integral da superfície da API. |
| Valores e estados | Inteiros de centavos, transições verificadas no servidor e restrições de integridade SQL. | Adequação a moeda, destinatário, reservas, disponibilidade e regras reais de liquidação. |
| Pagamento | Serviço simulado, sem cartão, instituição bancária ou provedor conectado. | Provedor adequado e confirmação verificada de servidor para servidor. A página de sucesso não comprova pagamento. |
| Repetição | Chave e parâmetros da operação persistidos; confirmações já concluídas não produzem outro lançamento. | Autenticação de notificações externas, proteção contra replay e reconciliação de eventos fora de ordem. |
| Repasses e concorrência | Transação na mesma conexão e bloqueio `FOR UPDATE` da linha do workspace serializam as mutações do cenário. | Desenho de bloqueios por recurso, limites, reservas e controles adequados ao volume real. |
| Persistência | Tabelas normalizadas no PostgreSQL, migrações versionadas e volume persistente no Compose. Consultas com múltiplos `SELECT`s usam snapshot consistente. | Segregação operacional, gerenciamento de segredos, política de retenção, backup e restauração verificados. |
| Moderação | Suspensão com consulta e operações bloqueadas, banimento com acesso e coleções bloqueados, prazo opcional e motivo; exclusão lógica/restauração de projetos e comentários. Decisões e vigência validadas no servidor. | Processo de denúncia e revisão, autorização real, segregação de funções e retenção adequada dos registros. |
| Conversas privadas | Remetente da sessão autenticada; acesso somente à administração e ao criador participante; conteúdo escapado e limitado. | Controles operacionais, proteção e retenção das mensagens. |
| Foto de perfil | Sessão e CSRF; edição só do titular liberado; limite de 2 MB, JPG/PNG/WebP estáticos e até 16 milhões de pixels; decodificação, recorte e regravação JPEG sem metadados; armazenamento binário no PostgreSQL. SVG e URLs externas não são aceitos. | Limites operacionais de consumo, revisão de dependências e política de retenção e moderação de imagens. |
| Auditoria | Eventos no banco e visualização administrativa geral ou por conta, incluindo ator e contas relacionadas; corpo de mensagem não é copiado para logs. | Proteção contra adulteração, monitoramento e segregação de funções; evitar credenciais e dados de pagamento nos logs. |

O visitante pode modificar JavaScript e informações visuais no próprio navegador, mas o cliente não é a autoridade sobre o saldo persistido: as mutações são reavaliadas no domínio do servidor e gravadas em transação. O backend não deve aceitar um saldo pronto ou o papel enviado no corpo de uma operação como prova de permissão.

A execução exige autenticação e não permite trocar de persona pela API; a seleção de personagens permanece somente no adaptador legado dos testes. Banimento e suspensão são aplicados à conta resolvida pela sessão. Acesso ao runtime, ao segredo de sessão ou ao banco pertence à administração do ambiente. Pagamentos permanecem simulados e o ambiente acadêmico deve ser exercitado com dados fictícios, sem ser apresentado como aplicação financeira de produção.

Fotos são validadas pelo conteúdo e regravadas com sharp, com limite de pixels e rejeição de animação; o nome e a extensão enviados não são tratados como prova do tipo. A leitura usa uma URL interna gerada pelo servidor, exige sessão autorizada e responde como JPEG com cache privado. A gravação verifica novamente a punição dentro da transação e registra o evento sem guardar a imagem no log. Referências de implementação: [sharp — construtor e limites](https://sharp.pixelplumbing.com/api-constructor/), [sharp — metadados](https://sharp.pixelplumbing.com/api-input/) e [OWASP — File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

A migração `004_timed_account_moderation.sql` introduz o tipo de punição e a data opcional de término, convertendo o banimento booleano legado sem remover registros financeiros. Datas e estados recebidos do navegador são validados; é o relógio do servidor que determina se a restrição ainda se aplica.

O repositório `server/repository/postgres.js` persiste tabelas por entidade e substitui o pequeno agregado de um workspace dentro da transação. Esse desenho facilita a demonstração, mas regrava mais registros que uma atualização incremental. O bloqueio por workspace privilegia simplicidade e consistência do cenário; uma versão de grande escala exigiria outra granularidade de concorrência.

O Compose prevê uma aplicação e um banco, sem réplicas ou alta disponibilidade. Volume persistente conserva dados entre recriações de containers e tem finalidade diferente de backup. Um dump foi criado antes da atualização de 23/11/2026; a restauração ainda precisa ser verificada. Referências: [Docker Compose](https://docs.docker.com/compose/intro/compose-application-model/), [Docker — Volumes](https://docs.docker.com/engine/storage/volumes/) e [PostgreSQL — Transações](https://www.postgresql.org/docs/current/tutorial-transactions.html).

Fontes: [OWASP — Autorização por objeto](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/), [OWASP — Integração com pagamentos](https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Payment_Gateway_Integration_Cheat_Sheet.html), [OWASP — Autorização de transações](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html), [Stripe — Webhooks](https://docs.stripe.com/webhooks) e [OWASP — Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

## 7. Dados, pagamentos e privacidade em uma evolução real

Para reduzir exposição, uma integração real pode utilizar checkout hospedado ou componentes que transmitam os dados de cartão diretamente ao provedor. O modelo de integração afeta o escopo de controles PCI. **CVV não pode ser armazenado após autorização, mesmo criptografado.** Terceirizar o processamento não elimina as responsabilidades remanescentes da plataforma. Fontes: [Stripe — Integration Security Guide](https://docs.stripe.com/security/guide), [PCI — CVV](https://www.pcisecuritystandards.org/faqs/are-merchants-allowed-to-request-card-verification-codes-values-from-cardholders/) e [PCI — Terceirização](https://www.pcisecuritystandards.org/faqs/1092/).

Se houver senhas próprias, utilizar biblioteca adequada de hash de senhas e configuração atualizada, preferencialmente Argon2id onde disponível. Prever recuperação segura de conta, limites de tentativas e autenticação reforçada para administração e alteração de dados de recebimento. Fontes: [OWASP — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) e [OWASP — Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

Dados financeiros são críticos, mas não se tornam automaticamente “dados pessoais sensíveis” no sentido legal. A definição da LGPD inclui, entre outros, saúde, religião e biometria. Conforme a campanha, informações de apoio podem revelar aspectos sensíveis: esse é um risco contextual que deve ser analisado. Coleta, finalidade, base legal, compartilhamentos, retenção e direitos dos titulares precisam ser definidos. Consentimento é uma das bases legais possíveis, e conservação legal de registros deve ser considerada ao atender pedidos de exclusão. Referência: [LGPD, arts. 5º, 6º, 7º, 11, 16 e 18](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html).

Campanhas públicas e documentos privados devem ter tratamentos diferentes. Uma versão com upload precisa validar tipo, conteúdo e tamanho e restringir acesso a documentos privados. Fraude e abuso automatizado exigem controles do fluxo de negócio, além de proteção técnica das contas. Fontes: [OWASP — File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) e [OWASP API6 — Sensitive Business Flows](https://api-security.owasp.org/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/).

Uma operação real também precisa de procedimento de resposta a incidentes para conter danos, registrar avaliação e analisar comunicações obrigatórias. Fontes: [ANPD — Guia de segurança](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-vf.pdf/@@display-file/file) e [ANPD — Regulamento de comunicação de incidentes](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca).

## 8. Plano de avaliação, sem afirmar execução

As tarefas abaixo são propostas de verificação. Registrar separadamente data, versão, ambiente, participantes quando houver e resultados observados.

| Tarefa | Resultado esperado |
| --- | --- |
| Encontrar uma campanha por tema e entender a meta. | A pessoa identifica proposta, progresso e ação sem ajuda. |
| Apoiar pontualmente e revisar antes da confirmação. | Valor e modalidade são compreendidos e corrigíveis. |
| Informar valor inválido. | A operação é bloqueada, com orientação específica e preservação do contexto. |
| Repetir a mesma confirmação. | A operação mantém um único efeito financeiro no escopo suportado pelo simulador. |
| Simular a próxima cobrança mensal. | Um novo ID/ciclo é criado, ligado ao apoio original; nenhum saldo aumenta enquanto a cobrança está pendente. |
| Cancelar assinatura com cobrança pendente. | A recorrência é encerrada, a cobrança pendente não pode ser confirmada e pagamentos anteriores são preservados. |
| Enviar operações simultâneas sobre o saldo. | A transação e o bloqueio por workspace impedem repasse acima do disponível e crédito duplicado. |
| Abrir um segundo cenário de demonstração. | Os registros financeiros dos workspaces não são misturados. |
| Comparar as personas. | Cada jornada é compreensível e a troca é identificada como demonstração. |
| Filtrar a arrecadação por projeto e por 7/30 dias. | Total, série, lista de apoios e exportação concordam; os cartões de saldo geral não são confundidos com o filtro. |
| Consultar o gráfico por teclado e abrir a tabela diária. | Os dias e valores ficam disponíveis sem ponteiro, com foco e instruções compreensíveis. |
| Selecionar um período sem entradas registradas. | O estado vazio explica a ausência de recebimentos, sem inventar histórico pelos valores iniciais. |
| Alternar tema e recarregar. | A preferência é mantida conforme a implementação. |
| Navegar somente por teclado. | Foco, ordem e diálogos permitem concluir o fluxo. |
| Verificar telas de 320, 768 e 1440 CSS px. | Ações e informações permanecem utilizáveis. |
| Conferir contraste nos dois temas. | Pares necessários atingem os critérios adotados, inclusive foco e erro. |

Em uma avaliação com pessoas, observar conclusão sem ajuda, hesitações, erros, entendimento dos valores e compreensão da simulação. Inspeção heurística, teste automatizado e teste de usabilidade são métodos diferentes; nenhum deles deve ser apresentado como realizado sem evidências.

Em 23/11/2026, o build Docker foi concluído, aplicação e banco apresentaram estado saudável e os cinco cenários de concorrência, rollback e idempotência da suíte de PostgreSQL real foram aprovados no container. Esses resultados complementam os testes com PostgreSQL embarcado/PGlite; não equivalem a auditoria de segurança ou avaliação com participantes. Consultar `docs/VERIFICACAO.md` para resultados e limites observados na versão entregue.

## Revisão de 24/11 - capas, localização e integridade

As capas passam a aceitar imagens próprias do criador com normalização no servidor. A localização pública opcional é editada no perfil e propagada aos projetos. A prévia de exclusão informa a devolução integral e bloqueia a operação sem saldo suficiente; o histórico apresenta devoluções e cancelamentos sem apagar comprovantes.

A interface foi conferida nos temas claro/noturno e em 320 CSS px, incluindo foco no menu móvel e formulários. A proposta de evolução visual, com paleta e referências, está em [DIRECAO-VISUAL.md](DIRECAO-VISUAL.md). Correções e limites de segurança estão em [REVISAO-PROJETOS-E-SEGURANCA.md](REVISAO-PROJETOS-E-SEGURANCA.md).
