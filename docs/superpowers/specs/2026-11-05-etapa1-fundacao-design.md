# Etapa 1: Fundação (personal e alunos)

Data: 2026-11-05. Estado: para revisão. Etapa 1 de 10 da
[spec mestra](2026-11-01-personal-aluno-design.md); as decisões dela valem aqui. Depois de aprovada,
vira plano de implementação.

## 1. Objetivo

Dar ao openGym o chão sobre o qual as outras nove etapas se apoiam: contas com papel, vínculo entre
personal e aluno, convite por link, consentimento do aluno, uma única regra de permissão e a navegação
de cada papel. Ao fim da etapa o personal cadastra um aluno, manda o link, o aluno cria a conta, e os
dois aparecem ligados. Não há ainda treino prescrito, financeiro nem dados do aluno visíveis ao personal.

Pronto quando:

- O personal gera um convite de uso único e o aluno cria a conta por ele, vinculada ao personal.
- Existe uma só função de permissão, usada por toda rota do personal, com matriz de testes.
- Desvincular corta o acesso do personal na hora e deixa os dados com o aluno.
- A tela de entrada e a navegação mudam por papel, e o personal novo fica pendente até o dono aprovar.
- Uma conta sem papel, e um servidor sem `TRAINER_MODE`, funcionam exatamente como hoje.

## 2. Decisões desta etapa

| Tema | Decisão |
|---|---|
| Ligar o recurso | Variável `TRAINER_MODE=1` no servidor. Desligada por padrão: nada muda para quem usa o openGym sozinho. |
| Entrada | Tela "Sou aluno / Sou personal", só com `TRAINER_MODE`. Os dois caminhos têm login e "Esqueceu a senha?". A referência é só de função: nenhuma marca ou imagem dela entra. |
| Conta do personal | Cadastro aberto (nome, e-mail, senha ou passkey, telefone opcional), mas a conta fica `pendente` até o dono aprovar no painel. O dono liga o modo na própria conta; em servidor novo com `TRAINER_MODE`, a primeira conta vira dono e personal aprovado. |
| Recusar personal | Apaga a conta pendente. |
| Conta do aluno | Só o personal cria. "Não tenho uma conta" do aluno mostra o aviso para falar com o personal. O aluno ativa a conta por um link de convite e escolhe senha ou passkey. |
| Convite | Uso único, 7 dias, código guardado só como SHA-256, no molde de `api/device-link.js`. Vale mesmo com `INVITE_ONLY` ligado, porque quem emite já está autenticado. |
| Barra do personal | Só **Alunos** e **Perfil** nesta etapa. Modelos e Financeiro entram nas etapas 2 e 8. |
| Textos | Todo texto novo entra nos 19 pacotes de idioma, traduzido (regra do projeto). Fecha a questão em aberto da spec mestra. |

## 3. Modelo de dados

### 3.1 `db.json`

`users[]` ganha campos opcionais. Uma conta sem `role` é uso individual, como hoje.

```
role: 'trainer' | 'student'            ausente = individual
trainerStatus: 'pending' | 'approved'  só para role 'trainer'
phone?: string                          só para role 'trainer', opcional, até 30 caracteres
trainerId?: string                      só para role 'student'; ausente depois de desvincular
consent?: { measures, photos, diet: boolean, at: ISO }   só para role 'student'
```

`db.studentInvites[]` (coleção nova, ao lado de `deviceLinks`):

```
{ h: sha256 do código, trainerId, studentId, exp: ms, created: ms }
```

O código aparece uma vez, na resposta que cria o convite, e nunca é gravado. Um aluno tem no máximo um
convite vivo: gerar outro substitui o anterior. Convite vencido é descartado na próxima leitura.

### 3.2 Armazenamento do personal

`DATA_DIR/trainers/<trainerId>/students/<studentId>.json`, gravado com `durable.js` (temp e rename):

```
{ id, name, phone?, email?, status: 'invited' | 'active' | 'unlinked',
  created, linkedAt?, unlinkedAt?, _rev }
```

`studentId` é gerado quando o personal cria o aluno e vira o `id` da conta quando o convite é resgatado,
então registro e conta compartilham a chave. `profile.json` do personal fica para a etapa 8 (nada a
guardar aqui).

## 4. Servidor

### 4.1 Módulos novos (puros, testáveis, sem rota)

- `api/student-invite.js`: `createStudentInvite`, `findStudentInvite`, `burnStudentInvite`,
  `dropStudentInvites`, mesma forma de `device-link.js` (hash com prefixo próprio, comparação em tempo
  constante, código de 12 caracteres do mesmo alfabeto).
- `api/trainer-access.js`: a função de permissão e os helpers de papel.
  - `isApprovedTrainer(user)`: `role === 'trainer'`, `trainerStatus === 'approved'`, não desativado.
  - `canAccessStudent(db, trainer, studentId)`: verdadeira só se o personal é aprovado, a conta do aluno
    existe, não está desativada, tem `role: 'student'` e `trainerId === trainer.id`.
  - `detachStudentsOf(db, trainerId)`: tira o vínculo de todos os alunos de um personal (usada ao
    excluir ou rebaixar o personal).
- `api/trainer-store.js`: ler, listar e gravar o registro do aluno com `durable.js`, sempre dentro de
  `trainers/<trainerId>/`, com o id validado contra o padrão para não escapar do diretório.

### 4.2 Rotas

Todas entram no `openapi.yaml`. Acesso negado responde igual a "não encontrado" (404), para não revelar
quem são os alunos de outro personal.

Configuração e sessão:
- `GET /api/config`: ganha `trainer_mode: true` quando ligado (público, como as outras chaves).
- `GET /api/me`: `user` ganha `role`, `trainerStatus` e, para o aluno, `trainer: { name }`.

Cadastro do personal (reaproveita as rotas de registro existentes):
- `POST /api/register/password`, `/api/register/options` e `/api/register/verify` aceitam `as: 'trainer'`
  e só com `TRAINER_MODE`. Criam `role: 'trainer'` e `trainerStatus: 'pending'`. Em servidor novo
  (nenhum usuário), a primeira conta vira dono, admin e `approved`, pelo mesmo `claimFirstAdmin`.
  Com `INVITE_ONLY` ligado, o código de convite do admin continua exigido. Nenhum valor de `as` cria
  aluno: a conta de aluno só nasce em `/api/join`.

Personal (exige personal aprovado; pendente recebe 403 `trainer-pending`):
- `GET /api/trainer/students`: lista `{ id, name, status, phone, created, linkedAt }`.
- `POST /api/trainer/students` `{ name, phone?, email? }`: cria o registro `invited` e o convite. Responde
  `{ student, code }`; o app monta o link (`?join=CÓDIGO`) como já faz com `deviceLinkUrl`.
- `POST /api/trainer/students/{id}/invite`: novo código para um aluno `invited` (substitui o anterior).
- `DELETE /api/trainer/students/{id}`: remove um aluno que nunca ativou (`invited`) e o convite dele.
  Aluno ativo ou desvinculado responde 400 (usar desvincular).
- `POST /api/trainer/students/{id}/unlink`: `status: 'unlinked'`, tira `trainerId` da conta, registra a data.

Resgate do convite (público, sem login, com limite de tentativas por endereço como `signup`):
- `GET /api/join/{code}`: `{ trainerName, studentName, shares }`, ou 404 igual para código errado, usado
  ou vencido. `shares` lista o que o personal poderá ver: treinos (obrigatório) e as opções de consentimento.
- `POST /api/join/{code}/password`, `/api/join/{code}/options`, `/api/join/{code}/verify`: criam a conta
  `role: 'student'`, `trainerId`, `id = studentId`, com o `consent` enviado, queimam o convite, marcam o
  registro `active` e abrem a sessão. Conferem de novo o convite no último instante, como o registro atual.

Aluno (exige sessão de aluno):
- `GET /api/student/trainer`: `{ trainer: { name } | null, since, consent }`.
- `PUT /api/student/consent` `{ measures, photos, diet }`: grava com a data. Treinos não são opcionais.
- `POST /api/student/unlink`: mesmo efeito de desvincular, pedido pelo aluno.

Dono (exige admin; ligar o modo e aprovar exigem o dono):
- `GET /api/admin/trainers`: personais `pending` e `approved`.
- `POST /api/admin/trainer/approve` `{ id }` e `POST /api/admin/trainer/reject` `{ id }` (apaga o pendente).
- `POST /api/admin/user/trainer` `{ id, on }`: liga ou desliga o modo personal numa conta existente. Ligar
  deixa `approved`. Desligar chama `detachStudentsOf` e remove o papel.

Efeitos em rotas existentes:
- Excluir ou desativar um personal desvincula os alunos dele (`detachStudentsOf`).
- Excluir a conta de um aluno marca o registro dele como `unlinked`.
- Contas de aluno e de personal usam os mesmos limites, sessões, passkeys e recuperação de hoje.

### 4.3 Auditoria

Eventos novos no registro de atividade, no formato dos existentes: `trainer.signup`, `trainer.approve`,
`trainer.reject`, `trainer.mode`, `student.invite`, `student.join`, `student.unlink`, `trainer.denied`.
Nunca gravam o código do convite.

## 5. Front-end

### 5.1 Lógica pura (`src/lib`, com teste ao lado)

`lib/roles.js`: `roleOf(user)`, `isTrainer`, `isPendingTrainer`, `isStudent`, `homeFor(user)` (rota inicial
por papel) e `tabsFor(user)` (abas por papel). Toda tela decide por aqui, para não espalhar `if (role)`.
`lib/student-link.js`: `joinLinkUrl(code)` e `joinTokenFromSearch`, no molde de `lib/device-link.js`
(o parâmetro `?join=` é lido e apagado da URL).

### 5.2 Telas

- **Entrada** (`views/Entry.jsx`, só com `trainer_mode` e sem sessão): "Sou aluno" e "Sou personal".
  Cada um leva ao login do papel e a "Esqueceu a senha?". O login em si é o de hoje; a escolha só decide
  o texto e para onde "Não tenho uma conta" aponta.
- **Aluno sem conta:** aviso "Apenas o personal cria contas. Fale com o seu professor."
- **Cadastro do personal** (`views/TrainerSignup.jsx`): nome, e-mail, senha ou passkey, telefone opcional.
  Termina em "Aguardando aprovação do dono".
- **Personal pendente** (`views/TrainerPending.jsx`): só essa tela e sair.
- **Resgate** (`views/Join.jsx`): lê `?join=`, mostra o nome do personal, o que ele poderá ver (treinos
  sempre; medidas, fotos e dieta com chave) e cria senha ou passkey. Código inválido mostra uma única
  mensagem, igual para errado, usado e vencido.
- **Lista de alunos** (`views/trainer/Students.jsx`): nome, estado (convite pendente, ativo, desvinculado),
  data. Ações: novo aluno, reenviar link, copiar e abrir no WhatsApp, remover convite, desvincular.
- **Perfil do personal:** as Configurações atuais (conta, passkeys, sair).
- **Meu personal** (`views/MyTrainer.jsx`, em Configurações do aluno): nome do personal, desde quando,
  as três chaves de consentimento e "Sair do vínculo".
- **Painel de admin:** secção "Personais" com pendentes (aprovar, recusar), aprovados e a chave "modo
  personal" na própria conta do dono.

### 5.3 Navegação

`TabBar` escolhe o conjunto por `tabsFor(user)`: o do aluno e o da conta sem papel continuam como hoje; o
do personal mostra Alunos e Perfil. O personal não passa pelo onboarding de treino. O personal usa a
versão web no PC; a mesma tela vale nos apps de Android e iPhone, que compartilham o código.

## 6. Erros e casos de borda

- Convite vencido, usado ou inexistente: mesma resposta 404 e mesma mensagem.
- Resgatar o mesmo convite duas vezes ao mesmo tempo: o segundo falha na conferência do último instante.
- Personal pendente chamando rota de personal: 403 `trainer-pending`, sem dados.
- Aluno desvinculado volta a ser conta individual com os próprios dados; um novo vínculo exige novo convite.
- Dono desligando o modo de um personal com alunos: os alunos são desvinculados, nada é apagado.
- Servidor sem `TRAINER_MODE`: as rotas de personal, aluno e `/api/join` não existem (404), como as rotas de
  senha com `PASSWORD_LOGIN` desligado.
- Perda de rede do aluno nunca afeta o treino: a etapa 1 não coloca nada na frente dele.

## 7. Testes

Servidor (`node --test`):
- Matriz de permissões: personal A não lê aluno do personal B; aluno não acessa outro aluno; personal
  pendente, desativado ou sem papel é negado; desvincular corta; negado e inexistente respondem igual.
- Convite: uso único, expira, substituir invalida o anterior, nunca grava o código, comparação em tempo
  constante, funciona com `INVITE_ONLY`, respeita o limite de tentativas.
- Cadastro de personal: nasce pendente; primeira conta do servidor vira dono; `as: 'student'` é recusado.
- Admin: aprovar, recusar (apaga), ligar e desligar o modo, `detachStudentsOf`.
- Com `TRAINER_MODE` desligado nada novo responde, e uma conta sem papel se comporta como antes.
- `openapi-routes.test.js` continua passando com as rotas novas.

Front-end (`vitest`): `roles.js` e `student-link.js` com testes puros; entrada, resgate, lista de alunos,
pendente e "Meu personal" por papel; `TabBar` por papel; strings nos 19 pacotes
(`check-locales.mjs` e `check-source-strings.mjs --strict`).

## 8. Fora desta etapa

Ficha prescrita, modelos e programas (2), financeiro (8), dieta e arquivos (9), avaliações (10), a projeção
filtrada que o personal enxerga (7) e as telas redesenhadas do aluno (3 a 6). Também fora: vários
personais com isolamento completo (o modelo já prevê, mas só um fluxo é testado) e treino do próprio
personal.

## 9. Riscos e questões em aberto

- **Cadastro aberto de personal.** Qualquer visitante pode criar uma conta pendente com `TRAINER_MODE`.
  Ela não acessa nada, mas ocupa uma linha em `db.json`. Mitigação: limite de tentativas por endereço,
  `INVITE_ONLY` como interruptor para fechar, e contas pendentes sem aprovação removidas depois de 30 dias,
  na mesma varredura que já limpa os convites vencidos.
- **Login por e-mail e senha** só existe com `PASSWORD_LOGIN=1`. Sem ele o personal e o aluno usam passkey.
  A entrada precisa dizer isso quando a senha estiver desligada.
- **Treino do próprio personal** no app: a barra dele não tem treino. Se ele quiser registrar os próprios
  treinos, é decisão para depois da etapa 2.
- **`INVITE_ONLY` e o cadastro do personal.** Com os dois ligados o personal precisa do código do admin e
  depois da aprovação. As respostas usam códigos distintos (`invite` e `trainer-pending`) para a tela
  dizer qual dos dois falta.
