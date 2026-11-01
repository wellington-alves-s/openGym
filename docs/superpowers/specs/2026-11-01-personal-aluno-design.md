# Personal e alunos: spec-mestra

Data: 2026-11-01. Estado: para revisão. Escopo: arquitetura, decisões e decomposição em 10 etapas.
Cada etapa ganha spec detalhada e plano próprios antes de qualquer código.

## 1. Objetivo

Estender o openGym para que **um personal** (e, no futuro, vários personais no mesmo servidor)
monte o treino de cada aluno, acompanhe frequência e evolução, cobre a mensalidade, prescreva dieta
e registre avaliações. O aluno usa o app que já existe, com telas de Corpo, Histórico e Atividades,
ficha de exercício e acompanhamento do treino redesenhadas. Web, Android e iPhone compartilham o mesmo
código do front-end e do servidor, então toda mudança vale para as três plataformas.

Sucesso: o personal cadastra um aluno por convite, prescreve um programa em fases, vê o aluno
treinar e evoluir, emite e confirma faturas, e o aluno vê tudo isso no app, online ou offline.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Quem usa | Um personal agora. Todo aluno guarda `trainerId` desde o início, para virar vários personais depois. |
| Arquitetura de dados | Abordagem A: o aluno é dono do próprio documento; o personal tem armazenamento separado. |
| Edição pelo personal | O personal altera ficha de treino e dieta a qualquer momento, em versões com histórico. |
| Login do aluno | Convite por link de uso único. O aluno escolhe senha ou cria passkey. |
| Pagamento | Pix manual primeiro. Interface de provedor de cobrança para plugar Mercado Pago, Asaas ou Stripe depois. |
| Bloqueio de inadimplente | Opcional por aluno, desligado por padrão. Nunca apaga dados do aluno. |
| Telas do aluno | Layout redesenhado como a referência, com o estilo atual do openGym. |
| Navegação do aluno | Barra atual mantida. "Estatísticas" vira "Atividades", com abas Atividades, Histórico e Corpo. |
| Navegação do personal | Barra própria (Início, Alunos, Modelos, Financeiro, Perfil). Em cada aluno, Atividades, Histórico e Corpo são as telas do aluno em modo leitura. |
| Marca e mídia | Só as funções das referências. Nenhuma marca, imagem ou ilustração delas entra no projeto. |
| Hospedagem | Local (PC do personal, Docker), exposta por Cloudflare Tunnel nomeado. Uso não comercial. |

## 3. Fora de escopo (inicial)

Pagamento automático por webhook, tabela de alimentos embutida, chat, cursos e carteira digital,
prescrição por IA, vários personais (apenas preparado), edição offline pelo personal.

## 4. Arquitetura

### 4.1 Papéis e vínculo
- A conta (`db.json`, `users[]`) ganha `role: 'trainer' | 'student'`. Contas sem papel continuam
  como hoje (uso individual, sem mudança de comportamento).
- Aluno: `trainerId`. Personal: a conta do dono do servidor, no cenário de um personal.
- Desvincular remove `trainerId` e corta o acesso do personal na hora. Os dados do aluno ficam com ele.

### 4.2 Armazenamento
- O documento do aluno (`state-<id>.json`) segue como está. O motor de sincronização
  (`sync-merge`, `sync-stamps`) não muda.
- Novo armazenamento do personal, gravado com `durable.js` (temp e rename), um documento por aluno,
  cada um com revisão própria (`_rev`), no mesmo padrão do 409 atual:
  `DATA_DIR/trainers/<trainerId>/students/<studentId>.json`, mais `.../profile.json` com planos de
  cobrança, modelos de treino, chave Pix e configurações.
- Cada documento de aluno guarda: programa prescrito e versões, plano alimentar e versões, notas,
  faturas, assinatura, arquivos (metadados) e avaliações.

### 4.3 Convite e vínculo
- Convite de aluno segue o molde de `api/device-link.js`: código aleatório guardado só como SHA-256,
  uso único, validade de 7 dias, vinculado a um `trainerId`. O personal gera o link e envia por WhatsApp.
- Ao resgatar, o aluno cria a conta (senha ou passkey) já vinculada ao personal e vê, antes de aceitar,
  o que o personal poderá ver (secção 4.5).
- O convite de aluno funciona mesmo com `INVITE_ONLY` ligado, porque a emissão já é uma ação autenticada
  do personal.

### 4.4 Permissões
- Uma única função de servidor decide "este personal pode acessar este aluno?". Toda rota do personal
  passa por ela. Acesso negado responde igual a "não encontrado", para não revelar quem são os alunos
  de outro personal.
- O aluno só lê o próprio documento de prescrição. O personal só escreve no armazenamento dele.

### 4.5 Consentimento e projeção filtrada
- O personal nunca recebe o documento do aluno inteiro. Uma rota somente leitura devolve uma
  **projeção com lista de campos permitidos**: datas de treino, exercícios, séries, cargas, esforço, peso.
- Medidas, fotos de progresso e check-in de dieta aparecem só se o aluno consentir. Treinos são
  obrigatórios para o serviço. O aluno vê e revoga o que compartilha a qualquer momento.
- O cliente do personal desenha gráficos e calcula 1RM e frequência com os cálculos já existentes em
  `frontend/src/lib/`, sem copiá-los para o servidor.

### 4.6 Entrega do treino ao aluno
- O app do aluno consulta a revisão da prescrição (como `GET /api/data/rev`) e baixa a versão nova.
- A ficha usa o mesmo formato das rotinas atuais, para o motor de treino rodar sem reescrita, e é
  somente leitura para o aluno. Ele treina e registra normalmente.
- Um treino em andamento termina com a cópia que já tinha. A mudança vale a partir do próximo treino.
- Sem internet, o aluno usa a última versão baixada.
- Decisão adiada para a spec da etapa 2, com recomendação: guardar a prescrição como uma fatia local
  somente leitura, **fora** do documento sincronizado do aluno, e unir com as rotinas próprias na hora de
  montar o plano. Isso evita conflitos de sincronização entre os aparelhos dele.

### 4.7 Programa em fases
Um programa tem fases (nome, número de semanas), cada fase tem semanas e cada semana tem dias com a
rotina do dia, dificuldade e duração estimada. Progresso do programa em porcentagem. O personal monta
e edita; o aluno vê "a seguir" e o avanço.

## 5. Financeiro

- **Plano de cobrança:** nome, valor, periodicidade (mensal, trimestral, avulso). O aluno é ligado a um
  plano com início e dia de vencimento.
- **Fatura:** valor em **centavos inteiros** (moeda padrão BRL), vencimento, descrição e status
  `aberta`, `aguardando confirmação`, `paga` ou `cancelada`. **Vencida não é gravada:** é calculada
  (aberta com vencimento passado).
- **Recorrência:** o servidor gera a próxima fatura de um plano recorrente alguns dias antes do
  vencimento (padrão 5), numa verificação periódica como a dos lembretes. A geração usa a chave
  `plano + período`, então reiniciar o servidor não duplica faturas.
- **Link de pagamento:** cada fatura tem um link com código impossível de adivinhar, sem login. A página
  mostra valor, vencimento, nome do personal e a chave Pix, com o Pix copia e cola e o QR code gerados
  localmente (código Pix estático com CRC16 e o gerador de QR que o app já tem). O aluno toca em
  "Já paguei", a fatura vira `aguardando confirmação`, e o personal confirma depois de conferir no banco.
  A página pública tem limite de requisições e é revogada se a fatura for cancelada.
- **Interface de provedor:** `criarCobranca(fatura)` e `receberConfirmacao(evento)`. O provedor padrão é o
  Pix manual. Outro provedor entra depois sem mexer no resto.
- **Status da assinatura:** `em dia`, `a vencer`, `vencida` ou `sem plano`, calculado das faturas.
- **Bloqueio de inadimplentes:** opcional por aluno. Depois de N dias de atraso o aluno deixa de receber
  atualizações da ficha, mas nunca perde os próprios registros.
- **Painel:** recebido no período, em aberto, vencido e lista por aluno. Notificações usam o Web Push e
  os lembretes existentes.
- Nenhum dado de cartão passa pelo sistema.

## 6. Acompanhamento, dieta, arquivos e avaliações

- **Engajamento** (regra única, testada, configurável): `ativo` com 80% ou mais dos dias previstos nas
  últimas 4 semanas, `oscilando` entre 40% e 80%, `parado` com 14 dias ou mais sem treinar.
- **Dieta:** refeições com itens, quantidades, observações e, opcionalmente, kcal e macros, com totais por
  refeição e por dia somados automaticamente. Alimentos em texto livre. Validade e histórico de versões.
  O aluno faz check-in por refeição (`feito` ou `pulado`, com nota). O check-in fica no documento do aluno
  e o personal vê a adesão em porcentagem, se o aluno consentir.
- **Arquivos:** o personal envia PDFs e imagens ao aluno e vice-versa, reaproveitando `api/media.js` com
  checagem de acesso por vínculo, limite de tamanho e lista de tipos (PDF, JPG, PNG, WebP).
- **Avaliações:** anamnese (questionário editável com modelo inicial, respondido no app), medidas e
  composição (reaproveitando as medidas existentes), listas neuromotora e postural com notas e fotos, FC
  máxima por `220 - idade` (configurável e marcada como estimativa) e VO2máx como valor digitado.
  Esses dados entram na exportação LGPD do aluno.

## 7. Experiência do aluno (as quatro telas)

Levantamento do que já existe e do que falta, a partir do código (a confirmar visualmente em cada etapa):

1. **Corpo** ([Measurements.jsx](../../../frontend/src/views/Measurements.jsx),
   [ProgressPhotos.jsx](../../../frontend/src/views/ProgressPhotos.jsx)): carrossel de fotos com peso e data;
   abas Peso, Medidas e Avançado; peso-alvo com diferença e linha da meta; diagnóstico (IMC, gordura, peso
   ideal, com altura); dobras cutâneas (9 pontos, unidade mm nova); diâmetros ósseos; composição (massa
   gorda, magra, residual, óssea, muscular); registro único por data com foto, peso, medidas e observação.
2. **Histórico e Atividades** ([History.jsx](../../../frontend/src/views/History.jsx),
   [Stats.jsx](../../../frontend/src/views/Stats.jsx)): calendário mensal com dias treinados e lista do dia;
   totais por 7, 14, 28 e 90 dias (tempo, séries, reps, carga) com mini-gráficos; regiões mais treinadas em
   porcentagem no corpo; gráfico de tipos de exercício; resumo do mês; exportar (já existe).
3. **Ficha do exercício e diretório por músculo**
   ([Muscles.jsx](../../../frontend/src/views/Muscles.jsx), `exerciseDetailSheet` em `sheets.jsx`): corpo
   clicável com botão de rotacionar e busca; ficha com abas Estatísticas (volume, 1RM, carga, reps,
   recordes), Instruções e Histórico, e diagrama de músculos alvo.
4. **Acompanhamento do treino** ([FocusView.jsx](../../../frontend/src/views/FocusView.jsx),
   [Workout.jsx](../../../frontend/src/views/Workout.jsx)): estatísticas ao vivo (% concluído, tempo, calorias
   estimadas, séries, reps, carga, fadiga) e lista de exercícios com marcação e "em execução".

Impacto em testes: cerca de 39 arquivos de teste de telas e 61 de sheets dependem da interface atual. Os
que tocam uma tela redesenhada são reescritos na mesma etapa dela.

## 8. Erros

- Acesso negado se confunde com "não encontrado" (4.4).
- Edição do personal usa revisão com 409: o app mostra a versão atual para o personal decidir.
  Na primeira versão o personal edita **online**.
- Confirmar pagamento duas vezes não duplica nada. Geração de fatura é idempotente (secção 5).
- Falha de rede do aluno nunca bloqueia treinar: usa a última ficha baixada.

## 9. Testes

- **Servidor** (`node --test`): matriz de permissões (personal A não lê aluno do personal B, aluno não lê
  outro aluno, desvincular corta acesso), convite de uso único e expirado, status de fatura, recorrência
  sem duplicar, projeção sem campos fora da lista, Pix copia e cola contra vetores de teste conhecidos.
- **Front-end** (`vitest`): cálculos viram funções puras em `src/lib` com teste ao lado (engajamento,
  totais por período, IMC, gordura por dobras, calorias, totais de dieta, faixas de FC, status financeiro).
  Testes das telas por papel.
- Cada rota nova entra no `openapi.yaml`, que o projeto já compara com o código. O app de iPhone só
  compila num Mac, pelo workflow `ios.yml`.
- Textos novos entram nos 19 pacotes de idioma (regra do projeto). Política de preenchimento (traduzir
  tudo ou usar fallback em inglês) decidida na etapa 1.

## 10. Decomposição e ordem

Cada etapa tem spec e plano próprios e termina com testes passando e algo utilizável.

| # | Etapa | Entrega | Depende de |
|---|---|---|---|
| 1 | Fundação | Papéis, convite por link, vínculo, consentimento, função de permissão, navegação por papel, lista de alunos | nada |
| 2 | Treino prescrito | Editor de ficha para um aluno, versões, entrega ao app do aluno, modelos, programas em fases | 1 |
| 3 | Corpo | Tela redesenhada e registro único por data | nada |
| 4 | Histórico e Atividades | Calendário, totais por período, distribuição por músculo, resumo mensal | nada |
| 5 | Ficha do exercício e diretório por músculo | Corpo clicável com rotação, ficha com abas e gráficos | nada |
| 6 | Acompanhamento do treino | Estatísticas ao vivo e lista de exercícios no modo foco | nada |
| 7 | Acompanhamento pelo personal | Telas de Corpo (etapa 3) e de Histórico e Atividades (etapa 4) em leitura, engajamento, projeção filtrada | 1, 3, 4 |
| 8 | Financeiro | Planos, faturas, link Pix, status da assinatura, painel | 1 |
| 9 | Dieta e arquivos | Plano alimentar, check-in, arquivos | 1 |
| 10 | Avaliações | Anamnese, medidas, listas posturais, FC máxima | 1, 3 |

As etapas 3 a 6 não dependem das de personal e podem andar em paralelo com 1 e 2.

## 11. Pré-requisitos e riscos

- **Mídia dos exercícios.** Premissa do projeto: uso local e não comercial. A mídia do catálogo continua
  como está (180 px, sem modificação, junto do aviso do `NOTICE.md`) e nada dela é copiado para fora do app.
  Se o uso mudar, rever esta premissa antes.
- **Licença do código.** O openGym é AGPL-3.0: um serviço usado em rede por terceiros precisa oferecer o código
  fonte correspondente a esses usuários. A exceção para lojas do `NOTICE.md` foi concedida pelo titular
  original ao app dele. Para publicar o fork em lojas, confirmar a situação com o titular e com a loja.
  Isto não é aconselhamento jurídico.
- **Hospedagem local com Cloudflare Tunnel.** O servidor roda no PC do personal (Docker) e o túnel o expõe
  por HTTPS, sem abrir portas (guia: `docs/SELF_HOSTING.md`, opção A). Consequências para o desenho:
  - **Túnel nomeado, com hostname fixo** (um domínio no Cloudflare). Túneis rápidos mudam de endereço a cada
    reinício e quebram convites, passkeys e o app pareado.
  - **`RP_ID` e `ORIGIN` usam o hostname público**, não `localhost`. Trocar o hostname invalida os passkeys
    atuais: a conta do personal precisa de senha ou de um passkey novo no endereço novo.
  - **Rotas públicas precisam passar sem login do Cloudflare:** resgate de convite de aluno, página de
    pagamento (`/pay/<código>`) e a API do app. Não colocar o Cloudflare Access na frente delas; se for
    usado, criar uma política de bypass para esses caminhos. A autenticação é a do próprio app.
  - **`TRUST_PROXY` e `CF_CONNECTING_IP`:** os limites de requisição por endereço (convite, pagamento,
    login) só funcionam com o IP real do visitante. Configurar como descrito em `docs/SELF_HOSTING.md`.
  - **Disponibilidade:** com hospedagem local, se o PC ou o túnel caírem, os alunos ficam sem sincronizar
    (treinam com a última ficha baixada, secção 4.6). Backup periódico de `data/` é obrigatório, já que
    passa a conter dados de terceiros.
- **Lojas.** Publicar o fork exige IDs de app próprios. A App Store exige Mac e conta Apple Developer
  (cerca de US$ 99 por ano). Começar pelo PWA e pelo APK. As lojas têm regras para cobrança dentro de apps;
  confirmar antes de publicar, já que o pagamento aqui é de serviço presencial contratado fora do app.
- **LGPD.** Dados de saúde (avaliações, anamnese, dieta, fotos) pedem consentimento explícito, exportação e
  exclusão. Backup do diretório `data/` passa a conter dados de terceiros.

## 12. Questões em aberto (cada uma tem dono)

| Questão | Decide em |
|---|---|
| O que fazer com as faturas ao excluir a conta de um aluno (retenção fiscal) | Etapa 8 |
| Avaliações do personal × Corpo avançado: recomendação é um histórico único de Corpo, com a marca de quem registrou | Etapa 10 |
| Prescrição como fatia local fora do documento sincronizado (recomendado) | Etapa 2 |
| Política de tradução dos textos novos | Etapa 1 |
| Limites de engajamento, antecedência da fatura e dias de atraso do bloqueio: valores iniciais acima, configuráveis | Etapas 7 e 8 |
