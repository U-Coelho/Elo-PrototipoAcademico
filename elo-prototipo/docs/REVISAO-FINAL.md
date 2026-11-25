# Revisão final do Elo

Data: 25/11/2026. Escopo: código de primeira parte em src, server, scripts, migrações e configuração; coerência da documentação arquitetural. A revisão foi dividida entre backend e interface, com integração e verificação pelo coordenador. Não representa teste de invasão ou certificação externa.

## Erros encontrados e corrigidos

| Achado reproduzido | Correção | Evidência |
| --- | --- | --- |
| Título com fragmento HTML incompleto podia consumir o conteúdo do modal de entrega. Não foi demonstrada execução de JavaScript. | Título e subtítulo passam a ser texto escapado no componente modal-frame; retirados quatro pré-escapes dos chamadores. | modal-frame.test.mjs e reprodução com o renderizador. |
| O comando JSON aceitava criação de campanha por administrador, enquanto o envio multipart exigia criador. | Domínio e interface passam a exigir somente o papel creator, coerente com a rota de mídia. | creator-workflows.test.mjs e API autenticada: 403 sem alteração do estado. |
| Link Unicode do perfil podia ultrapassar 500 caracteres após normalização e causar erro interno na persistência. | Limite também aplicado a URL.href antes da mutação. | Regressão de domínio e HTTP: 400 / INVALID_LINK, sem alteração do perfil. |
| O mesmo crescimento do endereço ocorria em entregas, acima do limite de 1.000 caracteres. | Normalizador compartilhado pela validação e apresentação da entrega. | Regressões: 400 / INVALID_DELIVERY; Unicode dentro do limite continua aceito. |

## Redundâncias reduzidas

- Um componente concentra a interpretação de título/subtítulo como texto, evitando escape espalhado e escape duplo.
- A apresentação da entrega reutiliza sua regra de normalização de URL.
- Removidas duas funções initials sem uso e um parâmetro não utilizado do gráfico.
- Build mantém uma única lista de entradas a verificar.
- Comentário do servidor foi corrigido para distinguir autenticação real e adaptador legado de testes.

Validação de formulário, autorização no servidor e constraints SQL permanecem em suas respectivas fronteiras. Não foram tratadas como duplicação dispensável. O núcleo de negócio e a coordenação da interface ainda concentram responsabilidades; essa limitação é discutida na documentação acadêmica, sem refatoração estrutural arriscada nesta entrega. CSS legado também não foi removido indiscriminadamente.

## Verificação e limites

Suíte completa: 270 resultados, 269 aprovados, nenhuma falha e um skip opt-in. PostgreSQL real: nove cenários aprovados; o TAP inclui o teste pai e exibe dez resultados. Build: 32 entradas e sete recursos. Compose validado e containers saudáveis. Consulta npm audit da árvore instalada: zero vulnerabilidades conhecidas reportadas nesta data; esse resultado não comprova ausência de vulnerabilidades no código.

Os revisores revalidaram os achados corrigidos e não deixaram pendências importantes nesses pontos. Reproduções foram feitas com dados em memória ou fixtures separadas, sem editar contas ou projetos do usuário. Detalhes da validação estão em VERIFICACAO.md.

A documentação acadêmica foi recriada com o escopo atual, limites reais da modularização, cinco conascências, decisões e matriz de atendimento ao enunciado. O PDF possui sumário navegável, três diagramas vetoriais e fonte editável em ARQUITETURA.md.
