/** Todos os nomes, histórias e valores deste catálogo são fictícios. */
export const actors = [
  { id: 'supporter1', name: 'Ana Souza', firstName: 'Ana', role: 'supporter', roleLabel: 'Apoiadora', initials: 'AS' },
  { id: 'creator1', name: 'Marina Costa', firstName: 'Marina', role: 'creator', roleLabel: 'Criadora', initials: 'MC' },
  { id: 'admin1', name: 'Rafael Lima', firstName: 'Rafael', role: 'admin', roleLabel: 'Administrador', initials: 'RL' },
];

export const categories = ['Tecnologia', 'Arte e cultura', 'Impacto social', 'Educação', 'Jogos', 'Filmes e vídeos', 'Design', 'Ativismo', 'Artes', 'Jornalismo', 'Podcast'];

export const campaigns = [
  {
    id: 'c1', title: 'Verde no concreto', creator: 'Marina Costa', creatorId: 'creator1', category: 'Impacto social',
    description: 'Pequenas hortas, grandes encontros. Vamos transformar espaços da cidade em jardins para todos.',
    image: 'assets/campaign-1.svg', goalCents: 10000000, raisedCents: 6930000, backers: 284, daysLeft: 18,
    featured: true, monthly: true, location: 'São Paulo, SP',
    story: "Um terreno vazio pode se tornar um ponto de encontro. O Verde no concreto aproxima vizinhos para criar hortas comunitárias e oficinas de cultivo.\n\nO apoio financia ferramentas, mudas e encontros de formação. Nossa primeira etapa prevê três espaços de cultivo, com cuidado compartilhado e acesso gratuito à comunidade.\n\nCada apoio ajuda a construir uma cidade com mais verde, alimento e convivência.",
    rewards: [
      { id: 'c1-r1', title: 'Uma semente de mudança', amountCents: 2500, description: 'Receba notícias do projeto e acompanhe cada nova horta.', monthly: false },
      { id: 'c1-r2', title: 'Cultive com a gente', amountCents: 7500, description: 'Um agradecimento especial e um guia digital de cultivo.', monthly: false },
      { id: 'c1-r3', title: 'Raízes que continuam', amountCents: 3500, description: 'Apoie a manutenção das hortas a cada mês.', monthly: true },
    ],
  },
  {
    id: 'c2', title: 'Som que fica', creator: 'João Martins', creatorId: 'creator2', category: 'Arte e cultura',
    description: 'Um álbum independente para guardar as histórias que a cidade tem para contar.',
    image: 'assets/campaign-2.svg', goalCents: 4500000, raisedCents: 3175000, backers: 163, daysLeft: 24,
    featured: false, monthly: true, location: 'Belo Horizonte, MG',
    story: "Som que fica reúne canções autorais inspiradas nas pessoas e nos pequenos encontros da cidade. O projeto vai da gravação à publicação de um álbum independente.\n\nO financiamento será destinado à produção musical, mixagem e distribuição digital. Apoiadores acompanham os bastidores e recebem novidades sobre o processo criativo.",
    rewards: [
      { id: 'c2-r1', title: 'Entre na primeira fila', amountCents: 3000, description: 'Acompanhe os bastidores da gravação.', monthly: false },
      { id: 'c2-r2', title: 'Música todo mês', amountCents: 2000, description: 'Faça parte da comunidade de apoio ao álbum.', monthly: true },
    ],
  },
  {
    id: 'c3', title: 'Aprender sem fronteiras', creator: 'Coletivo Horizonte', creatorId: 'creator3', category: 'Educação',
    description: 'Uma biblioteca itinerante levando livros, oficinas e novas possibilidades para mais crianças.',
    image: 'assets/campaign-3.svg', goalCents: 6000000, raisedCents: 4260000, backers: 219, daysLeft: 12,
    featured: false, monthly: false, location: 'Recife, PE',
    story: "A biblioteca itinerante Aprender sem fronteiras leva livros e oficinas de leitura para mais bairros.\n\nA meta é montar um acervo compartilhado e organizar encontros com acesso gratuito. O orçamento contempla livros, materiais e transporte.",
    rewards: [
      { id: 'c3-r1', title: 'Abra uma nova página', amountCents: 2500, description: 'Ajude a ampliar o acervo compartilhado.', monthly: false },
      { id: 'c3-r2', title: 'Histórias para compartilhar', amountCents: 10000, description: 'Receba um caderno digital sobre o projeto.', monthly: false },
    ],
  },
  {
    id: 'c4', title: 'Ateliê de possibilidades', creator: 'Marina Costa', creatorId: 'creator1', category: 'Arte e cultura',
    description: 'Cerâmica, encontros e criação: um ateliê aberto para colocar novas ideias nas mãos.',
    image: 'assets/campaign-4.svg', goalCents: 3500000, raisedCents: 1895000, backers: 97, daysLeft: 31,
    featured: false, monthly: true, location: 'Franca, SP',
    story: "O Ateliê de possibilidades é uma campanha para um espaço de criação compartilhado. Queremos unir oficinas de cerâmica, materiais acessíveis e encontros entre pessoas que gostam de fazer.\n\nO valor arrecadado permitirá a compra de equipamentos e a organização das primeiras oficinas. O apoio recorrente contribui com a continuidade das atividades.",
    rewards: [
      { id: 'c4-r1', title: 'Modele uma ideia', amountCents: 5000, description: 'Acompanhe a criação do ateliê.', monthly: false },
      { id: 'c4-r2', title: 'Faça parte do ateliê', amountCents: 3500, description: 'Um apoio mensal para manter o espaço criativo.', monthly: true },
    ],
  },
  {
    id: 'c5', title: 'Tecnologia que aproxima', creator: 'Pedro Almeida', creatorId: 'creator4', category: 'Tecnologia',
    description: 'Kits de robótica acessíveis para transformar curiosidade em novas descobertas.',
    image: 'assets/campaign-5.svg', goalCents: 8000000, raisedCents: 2840000, backers: 142, daysLeft: 27,
    featured: false, monthly: false, location: 'Curitiba, PR',
    story: "Tecnologia que aproxima desenvolve kits educativos de robótica com documentação aberta. A ideia é oferecer uma primeira experiência de montagem, programação e experimentação.\n\nO financiamento será destinado ao desenvolvimento de protótipos, aos materiais didáticos e às oficinas.",
    rewards: [
      { id: 'c5-r1', title: 'Conecte uma possibilidade', amountCents: 5000, description: 'Receba atualizações sobre o protótipo.', monthly: false },
      { id: 'c5-r2', title: 'Construa o próximo passo', amountCents: 15000, description: 'Acompanhe o diário de desenvolvimento.', monthly: false },
    ],
  },
  {
    id: 'c6', title: 'O futuro pedala', creator: 'Coletivo Giro', creatorId: 'creator5', category: 'Impacto social',
    description: 'Uma oficina comunitária para recuperar bicicletas e criar novos caminhos pela cidade.',
    image: 'assets/campaign-6.svg', goalCents: 5000000, raisedCents: 4125000, backers: 186, daysLeft: 9,
    featured: false, monthly: true, location: 'Porto Alegre, RS',
    story: "O futuro pedala é uma oficina comunitária para recuperação de bicicletas. A proposta une mobilidade, aprendizado e reaproveitamento de materiais.\n\nOs apoios financiam ferramentas, peças e encontros de manutenção. O apoio mensal ajuda a manter as atividades ao longo do tempo.",
    rewards: [
      { id: 'c6-r1', title: 'Um novo caminho', amountCents: 3000, description: 'Apoie a recuperação de bicicletas.', monthly: false },
      { id: 'c6-r2', title: 'Continue esse movimento', amountCents: 2500, description: 'Contribua mensalmente com a oficina.', monthly: true },
    ],
  },
];
