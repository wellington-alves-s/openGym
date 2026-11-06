# Etapa 2b: Programas em fases e modelos

Data: 2026-11-06. Estado: para revisão. Etapa 2b da spec mestra
[2026-11-01-personal-aluno-design.md](2026-11-01-personal-aluno-design.md) (seções 4.2, 4.7 e 10), sobre a
etapa 2a entregue ([2026-11-05-etapa2a-treino-prescrito-design.md](2026-11-05-etapa2a-treino-prescrito-design.md)).

## 1. Objetivo

O personal monta, para cada aluno, uma fila de **meses**: cada mês é uma ficha como a da 2a (rotinas e dias da
semana) que dura algumas semanas. O app do aluno sabe em que mês e semana ele está, põe no plano dele as rotinas
do mês atual e troca sozinho na virada. O personal também guarda **modelos** (um mês pronto) para reaproveitar em
outros alunos. Sucesso: o personal publica três meses de uma vez, e o aluno vê "Mês 2 de 3, semana 3 de 4",
o avanço e o próximo treino, sem o personal publicar nada na virada.

Origem do desenho: o personal que vai usar o app monta um plano por mês e troca a cada mês, com os dias da semana
em que o aluno treina e os exercícios de cada dia. Um mês é uma fase de 4 semanas.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Programa | Lista ordenada de fases. Cada fase: id, nome, número de semanas e uma ficha (o pacote de plano da 2a). |
| Data de início | Uma por programa. A semana 1 começa nesse dia. Mudar a data é uma publicação nova. |
| Quem avança | O app do aluno, pela data do aparelho. A troca de fase não vai ao servidor. |
| Ficha da 2a | Continua válida: é lida como um programa de uma fase só, sem data de início. Nada publicado quebra. |
| Modelo | Um mês (uma ficha) guardado em `trainers/<personal>/profile.json`. Usar um modelo copia, não liga. |
| Ids de rotina | Únicos dentro de uma fase. **Duplicar mês** e **Usar modelo** mantêm os ids: a mesma rotina continua no mês seguinte e o histórico fica no mesmo `rx-<id>`. |
| Fora | Modelo de programa inteiro, notificação na virada do mês, editar vários alunos de uma vez, ficha antes de o aluno entrar. |

## 3. Dados no servidor

### 3.1 Programa

`program = { start: 'YYYY-MM-DD' | null, phases: [{ id, name, weeks, bundle }] }`, `bundle` é o pacote de plano da 2a
(`opengym_plan: 1`, `unit`, `week`, `routines`, `customEx: []`).

- O rascunho vira `{ program, updated }` e cada versão `{ v, at, note, program }`. Funções puras novas em `api/rx.js`:
  `programOf(x)` lê um rascunho ou uma versão de qualquer formato: com `program` devolve o programa; com só `bundle`
  (formato da 2a) devolve `{ start: null, phases: [{ id: 'p1', name: '', weeks: 0, bundle }] }` (`weeks: 0` quer dizer
  "sem fim"). Toda gravação nova usa só `program`.
- `checkProgram(p)` valida (códigos novos além dos de `checkBundle`, que vale para cada fase): no máximo 24 fases;
  `weeks` inteiro de 1 a 52 (ou 0 só na fase única migrada); `name` até 40 caracteres; ids de fase únicos
  (`/^[\w-]{1,64}$/`); `start` data válida ou `null`; tamanho total até 262144 bytes (cada fase continua com os
  limites de 30 rotinas, 60 exercícios e 131072 bytes). Códigos: `bad-program`, `too-many-phases`, `bad-phase`,
  `bad-start`, mais os de `checkBundle`.
- `publishDraft` recusa (`empty-draft`) um programa em que nenhuma fase tenha uma rotina com exercício.
- `RX_LIMITS` ganha `phases: 24` e `programBytes: 262144`.

### 3.2 Rotas do rascunho e da versão

As cinco rotas do personal e as duas do aluno da 2a continuam; mudam os corpos:
- `PUT .../rx/draft` aceita `{ program, _rev }` e, por compatibilidade com o app da 2a, `{ bundle, _rev }`
  (embrulhado numa fase única).
- `GET .../rx` e `.../rx/versions/{v}` devolvem `program`; o `rxView` do rascunho também. `rxView.versions` continua
  sem os programas.
- `GET /api/student/rx` devolve `{ v, at, note, program }` e, **só quando o programa tem uma fase**, também `bundle`
  (a fase única), para o app da 2a continuar funcionando. `GET /api/student/rx/rev` não muda.

### 3.3 Modelos

`DATA_DIR/trainers/<trainerId>/profile.json`, gravado com `durable.js`: `{ models: [{ id, name, updated, _rev, bundle }] }`.
Funções em `trainer-store.js`: `readProfile`, `writeProfile`. `removeTrainerDir` já leva o arquivo.
Limites: 100 modelos por personal; `name` de 1 a 40 caracteres; `bundle` passa por `checkBundle`.

| Rota (só personal aprovado, 404 para os demais) | Corpo | Resposta |
|---|---|---|
| `GET /api/trainer/models` | | `{ models: [{ id, name, updated, routines, exercises }] }` (sem pacotes) |
| `GET /api/trainer/models/{id}` | | `{ model: { id, name, updated, _rev, bundle } }` |
| `POST /api/trainer/models` | `{ name, bundle }` | `{ model }` |
| `PUT /api/trainer/models/{id}` | `{ name?, bundle?, _rev }` | `{ model }`; 409 `conflict` com o modelo atual se `_rev` não bate |
| `DELETE /api/trainer/models/{id}` | | `{ ok: true }` |

A revisão é a de cada modelo; o servidor lê, confere, altera e grava o arquivo sem `await` no meio. Auditoria:
`model.create`, `model.update`, `model.delete`. O dispatcher ganha o padrão `/api/trainer/models/{id}`. Tudo no
`openapi.yaml` e no `website/api.html`.

## 4. App do aluno

### 4.1 Em que fase ele está (`lib/program.js`, puro, com teste ao lado)

- `phaseAt(program, today): { index, phase, state, weekInPhase, phaseWeeks, weekInProgram, totalWeeks, progress }`,
  datas como `YYYY-MM-DD` do calendário local (`todayISO` de `lib/format.js`). `start: null` ou fase única com
  `weeks: 0`: fase 0, estado `running`, sem progresso. Antes de `start`: fase 0, estado `before`. Depois do fim: a
  última fase, estado `after`, `progress: 1`. Fronteiras: a fase `i` ocupa `[start + 7·soma(weeks anteriores),
  start + 7·soma(weeks até i))`. `progress` = dias passados sobre os dias totais, entre 0 e 1.
- `nextSession(phase, today): { date, routineIds } | null`: o próximo dia, a partir de hoje inclusive, em que
  `phase.bundle.week` tem rotinas (ids como `rx-<id>`); `null` se a fase não tem dias.

### 4.2 Aplicar a fase e trocar na virada

- `applyPrescription(S, bundle, v, phaseId)` (da 2a) ganha o id da fase e grava `rx: { v, p }` nas rotinas. Para
  trocar de fase basta aplicar o pacote da fase nova: as rotinas que continuam (mesmo id) são trocadas no lugar, as
  que saem são apagadas, as novas entram. `appliedKey(S)` devolve `"<v>:<p>"` das rotinas prescritas (`''` se não há).
- **Cache do programa** (`lib/prescription-cache.js`, `localStorage`, chave por conta, tudo em `try/catch`): guarda
  `{ v, program }` do que foi baixado, para trocar de mês sem rede. Sem cache e sem rede, nada acontece e vale o que
  já está aplicado. `404` e desvincular apagam o cache e as rotinas.
- `syncPrescription` passa a receber `cache` e `today()`: confere `rev`; se `v` difere do cache, baixa e grava o cache;
  calcula a fase de hoje com `phaseAt`; se a chave `v:fase` difere de `appliedKey`, aplica (esperando o fim do treino
  em andamento, como já faz). Aviso novo ao virar de mês sem versão nova: `Your plan moved to {0}`; com versão nova,
  o aviso da 2a. Os gatilhos são os da 2a (abrir, voltar ao foco, voltar a internet).
- A virada pode acontecer na primeira conferência depois da meia-noite; entre uma conferência e outra vale o mês
  anterior. Isso é aceito (o app abre em foco quase sempre antes de treinar).

### 4.3 O que o aluno vê

- Um cartão no Início (`components/ProgramCard.jsx`), só para quem tem programa em cache: `Month 2 of 3` (nome da
  fase se houver), `Week 3 of 4`, barra de avanço e `Next: <rotina>, <dia>` (a rotina e o dia vêm de `nextSession`).
  Antes do início: `Starts on {0}`; depois do fim: `Program finished`. Toque abre o Plano.
- Em Configurações, "Meu personal": a linha da 2a passa a `Training plan: version {0}` mais o mês atual.

## 5. App do personal

- Rotas: `/students/:sid/plan` agora é a **visão do programa** (`trainer/ProgramView.jsx`): data de início, lista de
  meses (nome, semanas, datas, número de rotinas) e as ações **New month**, **Duplicate previous month**, **Use a
  model**, subir, descer, apagar, e em cada mês **Save as model**. `/students/:sid/plan/:phase` é a lista de rotinas
  do mês (a `PrescriptionPlan` da 2a, com os dias da semana) e `/students/:sid/plan/:phase/:id` o editor. O
  `RoutineEdit` continua lendo `:id` como rotina.
- O rascunho que a sessão guarda passa a ser o **programa**; o `createWorkspaceStore` da 2a continua sendo a visão de
  **uma fase**: ao entrar num mês cria-se a fase-workspace a partir do pacote dele, e cada alteração volta para a fase do
  programa antes do salvamento automático. Conversão de unidade e `workouts: []` como na 2a, por fase.
- A maquinaria de sessão e salvamento automático (hoje dentro de `PrescriptionWorkspace.jsx`) é extraída para um
  módulo que recebe `load()` e `save(doc, rev)`, e serve a dois documentos: o programa de um aluno
  (`getRx`/`saveRxDraft`) e um modelo (`getModel`/`putModel`, o documento é um programa de uma fase só). O
  comportamento da 2a (sessão por documento, 409, voltar a salvar com a revisão guardada, limpar ao sair da conta)
  não muda.
- **Modelos:** nova aba `Models` na barra do personal (`tabsFor` em `lib/roles.js`), rota `/models` (lista, criar,
  renomear, apagar, abrir) e `/models/:mid/plan`, `/models/:mid/plan/:id` (o mesmo editor, sobre o documento do modelo).
  **Use a model** (em um mês novo) escolhe um modelo e copia o pacote para o mês; **Save as model** pede o nome e cria
  o modelo a partir do mês.
- **Publicar** e **Versões** continuam na `StudentDetail` e agora publicam e restauram o programa inteiro.

## 6. Erros e casos de borda

- Rascunho, publicação e restauração: igual à 2a (409 com `rx`, `empty-draft`, `not-linked`).
- Programa com datas no passado: vale a fase de hoje. Programa que já terminou: vale a última fase.
- `start: null` com mais de uma fase: a fase 0 vale para sempre (o personal ainda não escolheu a data); a visão do
  programa avisa `Pick a start date`.
- Apagar uma fase que o aluno está usando: some na próxima publicação; o aluno troca na próxima conferência.
- Modelo apagado depois de usado: nada acontece nas fichas já copiadas.
- Cache do aluno corrompido ou de outra conta: ignorado (a chave inclui o id da conta) e baixado de novo.
- Relógio do aparelho errado: o aluno vê o mês que o relógio diz; sem tratamento especial.

## 7. Testes

- **Servidor** (`node --test`): `programOf` lê rascunho e versão no formato da 2a e no novo; `checkProgram` (limites,
  datas, ids, semanas 1 a 52, tamanho); `publishDraft` com todas as fases vazias recusa; o corpo `{ bundle }` do PUT ainda
  funciona; `GET /api/student/rx` devolve `bundle` só com fase única; modelos (matriz de permissões: o personal B não vê
  os modelos do A, aluno 404, criar, listar sem pacotes, 409 no `PUT` velho, limite de 100, apagar); `profile.json` e
  `removeTrainerDir`.
- **Front-end** (`vitest`): `phaseAt` (antes, no primeiro dia, em cada fronteira, depois do fim, `start: null`, mudança de
  mês, fase única sem fim), `nextSession`, `applyPrescription` com fase (troca no lugar, remove o que saiu, idempotente,
  `appliedKey`), `syncPrescription` (virada de mês sem rede usando o cache, virada com versão nova, treino em andamento
  adia, 404 limpa o cache), o cache (conta errada, JSON ruim), o cartão do Início, a visão do programa (novo mês, duplicar,
  usar e salvar modelo, subir e descer, apagar), a sessão extraída (os testes da 2a continuam passando sem mudança) e a
  aba Models.
- `openapi-routes.test.js` cobre as rotas novas. Textos novos nos 19 pacotes, como na 2a.

## 8. Riscos

- A extração da maquinaria de sessão de `PrescriptionWorkspace.jsx` mexe no trecho mais delicado da 2a (salvamento
  automático, 409, perda de edição). Os testes da 2a (o de ida e volta lista-editor, o de falha de salvamento, o de
  sair da conta) são a rede de segurança e têm de passar sem alteração.
- O app da 2a em circulação lê `bundle`: coberto pela compatibilidade de 3.2 enquanto o programa tiver uma fase.
  Programas de várias fases só funcionam direito no app novo; atualizar os apps dos alunos antes de publicar o
  segundo mês.
- Datas locais: `phaseAt` usa o calendário local; teste com fusos diferentes e horário de verão.
