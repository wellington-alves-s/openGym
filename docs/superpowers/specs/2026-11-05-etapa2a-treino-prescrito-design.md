# Etapa 2a: Treino prescrito (ficha de um aluno, versões e entrega)

Data: 2026-11-05. Estado: para revisão. Etapa 2a da spec mestra
[2026-11-01-personal-aluno-design.md](2026-11-01-personal-aluno-design.md) (seções 4.6, 4.7 e 10), sobre a
fundação da etapa 1 ([2026-11-05-etapa1-fundacao-design.md](2026-11-05-etapa1-fundacao-design.md)).
A etapa 2 foi dividida em 2a (esta) e 2b (modelos reaproveitáveis e programas em fases, spec própria depois).

## 1. Objetivo

O personal monta a ficha de treino de um aluno vinculado, a publica em versões numeradas e o aluno recebe
no app, em modo somente leitura, ao lado das rotinas que ele mesmo criou. Sucesso: o personal edita um
rascunho, toca em **Publicar**, e na próxima abertura do app o aluno vê as rotinas prescritas no Plano e no
Início, treina com elas normalmente e o que treina entra no histórico dele.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Recorte | 2a: ficha de um aluno, versões, entrega. 2b: modelos e programas em fases. |
| Editor | O editor de rotinas atual (`RoutineEdit`), aberto sobre o rascunho do aluno por uma fonte de dados plugável (secção 5.2). |
| Versões | Rascunho que só o personal vê. **Publicar** cria a versão numerada, com observação opcional; só então o aluno recebe. |
| Entrega | Rotinas marcadas como prescritas, gravadas no plano do próprio aluno, somente leitura. Muda a recomendação da spec mestra (fatia fora do documento): `S.routines` é lido em 34 arquivos, 166 pontos. |
| Convivência | A ficha entra ao lado. Cada um monta as suas e uma não anula a outra; um dia pode ter a rotina do aluno e a do personal. |
| Formato | O pacote de plano que o app já usa para compartilhar planos (`lib/plan-share.js`, `opengym_plan: 1`), sem exercícios próprios. |
| Edição | Online, com revisão e 409, como na spec mestra (secção 8). |

## 3. Dados no servidor

Novo arquivo por aluno, fora de `students/` (a listagem lê todo `.json` desse diretório como se fosse um aluno):
`DATA_DIR/trainers/<trainerId>/rx/<studentId>.json`, gravado com `durable.js`, ids validados como em
`trainer-store.js` (`validId`).

```
{ _rev, draft: { bundle, updated }, versions: [ { v, at, note, bundle } ], current: v | null }
```

- `bundle` é o pacote de plano: `{ opengym_plan: 1, unit, week, routines, customEx: [] }`. Os pesos estão na
  unidade `unit` do pacote; o app do aluno converte para a dele ao aplicar (já feito por `parsePlan`).
- `versions` guarda as últimas 50; ao passar disso a mais antiga que não seja a atual sai.
- Funções novas em `trainer-store.js`: `readRx`, `writeRx` (sobe `_rev`), `removeRx`. `removeStudent` e
  `removeTrainerDir` também levam o `rx`.
- Validação no servidor, só estrutural (a API não importa o front-end): `bundle` com `routines` (no máximo 30,
  cada uma com `id`, `name` e `ex` de no máximo 60 itens, cada item com `id` string), `week` com chaves 0 a 6
  e listas de ids de rotinas existentes, `customEx` vazio, tamanho total até 128 KB. O resto de cada exercício
  passa como veio; quem aplica é o app, que já limpa e converte (`parsePlan`).

## 4. Rotas

Todas só existem com `TRAINER_MODE` ligado e entram no `openapi.yaml`.

Personal (passam por `trainerGuard` e `canAccessStudent`; acesso negado responde 404). Só aluno vinculado
e ativo: preparar a ficha antes de o aluno entrar fica para depois.

| Rota | O que faz |
|---|---|
| `GET /api/trainer/students/{id}/rx` | Rascunho, versão atual e a lista de versões (sem os pacotes). |
| `PUT /api/trainer/students/{id}/rx/draft` | `{ bundle, _rev }`. 409 com o documento atual se a revisão não bate. |
| `POST /api/trainer/students/{id}/rx/publish` | `{ note, _rev }`. Cria a versão `max(v) + 1` a partir do rascunho e a torna a atual. 400 `empty-draft` se não houver nenhuma rotina com exercício. |
| `GET /api/trainer/students/{id}/rx/versions/{v}` | O pacote de uma versão. |
| `POST /api/trainer/students/{id}/rx/restore` | `{ v, _rev }`. Copia a versão para o rascunho, sem publicar. |

O dispatcher já reconhece `/api/trainer/students/{id}...`; o padrão de caminho cresce para `/rx...`.

Aluno (`studentSession`; sem vínculo ou com personal não aprovado, 404):

| Rota | O que faz |
|---|---|
| `GET /api/student/rx/rev` | `{ v }`, só o número da versão atual (`null` se não houver). Barata, como `/api/data/rev`. |
| `GET /api/student/rx` | `{ v, at, note, bundle }` da versão atual. |

Auditoria: `rx.publish` e `rx.restore`, no padrão das ações de aluno que já existem.

## 5. App do personal

### 5.1 Telas

- `/students/:id` (`trainer/StudentDetail.jsx`, nova): nome e estado do aluno, e o cartão **Treino** com a
  versão publicada (número e data), se há rascunho com alterações, e os botões **Editar ficha**, **Publicar**
  e **Versões**. A linha do aluno em `Students.jsx` passa a abrir esta tela.
- `/students/:id/plan` e `/students/:id/plan/:rid`: a lista de rotinas do rascunho (`trainer/PrescriptionPlan.jsx`,
  enxuta: criar, renomear, apagar, reordenar e escolher os dias da semana) e o editor de uma rotina.
- **Publicar** abre uma folha com a observação opcional. **Versões** abre uma folha com número, data e
  observação de cada versão, e **Restaurar no rascunho**.
- O rascunho salva sozinho (debounce de 800 ms) com a revisão; a tela mostra "Salvando" e "Salvo". Se der 409,
  um aviso "A ficha mudou em outro lugar" com **Recarregar**, que descarta o que ainda não subiu.

### 5.2 O editor sobre uma fonte plugável

`RoutineEdit` hoje lê e escreve `S.routines` direto do estado do usuário. Passa a usar `useWorkspace()`
(`lib/workspace.js`), que devolve `{ S, update, getS }`. Sem provedor, são os do `useStore`, e o comportamento
atual não muda (os testes do editor continuam valendo e são a rede de segurança). O provedor do personal
(`trainer/PrescriptionWorkspace.jsx`) mantém o rascunho num estado local com o mesmo contrato de `update(fn)`
(o produtor altera uma cópia). Na tela de edição, o `S` do espaço de trabalho expõe os campos que o editor lê
(`routines`, `week`, `unit` e os poucos mais que o plano inventariar).

No modo do personal ficam de fora o backup automático, desfazer, imprimir, copiar para o plano próprio, a
configuração de progressão e o Coach; o seletor de exercícios mostra só o catálogo (sem "Crie seu próprio
exercício"). Tudo o que usa o estado do usuário fora do espaço de trabalho (por exemplo `useStore.getState()`
dentro do editor) passa pelo mesmo `useWorkspace()`.

## 6. App do aluno

### 6.1 Aplicar a ficha (`lib/prescription.js`, funções puras)

- `isPrescribed(r)`: tem `rx`. `appliedVersion(S)`: o maior `rx.v` entre as rotinas.
- `applyPrescription(S, bundle, v)`, sobre o rascunho do `update`: passa o pacote por `parsePlan` (converte a
  unidade do personal para a do aluno e descarta ids de exercício que o app não conhece); cada rotina vira
  `{ ...rotina, id: 'rx-' + id, rx: { v }, excludeFromProgression: true }`. Rotinas que já existiam com esse id
  são trocadas no lugar (mesma posição, sem tombstone de exclusão); as que saíram da ficha são apagadas com
  `deleteRoutine`, que também limpa dias e remarcações; as novas entram no fim da lista.
- Dias: para cada dia da ficha, os ids prescritos entram no fim da lista do dia, sem repetir e sem tirar nada
  que o aluno tenha posto lá. Dias que a versão anterior citava e a nova não citam perdem só o id prescrito.
- `removePrescription(S)`: apaga toda rotina com `rx` (usado ao desvincular).
- `excludeFromProgression: true` impede que o fim de um treino altere as cargas que o personal escolheu.
- `copyRoutine` passa a descartar `rx` e a marca de exclusão da progressão: a cópia é rotina própria.

### 6.2 Quando baixar (`lib/prescription-sync.js`)

`syncPrescription({ api, getS, update })`: se a conta é de aluno vinculado, pergunta `GET /api/student/rx/rev`;
se `v` difere de `appliedVersion`, baixa `GET /api/student/rx` e aplica. 404 (desvinculado) chama
`removePrescription`. Dispara ao abrir o app, ao voltar ao foco e depois de cada sincronização. Se há treino
em andamento (`S.active`), a troca espera o fim do treino (o treino em curso termina com a cópia que já tem).
Sem internet, nada acontece e vale a última versão aplicada. Uma versão nova aplicada mostra o aviso
"Seu personal atualizou seu treino".

### 6.3 Somente leitura

Rotina prescrita não tem editar, apagar, reordenar nem mover exercícios no Plano e no editor (ele abre em modo de
leitura, com os controles escondidos), e mostra o selo "Prescrita pelo personal". **Copiar** continua. Treinar,
registrar, histórico e estatísticas funcionam como em qualquer rotina. Em Configurações, "Meu personal" mostra a
versão em uso e a data.

## 7. Erros e casos de borda

- Acesso negado e aluno de outro personal: 404, como na etapa 1.
- 409 no rascunho: o personal decide (recarregar). Publicar com `_rev` velho também dá 409.
- Rascunho vazio não publica. Versão já publicada nunca é alterada; restaurar só escreve no rascunho.
- Exercício da ficha que o app do aluno não conhece (catálogo mais antigo): descartado na aplicação, e a rotina
  segue com os demais; nunca trava a entrega.
- Unidade diferente entre personal e aluno: convertida na aplicação.
- Desvincular: o servidor corta o acesso na hora; no próximo `syncPrescription` o app tira as rotinas prescritas e
  os dias que as citam. As rotinas próprias do aluno e o histórico ficam. O `rx` fica guardado do lado do personal.
- Treino já gravado de uma rotina prescrita continua apontando para o id fixo `rx-<id>`, então o histórico não
  se perde entre versões.

## 8. Testes

- **Servidor** (`node --test`): matriz de permissões (personal A não lê nem grava o `rx` de aluno do personal B;
  aluno só lê a própria versão atual; desvincular corta; aluno sem vínculo recebe 404); rascunho com 409;
  publicar numera 1, 2, 3 e recusa rascunho vazio; restaurar escreve só no rascunho; limites de tamanho e de
  quantidade; corte das 50 versões; `removeStudent` leva o `rx`; `rev` barata.
- **Front-end** (`vitest`): `applyPrescription` (idempotente, troca no lugar, remove o que saiu, convive com
  rotinas e dias próprios, converte unidade, descarta exercício desconhecido), `removePrescription`,
  `copyRoutine` sem a marca, `syncPrescription` (aplica, espera treino em andamento, 404 remove, offline não faz
  nada), travas de somente leitura, as telas do personal e a regressão do `RoutineEdit` pelo `useWorkspace()`.
- `openapi-routes.test.js` cobre as rotas novas. Textos novos entram nos 19 pacotes de idioma, com a política da
  etapa 1 (traduzidos, para revisão de falante nativo).

## 9. Fora desta etapa

Modelos e programas em fases (2b); exercício criado pelo personal; edição offline pelo personal; preparar a ficha
antes de o aluno entrar; ficha com mais de um aluno ao mesmo tempo; aviso por notificação push.

## 10. Riscos

- O maior risco é a adaptação do `RoutineEdit` (602 linhas, cerca de 20 arquivos de teste): a regressão é coberta
  pelos testes atuais, rodados antes e depois de cada passo.
- Rotinas prescritas dividem o documento do aluno com as dele: a sincronização entre aparelhos do aluno as
  carrega como qualquer rotina; aplicar a mesma versão em dois aparelhos dá o mesmo conteúdo.
- O aluno pode alterar o próprio documento por fora do app; a prescrição não é uma proteção contra isso, só a
  fonte de verdade da próxima entrega.
