# Verificação da entrega final

Refere-se à revisão com metas adicionais, entregas privadas, reembolso e retenção de conteúdo, além das correções de modal, permissão de criação e normalização de URLs.

## Resultados

| Verificação | Resultado | Limite da evidência |
| --- | --- | --- |
| npm test | 270 resultados; 269 aprovados; zero falhas; um skip. | O skip é da suíte opt-in de PostgreSQL de servidor, executada separadamente. |
| PostgreSQL 17 no Docker | Nove cenários aprovados, zero falhas/skips; dez resultados TAP com o pai. | Os testes criam UUIDs próprios e removem somente seus cenários. |
| npm run build | 32 entradas verificadas e sete recursos locais. | Cópia estática e conferência de arquivos; não é uma auditoria de todo o JavaScript. |
| npm run check:compose | Estrutura aprovada. | A inspeção não inicia containers; a implantação foi executada separadamente. |
| Docker Compose | app e db saudáveis em localhost:3001. | Execução local, sem alta disponibilidade. |
| npm audit | Zero alertas conhecidos na árvore instalada nesta data. | Consulta ao registro; não substitui revisão do código ou avaliação externa. |

A suíte padrão usa PGlite para persistência SQL e integração HTTP. Seu adaptador serializado não comprova disputa entre conexões físicas. Os nove cenários PostgreSQL usam conexões distintas e exercitam confirmação repetida, repasses concorrentes, rollback, idempotência, entrega duplicada, expurgo concorrente e exclusão disputando com pagamento ou repasse.

## Fluxos e regressões cobertos

1. Autenticação, autorização por papel/propriedade, sessão, CSRF, isolamento e exportação pessoal.
2. Cadastro concorrente, limitação por IP/identidade e filas limitadas de trabalho.
3. Capas e avatares, formatos e limites, criação atômica, normalização e localização do perfil.
4. Pagamento, renovação, cancelamento, reembolso integral, saldo insuficiente e lançamentos preservados.
5. Metas adicionais cumulativas, validação, ordenação, criação e edição sem alterar valores financeiros.
6. Entrega digital apenas para pagamento confirmado sem devolução; privacidade, versão, recebimento e revogação.
7. Retenção de 720 horas, recuperação autorizada, conteúdo removido e histórico preservado, inclusive com auditoria cheia e horário de verão.
8. Modal com fragmento HTML incompleto, ampersand sem escape duplo, criação administrativa proibida e limites de URL após normalização Unicode.
9. Relatório por projeto/calendário de São Paulo, devoluções separadas e histórico de campanhas removidas.

## Preservação e compartilhamento

Backup privado salvo antes da atualização final, sem dados de sessões. Configuração privada e volume PostgreSQL foram preservados; nenhuma migração já aplicada foi modificada nesta revisão. Apenas a aplicação foi reconstruída. Login e permissões existentes foram conferidos sem editar projetos ou perfis.

Correções e limites: REVISAO-FINAL.md. Arquitetura e matriz do enunciado: ARQUITETURA.md.
