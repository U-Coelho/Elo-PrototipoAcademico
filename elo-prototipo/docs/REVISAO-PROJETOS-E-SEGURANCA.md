# Revisão de projetos, integridade e segurança

Registro histórico de 24/11/2026. A revisão final, incluindo entregas digitais, metas e retenção, está em [REVISAO-FINAL.md](REVISAO-FINAL.md); os resultados vigentes estão em [VERIFICACAO.md](VERIFICACAO.md).

Data: 24/11/2026. Escopo: código de primeira parte em `src/`, `server/`, `scripts/`, migrações e configuração Docker. Revisão de código, testes automatizados e inspeção de telas; não representa certificação de segurança ou teste de invasão externo.

## Comportamento entregue

- Criadores podem escolher uma capa na publicação e salvar, substituir ou remover a capa pelas configurações do próprio projeto. Sem upload, permanece a ilustração padrão.
- O perfil oferece cidade e UF opcionais em Editar perfil. A alteração ou remoção atualiza todos os projetos do titular. Não há geolocalização, GPS nem campo de endereço completo. Perfis ilustrativos antigos recebem uma localização canônica a partir do catálogo; contas novas começam sem localização.
- O criador pode excluir seu próprio projeto; a administração também pode excluir. A prévia apresenta valor integral a devolver, saldo disponível, pendências e assinaturas afetadas. O motivo fica registrado.
- A exclusão devolve, de forma simulada, todos os apoios confirmados ainda não devolvidos, incluindo renovações e recompensas. Se o saldo geral do criador for insuficiente, nenhuma parte da exclusão é aplicada, mesmo para o administrador.
- Apoios pendentes são cancelados e assinaturas são encerradas. A restauração administrativa recupera a publicação; não desfaz devoluções nem reativa assinaturas.
- Pagamentos e comprovantes originais permanecem confirmados. Metadados de devolução e dois lançamentos vinculados por apoio registram a saída do criador e a devolução ao apoiador. Repetir a exclusão não duplica lançamentos.

O saldo ainda pertence à conta do criador, compartilhado entre seus projetos. Não há reserva financeira individual por campanha nem recomposição automática de valores já repassados. Valores ilustrativos antigos do catálogo sem pagamentos registrados não são inventados como dívida de devolução. O histórico de arrecadação permanece bruto; devoluções e líquido do período aparecem separadamente. Uma devolução recebida por um criador que apoiou outra campanha não se converte em saldo de arrecadação sacável.

## Falhas concretas corrigidas

| Achado | Correção e evidência |
| --- | --- |
| Exclusão apenas ocultava o projeto e deixava cobranças ativas. | Liquidação e cancelamento no mesmo bloqueio/transação; testes de domínio, HTTP autenticado e PostgreSQL real. |
| Uma chave repetida dependia da disponibilidade atual do projeto. | Reconhecimento de idempotência antes de validar disponibilidade mutável; repetição após restauração conserva o primeiro resultado. |
| Uma assinatura mensal pendente permitia desabilitar a modalidade. | Configuração bloqueada com raízes pendentes e assinaturas ativas; confirmação de dados legados exige modalidade habilitada. |
| Coleções poderiam ultrapassar a capacidade e impedir a próxima leitura. | Verificação anterior à mutação e validação do resultado persistível. Cadastro reserva capacidade sob bloqueio, inclusive considerando perfis legados. |
| Trocar o identificador distribuía tentativas de autenticação. | Orçamento por IP independente do identificador, adicional ao limite por identidade, com memória e concorrência de scrypt limitadas. |
| Configuração Secure não chegava ao processo no Compose. | Encaminhamento explícito de COOKIE_SECURE; ativação depende de HTTPS e configuração coerente do servidor/proxy. |
| Backup poderia restaurar sessões autenticadas e restore poderia ficar parcial. | Dumps novos excluem dados de sessões; restore exige aplicação parada, usa transação única e revoga sessões ao terminar. A aplicação não reinicia automaticamente. |
| Política CSP do HTML impedia prévias locais permitidas pelo cabeçalho. | As duas políticas permitem blob para imagens; sem liberar imagens remotas arbitrárias. |
| Exportação local e do servidor eram diferentes. | Projeção pessoal compartilhada; download autorizado inclui salvos, perfil próprio, histórico e referências canônicas de capa. Não exporta contas, credenciais ou conversas sem participação. |
| Histórico oferecia ações impossíveis após indisponibilidade/exclusão. | Estados de devolução/cancelamento explícitos; confirmação e renovação somente quando autorizadas. |
| Foco podia ficar cortado em imagens; menu móvel deixava foco escapar. | Contorno interno nas capas, fundo inerte e ciclo de Tab/Shift+Tab no menu aberto; verificação no navegador. |

## Uploads e privacidade

Capas: JPEG, PNG ou WebP estáticos, até 5 MiB e 16 milhões de pixels. O servidor verifica assinatura e decodificação, rejeita animação e regrava um JPEG de 1280 × 800, sem metadados e limitado a 1 MiB. Avatares mantêm limite de 2 MiB e saída 512 × 512. A fila compartilhada limita o processamento de imagens.

O nome do arquivo do cliente não determina o caminho de armazenamento. Capas ficam em BYTEA na tabela `project_images`, com FK diferida para permitir criação e imagem na mesma transação sem perder a capa quando outro dado do agregado é salvo. O endereço é produzido no servidor. Escrita exige sessão, CSRF, origem válida e propriedade; administradores não recebem permissão de editar capas de terceiros. A leitura é autenticada e respeita a visibilidade do projeto ou o histórico do próprio apoiador.

Esses controles seguem recomendações de validação, limite e autorização de uploads da [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html). Fotografias continuam sendo conteúdo público do projeto para os participantes autorizados; o sistema não verifica licença de uso nem modera automaticamente o conteúdo visual.

## Pontos para uma operação pública

- HTTPS, cookie Secure, política explícita para proxy confiável e limitação distribuída entre instâncias. A configuração atual publica apenas em localhost.
- Verificação de e-mail, recuperação de conta, MFA para administração e ciclo de troca/revogação de credenciais.
- Separar usuário de migração do usuário de execução do PostgreSQL, reduzir privilégios e estabelecer retenção e acesso aos logs e backups.
- Monitoramento, alertas, testes periódicos de restauração e revisão externa. Os logs atuais não são imutáveis contra quem administra o banco.
- Se houver pagamentos reais: provedor apropriado, notificações autenticadas, reconciliação, reservas por projeto, devoluções externas e tratamento de falhas. O simulador atual não comprova esses fluxos.

Transporte protegido, recuperação de conta, MFA e limitação de tentativas também são abordados nas [orientações de autenticação da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

## Verificação executada

`npm test`: 226 resultados, 225 aprovados, zero falhas e um skip da suíte opt-in. PostgreSQL real no Docker: sete cenários aprovados (o TAP conta oito resultados incluindo o pai), sem falhas ou skips. Inclui exclusão concorrente com repasse/confirmação. Build e check:compose aprovados. Uma fixture adicional no container Linux verificou sharp, BYTEA, criação atômica, persistência da capa após editar perfil e rollback por FK inválida; somente o cenário criado pelo teste foi removido.

Um dump privado foi restaurado em banco temporário separado: contas e lançamentos presentes, sessões ausentes. Somente esse banco de verificação foi removido. Esse ensaio comprova o dump e a restauração SQL; o controle do script de restauração da aplicação parada foi exercitado por testes com um executável Docker substituto. O banco em uso não foi restaurado nem reinicializado.

Inspeção no navegador: edição do perfil/localização, configurações/capa, prévia da exclusão, financeiro, navegação móvel e teclado; temas claro/noturno e largura de 320 CSS px sem rolagem horizontal da página. Nenhum projeto existente foi alterado ou excluído durante a conferência. Testes isolados cobrem gravação, normalização, remoção, animações e imagens acima de 16 MP. Ainda é necessário teste com usuários e auditoria completa de acessibilidade.
