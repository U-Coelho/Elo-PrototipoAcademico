# Direção visual para o Elo

O Elo agora usa um catálogo editorial: cartões abertos, imagens com proporção consistente, destaque compacto e navegação neutra. A composição foi aplicada ao catálogo e às telas internas, mantendo os temas claro/noturno e os fluxos existentes.

## Base e hierarquia

O [Carbon Design System](https://www.carbondesignsystem.com/building-blocks/foundations/color/overview) organiza interfaces com cinzas dominantes, camadas de superfície e cores de ação/estado usadas com propósito. Aplicando esse princípio ao Elo, recomendo conservar o carvão semelhante à referência do Discord, com uma cor principal azul acinzentada e cores adicionais somente para estados e composição do financiamento.

| Papel | Claro | Noturno |
| --- | --- | --- |
| Fundo | #f6f6f7 | #232428 |
| Navegação | #ededf0 | #1d1e22 |
| Superfície | #ffffff | #2b2d31 |
| Camada secundária | #eeeef0 | #34363c |
| Texto principal | #232428 | #f0f0f2 |
| Texto secundário | #62646c | #b4b5bd |
| Ação principal | #44536b | #bac8df |

Os valores são tokens atuais do Elo. A escolha da composição abaixo é uma recomendação de projeto, não uma regra literal das fontes.

## Diretrizes adotadas

1. Reduzir a altura do destaque inicial e chegar mais rapidamente aos projetos. Uma mensagem curta e uma campanha em destaque são suficientes.
2. Usar capas reais escolhidas pelos criadores, sempre na mesma proporção. Manter ilustração de fallback discreta; evitar que todos os projetos pareçam variações de um único template.
3. Cartões mais planos, sem sombras grandes nem movimento ao passar o mouse. Categoria pequena, título forte, autor e progresso em posições constantes.
4. Separar zonas com espaçamento e linhas sutis. Reservar painéis para conjuntos que precisam ser lidos juntos; evitar colocar cada texto em uma caixa própria.
5. Nas páginas internas, priorizar o trabalho do usuário: perfil/bio, conteúdo do projeto ou finanças. Cada seção deve ter uma ação principal evidente.
6. Concentrar explicações na decisão correspondente: corte da capa próximo ao seletor, localização pública no perfil, valor de devolução antes de excluir. Manter a identificação do protótipo no rodapé.

O estudo do [efeito estética-usabilidade da Nielsen Norman Group](https://www.nngroup.com/articles/aesthetic-usability-effect/) ajuda a explicar por que a aparência afeta a percepção de facilidade; ela não substitui a validação das tarefas. Testar encontrar um criador, publicar um projeto com capa, apoiar e localizar um comprovante antes de afirmar que a interface ficou mais intuitiva.

## Critérios de aceitação

Texto comum com contraste de ao menos 4,5:1 e texto grande com 3:1, conforme [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Controles devem ter nome, foco visível e estado textual além da cor. A [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) define 24 × 24 CSS px com exceções; para ações principais recomendo 44 × 44 ou mais. Conferir ambos os temas, teclado e 320 px de largura.

A reformulação está aplicada. O catálogo usa cartões sem caixa externa, sombras ou zoom; o destaque abre o projeto; categorias e ordenação têm espaços próprios. Perfil, projeto, recompensas, financeiro, apoios, administração e acesso seguem tipografia e espaçamento comuns. Títulos longos permanecem visíveis, e as capas são apresentadas em 8:5. A navegação por categorias usa uma faixa com rolagem em telas estreitas.

A conferência visual incluiu os temas claro/noturno e larguras de 320, 760 e 1440 CSS px. Cadastro, administração e textos longos foram também inspecionados em uma prévia isolada com fixtures fictícias, sem gravar dados nas contas existentes. Essa inspeção não substitui teste com usuários ou auditoria completa de acessibilidade.
