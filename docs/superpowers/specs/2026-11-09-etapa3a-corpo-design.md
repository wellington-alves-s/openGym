# Etapa 3a: Tela Corpo e registro único por data

Data: 2026-11-09. Estado: para revisão. Etapa 3 da spec mestra
[2026-11-01-personal-aluno-design.md](2026-11-01-personal-aluno-design.md) (seções 7.1 e 10), dividida em 3a (esta)
e 3b (avançado). Não depende das etapas de personal.

## 1. Objetivo

O aluno tem **uma tela Corpo** que junta peso, fotos de progresso e medidas, e **um único "Registrar" por data**
que grava as três coisas de uma vez. A tela mostra o IMC quando o perfil tem altura. Sucesso: o aluno abre Corpo,
vê a evolução do peso com a meta, as últimas fotos e as medidas, e registra o dia inteiro numa folha só.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Divisão | 3a: tela, registro único, peso-alvo, altura, IMC. 3b: dobras cutâneas, diâmetros ósseos, composição, peso ideal (e sexo e nascimento, que só elas usam). |
| Onde ficam os dados | Onde já ficam: `S.bodyweight`, `S.measurements`, fotos (`dayPhotos` ou na sessão). **Nada migra.** Sync, backup, CSV, Apple Watch e importação não mudam. |
| Registro único | Uma folha que escreve nas três origens por meio de uma função pura. Numa data que já tem registro ela carrega os valores e salvar substitui (é a edição). |
| Observação do dia | Mapa novo `bodyNotes`, **não** `dayNotes`: uma nota em `dayNotes` dispensa o lembrete de dia perdido, e uma observação de corpo não pode isentar o treino. |
| Altura | Campo novo do perfil, `heightCm`, em cm no armazenamento, mostrado em cm ou pol conforme o perfil. |
| Tela | Componente autônomo `Body`, na rota `/body`. A etapa 4 encaixa como aba e a etapa 7 mostra ao personal em leitura. |
| Rotas antigas | `/measurements` redireciona para `/body` na aba Medidas. `/progress-photos` continua (grade completa e comparação). |
| Fora | Dobras, diâmetros, composição e peso ideal (3b). Abas Atividades/Histórico/Corpo (etapa 4). Visão do personal (etapa 7). Fotos de frente, lado e costas com rótulo. |

## 3. Dados

### 3.1 Altura

`S.heightCm`: número em cm, de 50 a 260 com uma casa decimal, ou `null`. É uma configuração do perfil como
`targetW`, então sincroniza por campo com o carimbo próprio de cada configuração. O perfil de um backup antigo
não a tem e nada nele muda.

### 3.2 Observação do dia

`S.bodyNotes = { 'YYYY-MM-DD': { text, _ts } }`, como `dayNotes` (`lib/day-notes.js`): uma entrada por dia, com a
hora da última escrita. Retirar uma observação grava uma entrada vazia carimbada (`{ _ts }`), nunca apaga a chave.
O texto é cortado em `NOTE_MAX` (`lib/history.js`). Só hoje e dias passados aceitam observação.

- `bodyNotes` entra em `STAMPED_MAPS` nos **dois** lados: `frontend/src/lib/sync-merge.js` e `api/sync-stamps.js`
  (o teste de paridade já existente compara). `api/nudge.js` e o lembrete **não** leem `bodyNotes`.
- Os caminhos que andam todos os mapas carimbados (reset, mídia, `stateMediaRefs`) seguem a lista, então não
  precisam de código novo além de a lista ter o nome.

### 3.3 Registro por data

Não é um documento novo. Para uma data `d`, o "registro" é o que existe nas origens:

- peso: a entrada de `S.bodyweight` com `d`;
- medidas: a entrada de `S.measurements` com `d` (já é uma por data, `normalizeMeasurementsState`);
- fotos: as de `progressPhotosOf(S)` com `d`;
- observação: `S.bodyNotes[d]`.

## 4. Funções puras (`frontend/src/lib`)

Cada uma com teste ao lado.

- `body-checkin.js`:
  - `checkinOf(S, d)` → `{ d, weight, measurements, note }` lido das origens (`weight` em kg ou lb do
    perfil como a folha mostra; `null` onde não há). As fotos não vêm daqui: a folha as lê com `progressPhotosOf`
    (`views/ProgressPhotos.jsx`), porque um módulo de `lib/` não importa uma tela.
  - `applyCheckin(state, input, now)` → muta o estado como `update()` espera e devolve `{ ok: true, photos }` ou
    `{ ok: false, reason }`. `input = { d, weight, measurements, note, newPhotos }`. Regras: data válida e não
    futura; ao menos uma coisa preenchida (peso, uma medida, uma foto nova ou observação); o peso passa pelos
    mesmos limites da folha de peso de hoje (`bwTooHeavy`); as medidas passam por `normalizeMeasurementsState`
    como hoje; uma observação vazia retira a anterior. Salvar numa data que já tem peso **substitui** esse peso
    (aqui é edição; a folha antiga que recusava uma data repetida continua como está).
  - Fotos: não saem de `applyCheckin`; a folha as arquiva com `fileProgressPhoto` como a tela de fotos faz hoje
    (as regras de "sem lugar" e de duplicada ficam lá).
- `bmi.js`: `bmi(weightKg, heightCm)` → número com uma casa ou `null` (peso ou altura ausente, zero ou fora de
  faixa); `bmiBand(value)` → `'under' | 'normal' | 'over' | 'obese'` (abaixo de 18,5; 18,5 a 24,9; 25 a 29,9; 30
  ou mais, faixas da OMS para adultos). Rótulos pelo `t()`. Não vale para menor de idade nem para quem treina
  muita massa muscular; o cartão traz uma linha curta dizendo que é uma referência.
- `body-goal.js`: `goalGap(weight, target)` → `{ diff, toward }` (diferença assinada e se o último movimento vai
  em direção à meta, só quando há dois pesos); sem meta devolve `null`.

## 5. Interface

### 5.1 Tela `Body` (`views/Body.jsx`, rota `/body`)

Cabeçalho com voltar para `/stats`, título "Corpo" e o botão Registrar. De cima para baixo:

1. **Faixa de fotos:** as últimas fotos de progresso (até 10), cada uma com a data e o peso daquele dia, quando há.
   Tocar abre a foto (`PhotoView`, já existe). "Ver todas" vai a `/progress-photos`. Sem fotos, um convite curto
   com o botão Registrar.
2. **Abas** `Peso` e `Medidas` (a aba `Avançado` só nasce na 3b). A aba escolhida fica na URL (`?tab=`), então o
   redirecionamento de `/measurements` e o voltar funcionam.
3. **Aba Peso:** peso atual, diferença para a pesagem anterior, diferença para o peso-alvo (`goalGap`), faixas
   1M, 3M, 1A e Tudo, gráfico com a linha da meta (`LineChart` já aceita `goal`), taxa semanal (`WeightRate`) e
   "Todas as pesagens" (`weighInsSheet`), tudo o que o cartão de peso da Estatísticas já faz, **reaproveitado**:
   o que hoje é local de `Stats.jsx` e `sheets.jsx` é exportado, não copiado. Botão para definir a meta
   (`goalSheet`).
4. **Aba Medidas:** a escolha da medida, o gráfico, a diferença desde a anterior e o histórico por data de
   `Measurements.jsx`, movidos como componente da aba. Editar um dia abre o Registrar nessa data. Excluir
   continua com a confirmação de hoje.
5. **Cartão Diagnóstico:** IMC e a faixa, ou, sem altura, o pedido "Informe sua altura" com o campo ali mesmo
   (cm ou pol). Sem nenhum peso, "Registre seu peso". A altura também se edita pelo cartão.

### 5.2 Folha Registrar (`BodyCheckinSheet`)

Abre de qualquer ponto de Corpo, na data de hoje, ou numa data ao editar. Campos: data; peso; fotos (usa
`useMediaPicker` e `fileProgressPhoto`, como a tela de fotos); observação; e as medidas **ativas** (as de
`enabledMeasurementFields`), recolhidas por padrão atrás de "Medidas". Ao trocar a data, a folha recarrega os
valores dessa data (`checkinOf`). Salvar chama `applyCheckin` e depois arquiva as fotos. Mensagens: data
inválida, "Preencha ao menos um item", peso fora do limite, medida percentual fora de 0 a 100. A antiga folha de
medidas foi removida e a folha Registrar a substitui; a folha de peso fica onde estava (o treino e o Watch usam).

### 5.3 Estatísticas

Os cartões "Fotos de progresso" e "Medidas corporais" viram um só, **Corpo**, com o último registro e o botão
Abrir para `/body`. O cartão de peso fica como está.

### 5.4 Rotas

`/body` carrega com lazy como as telas pouco abertas. `/measurements` vira redirecionamento para
`/body?tab=measurements`. O voltar de `/body` e o gesto de borda vão para `/stats`, como as telas de hoje. O
`TabBar` já mapeia as rotas de corpo para Estatísticas; `/body` entra nesse mapa.

## 6. Erros e bordas

- Peso em lb: a folha mostra e grava na unidade do perfil, como a de peso hoje; o IMC converte para kg.
- Altura em pol: aceita número com ponto ou vírgula, guarda cm.
- Registrar numa data com várias fotos e nenhum lugar no servidor (`no-room`): grava o resto e avisa, como a tela
  de fotos.
- Perfil sem altura, sem peso, sem medidas ativas ou sem fotos: cada parte mostra seu estado vazio, nenhuma quebra.
- Duas pessoas de dispositivos diferentes editando o mesmo dia: peso e medidas seguem a mescla de hoje (a entrada
  mais nova do dia vence); a observação segue o carimbo.
- Backup antigo sem `heightCm` nem `bodyNotes`: abre normal.

## 7. Testes

- `lib`: `body-checkin.test.js` (ler registro, gravar peso/medida/observação, substituir o dia, limites, data
  futura, tudo vazio, observação vazia retira), `bmi.test.js` (faixas nas bordas 18,5, 25 e 30, entradas
  inválidas, lb), `body-goal.test.js`.
- Sincronização: `bodyNotes` mesclado por carimbo e retirada que não volta; paridade com `api/sync-stamps.js`.
- Telas: `Body.test.jsx` (faixa de fotos, troca de aba pela URL, cartão de IMC com e sem altura, Registrar
  carregando uma data existente e salvando as três origens). Os testes de `Measurements*`, `ProgressPhotos*` e
  `Stats*` que tocam o que mudou são atualizados na mesma etapa.
- Textos novos nos 19 pacotes de idioma (política da etapa 1: pt e pt-BR traduzidos, os outros em inglês).
- Os checks de CI (`check-locales`, `check-source-strings --strict`, auditoria de testes) passam.

## 8. Fora do escopo

Dobras cutâneas, diâmetros ósseos, composição corporal, peso ideal, sexo e nascimento no perfil (3b). Abas
Atividades/Histórico/Corpo (etapa 4). Corpo em leitura para o personal (etapa 7). Rótulo de ângulo nas fotos.
