# Estrutura do projeto openGym

Mapa de todas as pastas e dos arquivos que importam. Os números vêm de `git ls-files` (21.211 arquivos
versionados). Para os diagramas de arquitetura, veja [ARCHITECTURE.md](ARCHITECTURE.md); para as regras
de trabalho, [../CLAUDE.md](../CLAUDE.md) e [../CONTRIBUTING.md](../CONTRIBUTING.md).

O openGym é um app auto-hospedado de treino e peso corporal. São dois containers (`api` e `web`) mais uma
pasta `./data` que pertence ao usuário. O mesmo front-end vira PWA e apps Capacitor (Android e iPhone,
com Apple Watch e widgets).

## Visão geral

| Pasta | Arquivos | O que é |
|---|---|---|
| `catalogue/` | 19.693 | Banco de exercícios: 6.554 JSONs, traduções e a mídia licenciada |
| `frontend/` | 1.187 | App React 19 + Vite, mais os shells Android e iOS (Capacitor) |
| `api/` | 151 | Backend `node:http`, mais o Coach de IA e os testes |
| `scripts/` | 30 | Build, CI e release |
| `docs/` | 27 | Guias de uso, de deploy e notas de design |
| `website/` | 22 | Site opengym.ch em HTML/CSS/JS puro |
| `mcp/` | 17 | Servidor MCP opcional (stdio) |
| `helm/` | 16 | Chart Helm |
| `.github/` | 16 | Workflows de CI, templates de issue e PR |
| `assets/` | 14 | Banner, badges e screenshots do README |
| `contrib/nix/` | 8 | Pacotes e flake Nix |
| `kubernetes/` | 6 | Manifestos para kustomize |
| `.gitlab/` | 4 | Templates de issue e MR do espelho GitLab |
| `web/` | 3 | Dockerfile do front + nginx |
| raiz | 17 | Arquivos de projeto (lista abaixo) |

Pastas locais, não versionadas: `data/` (runtime), `coach-auth/` (vazia), `.idea/`, `.vscode/`.

## Raiz

| Arquivo | Função |
|---|---|
| `README.md`, `ROADMAP.md`, `CHANGELOG.md` | Apresentação, marcos futuros, histórico (escrito na hora do release) |
| `CLAUDE.md` | Guia para o Claude Code neste repo |
| `CONTRIBUTING.md`, `CLA.md`, `SECURITY.md` | Regras de contribuição, acordo de licença do contribuidor, política de segurança |
| `LICENSE`, `NOTICE.md` | AGPL-3.0-or-later; avisos, incluindo a licença separada da mídia dos exercícios |
| `docker-compose.yml`, `.env.example` | Stack local (`api` + `web`) e variáveis de ambiente |
| `.dockerignore`, `.gitignore` | Exclusões |
| `.gitlab-ci.yml` | Pipeline do espelho GitLab |
| `package.json`, `package-lock.json` | Só `js-yaml`, usado pelos scripts de checagem |
| `renovate.json` | Atualização automática de dependências |

## `frontend/` (React 19 + Vite)

Arquivos da raiz: `index.html`, `vite.config.js`, `capacitor.config.json`, `package.json`.

### `frontend/src/`

| Caminho | Conteúdo |
|---|---|
| `main.jsx`, `App.jsx` | Entrada e roteamento (`react-router-dom`) |
| `sheets.jsx` | Os bottom sheets (seletor de exercício, config, detalhe do treino, importação de plano...). Tem cerca de 3.800 linhas; sheets novos vão para `components/` |
| `index.css`, `coach.css`, `admin.css` | Estilos globais |
| `store/` | `useStore.js` (Zustand, estado persistido em `localStorage` `gym_state_v1`, sincronizado com o servidor) e `useUI.js` (estado efêmero: modais, sheet ativo, timer de descanso) |
| `views/` | Uma tela por arquivo (lista abaixo) |
| `components/` | UI compartilhada: gráficos, modais, timers, mídia, mapa corporal |
| `lib/` | Lógica de domínio pura, sem framework, cada arquivo com `*.test.js` ao lado (lista abaixo) |
| `locales/` | 19 idiomas (`ar bn de es fr hi hu it ko pl pt pt-BR ru sv th tr uk zh zh-TW`), chaveados pela string em inglês |
| `exercise-names/`, `exercise-desc/`, `instr/` | Nomes, descrições e instruções dos exercícios por idioma. **Gerados** de `catalogue/`, não edite |
| `seasonal/` | Temas sazonais |

Os testes ficam ao lado do código (`*.test.js`, `*.test.jsx`); `src/` tem 848 arquivos, a maioria testes.
`test-setup.js` configura o vitest.

**Telas (`views/`)**: `Home`, `Workout`, `Plan`, `RoutineEdit`, `History`, `Stats`, `Muscles`,
`StructuralBalance`, `Library`, `CheckIn`, `Measurements`, `ProgressPhotos`, `Settings`, `WatchSettings`,
`GymReminder`, `Login`, `MobileOnboarding`, `PermissionSteps`, `FocusView`, `CoachChat`, `CoachIntake`,
`CoachSetup`, `Admin`, `AdminCoach`. O modo personal tem as suas em `views/trainer/` (`Students`,
`StudentDetail`, `PrescriptionPlan`, `PrescriptionWorkspace`, `ProgramView`, `Models`, `ModelWorkspace`).

**Componentes (`components/`)**, por tema:
- Gráficos e corpo: `LineChart`, `Heatmap`, `BodyMap`, `MiniBodyMap`, `MuscleExplorer`, `SessionMuscles`, `WeightRate`
- Treino: `RestTimer`, `TimerFlash`, `Elapsed`, `Stepper`, `DurationWheel`, `WorkoutChips`, `WorkoutMedia`, `WorkoutThumb`, `WorkoutScrollAnchor`, `WorkoutSettingsSheet`, `QueueRow`
- Gestos e navegação: `SwipeCards`, `SwipeRow`, `TabBar`
- Conta e sincronização: `Passkeys`, `PasswordAuth`, `LostAccess`, `DeleteAccount`, `ServerSync`, `SyncBanner`, `BackupFolderRow`, `PrescriptionSync`
- Modo personal: `PublishSheet`, `VersionsSheet`, `ProgramCard` (o mês e o andamento, para o aluno), `ModelPickerSheet`, `SaveModelSheet`
- Mídia e câmera: `Media`, `Animations`, `CustomMedia`, `CustomMediaField`, `CameraScan`, `QrCanvas`
- Coach e exportação: `ChatInput`, `CoachConsentSheet`, `CsvExportSheet`, `ReportSheet`
- Base: `ui.jsx`, `Icon`, `Modals`, `Toast`, `ErrorBoundary`, `Seasonal`, `AppIconRow`, `ExerciseAliases`, `ExerciseViewToggle`

**Lógica (`lib/`)**, por tema (431 arquivos contando testes):
- Progressão e força: `progression`, `onerm`, `pyramid`, `backoff`, `rep-range`, `effort`, `plates`, `relative-strength`, `rotation`
- Treino em andamento: `workout-model`, `supersetFlow`, `superset-meta`, `finish-workout`, `finish-compare`, `session-*`, `workout-*`, `per-set`, `queue`
- Recuperação e equilíbrio: `recovery`, `recovery-view`, `structuralBalance*`, `muscles`, `exercise-muscle-*`
- Exercícios: `exercises`, `exercises-data` (gerado), `exercise-*`, `similar-exercises`, `equipment`, `favourites`
- Corpo: `measurements`, `bodyweight`, `day-photos`, `exif-date`
- Sincronização: `api` (único ponto que fala com o backend), `sync-merge`, `sync-changes`, `sync-legacy`, `remote`, `device-link`, `device-auth`
- Treino prescrito (modo personal): `prescription` (aplica a ficha publicada como rotinas `rx-` somente leitura), `prescription-sync` (decide quando buscar), `workspace` (o store que o editor de rotinas usa, para o personal editar o rascunho do aluno), `program` (qual fase e semana do programa vale hoje, função pura), `prescription-cache` (o último programa baixado, no aparelho do aluno, para o mês virar sem rede), `draft-session` (a sessão de rascunho dos editores do personal, para um programa ou um modelo), `trainer-api`
- Pontes nativas: `mobile`, `channel`, `capacitor-fetch`, `watch-sync`, `widgets`, `live-activity`, `health-sync`, `health-read`, `health-connect`, `gym-reminder`, `rest-alert`, `push`, `anim-quality`, `anim-packs`
- Coach: `coach`, `coach-api`, `coach-local`, `coach-context`, `coach-insights`, `coach-schedule`, `coach-secrets`, `coach-consent`
- Importar e exportar: `import-csv`, `import-hevy`, `export-csv`, `fit-export`, `plan-share`, `zip`, `report`, `report-print`, `print-doc`
- Mídia: `media-*`, `backup-media`
- i18n e tema: `i18n`, `i18n-core`, `catalogue-langs`, `accent`, `app-icon*`, `seasonal`
- Hooks: `use-*.js`

### `frontend/public/`
`manifest.json` e `sw.js` (PWA), `icon-180.png`, `icon-512.png`, `app-icons/` (variantes do ícone).

### `frontend/resources/`
`icon.svg` e `icons/` com as fontes SVG das variantes de ícone.

### `frontend/scripts/`
Verificações e ferramentas: `check-locales.mjs`, `check-source-strings.mjs`, `check-bundle-syntax.mjs`,
`check-mobile-bundle.mjs`, `bundle-size.mjs`, `fatigue-monotonic-probe.mjs`, `app-icons.mjs`,
`sw-stamp.mjs`, `pt-br-inheritance-fingerprint.mjs`, `pdf/` (renderiza e confere o PDF do relatório).

### `frontend/android/` (shell Capacitor)
Gradle (`build.gradle`, `settings.gradle`, `variables.gradle`, `gradlew`). Em `app/src/`:
`main` (35 classes Java/Kotlin: `MainActivity`, serviço do timer de descanso, lembrete de treino, plugins
de backup, Health Connect, impressão, scan), `sideload` e `play` (as duas variantes de distribuição),
`debug`, `test` e `testSideload`.

### `frontend/ios/` (shell Capacitor + apps Apple)
`App/` com o `Podfile`, `App.xcodeproj`, `App.xcworkspace` e os alvos:
`App` (o app), `Watch` e `WatchCore` (Apple Watch), `WatchWidgets` e `OpenGymWidgets` (widgets),
`GymReminderCore`, `AnimationPacksDownloader` (baixa os pacotes de animação), `AppUITests`.
`ci/` tem os scripts Ruby/Node que montam o projeto Xcode (`add-watch-app.rb`, `add-widgets.rb`...).

## `api/` (backend)

| Caminho | Função |
|---|---|
| `server.js` | Servidor `node:http`; as rotas ficam num objeto `routes` com chaves `'METHOD /path'` (cerca de 3.100 linhas) |
| `openapi.yaml` | Documenta toda rota; um teste compara com `routes` |
| `durable.js` | Escrita temp-depois-rename |
| `passkeys-store.js`, `password.js`, `recover.js`, `device-link.js`, `verify-error.js` | Autenticação (WebAuthn, senha opcional, recuperação, pareamento de celular) |
| `trainer-routes.js`, `trainer-access.js`, `trainer-store.js`, `student-invite.js` | Modo personal (`TRAINER_MODE`, desligado por padrão): rotas de personal e alunos, permissões, registros dos alunos em `DATA_DIR/trainers/` e convites de uso único |
| `rx.js` | A ficha prescrita de um aluno (rascunho mais versões numeradas, cada uma um programa: data de início e fases, um mês cada; lê também as fichas da etapa 2a), funções puras; o arquivo fica em `DATA_DIR/trainers/` via `trainer-store.js`, que guarda também os modelos do personal em `profile.json` |
| `sync-stamps.js` | Cópia manual de `lib/sync-merge.js` (há teste de paridade) |
| `media.js` | Fotos e vídeos de exercícios próprios em `DATA_DIR/uploads` |
| `push-messages.js`, `nudge.js`, `nudge-copy.js`, `queue.js` | Web Push e lembretes (`nudge.js` e `queue.js` espelham o front) |
| `rate-limit.js`, `admin-socket.js` | Limite de requisições e socket de administração |
| `coach/` | Coach de IA opcional (abaixo) |
| `scripts/` | `build-nudge-copy.mjs`, `check-core-loadable.mjs` |
| `test/` | 88 arquivos, `node --test` |
| `Dockerfile`, `package.json` | Três dependências: `@simplewebauthn/server`, `undici`, `web-push` (mais o SDK do Claude como opcional) |

**`api/coach/`**: `routes.js`, `jobs.js`, `config.js`, `cadence.js`, `cohort.js`, `handle.js`, `warmup.js`;
`adapters/` (`claude`, `codex`, `spawn`: rodam o CLI do provedor); `prompts/` (`ask`, `common`, `create`,
`debrief`, `refine`, `repair`, `review`); `core/` é compartilhado com os celulares e tem o pipeline,
`schemas`, `validate`, `parse`, `prompts`, `providers` e `core/adapters/` (`anthropic`, `openai`,
`gemini`, `compatible`, `http`).

## `catalogue/` (banco de exercícios)

| Caminho | Conteúdo |
|---|---|
| `exercises/<id>.json` | 6.554 exercícios, um arquivo cada |
| `i18n/<idioma>.json` | Traduções (17 idiomas) |
| `media/still/` e `media/clip/` | 6.554 imagens e 6.554 clipes, **180 px**, licenciados à parte (`media/NOTICE.md`) |
| `browse/` | Páginas por grupo muscular (`chest.md`, `back.md`, `cardio.md`...) |
| `README.md` | Formato do catálogo |

Regra de licença: só arquivos de 180 px podem entrar no repositório, no CI, na imagem web ou num servidor
próprio. Nunca adicione mídia maior nem mande a mídia para ferramentas de IA. `scripts/catalogue/check-media.mjs` aplica a regra.

## `scripts/`

| Caminho | Função |
|---|---|
| `catalogue/` | `build.mjs` (gera `exercises-data.js`, `instr/`, nomes e descrições no front), `validate.mjs`, `check-media.mjs`, `stage-media.mjs`, `import-*.mjs`, `migration-check.mjs` |
| `ci/` | `release-check`, `test-audit`, `test-areas`, `test-report`, `deps-audit`, `node-test-reporter`, `fork-mr-pipelines.py` |
| `android/` | `build-release.sh`, `make-asset-packs.mjs`, scripts de emulador para o lembrete |
| `ios/` | `finish-ipa.sh` |
| `media/` | Geração de WebP, mídia e manifestos de pacotes |
| raiz | `build-api-docs.mjs`, `build-coach-assets.mjs`, `build-coach-library.mjs`, `build-hevy-id-map.mjs`, `de-name-rules.mjs` |

Índice em `scripts/README.md`.

## `web/`
`Dockerfile` (multi-stage: compila o front, copia `catalogue/media` para `/exercise-media/`, serve com
nginx), `nginx.conf.template` (renderizado a partir de `NGINX_PORT`, `BACKEND`, `PORT`) e
`05-check-base-path.sh`. O nginx serve o app e faz proxy de `/api` para a `api`, na mesma origem
(exigência dos passkeys).

## `mcp/` (servidor MCP opcional, fora do build Docker)
`src/index.js` (entrada), `state.js` (lê e deriva os dados de `DATA_DIR`), `tools.js` (ferramentas de
leitura, schemas zod), `labels.js`, `write-tools.js` (`log_workout`, a única de escrita) e
`api-client.js` (grava via `PUT /api/data` com token de sessão pareada). `scripts/pair.mjs` faz o
pareamento. Testes em `test/`. Detalhes em `mcp/README.md`.

## Deploy e empacotamento
- `docker-compose.yml`: o jeito padrão.
- `helm/`: `Chart.yaml`, `values.yaml` e `templates/` (deployment, service, ingress, httproute, pvc, secret, configmap, certificate, serviceaccount, teste de conexão).
- `kubernetes/`: manifestos com `kustomization.yaml`.
- `contrib/nix/`: `flake.nix`, `default.nix`, `api.nix`, `frontend.nix`, `mcp.nix`, `opengym.nix`, `tests.nix`.

## `docs/`
Guias (índice em `README.md`): `SELF_HOSTING*.md` (geral, HTTPS, Kubernetes, Mac), `API.md`, `MOBILE.md`,
`APP_STORES.md`, `AI_COACH.md`, `DATA_IMPORTS.md`, `NIX.md`, `FAQ.md`, `ARCHITECTURE.md`.
`dev/` guarda notas de design (`COMBINE_ROUTINES`, `FATIGUE_SETS_MODEL`, `LIST_VIEW`, `SET_TYPES`).
`diagrams/` tem os fontes Mermaid (`.mmd`) e os PNGs claros e escuros.

## CI e repositórios
- `.github/workflows/`: `test.yml` (gate dos PRs), `ios.yml` (compila o app iPhone num Mac), `docker-publish.yml`, `pages.yml`, `release-check.yml`, `audit.yml`, `cla.yml`, `cla-issue.yml`, `mirror.yml` (espelha `main` e tags `v*` no GitLab, só fast-forward).
- `.github/` também tem `ISSUE_TEMPLATE/`, `pull_request_template.md`, `dependabot.yml`, `FUNDING.yml`.
- Pacotes de release (APK, bundle do Play, IPA) são feitos e assinados na máquina de release, nunca no CI.

## `website/` e `assets/`
`website/`: `index.html`, `about.html`, `docs.html`, `api.html`, `privacy.html`, `styles.css`, `site.js`,
`llms.txt`, `sitemap.xml`, ícones, e redirecionadores em `go/` (`android`, `ios`, `survey`). Publicado
separadamente. `assets/`: banner, imagem social, badges e screenshots usados no README.

## `data/` (runtime, não versionado)
Criada pelo servidor e dona do usuário: `db.json` (usuários, credenciais, inscrições push, convites),
`state-<uid>.json` (um por usuário), `secret` (chave HMAC da sessão), `vapid.json` (chaves Web Push),
`audit.log`, `uploads/`. Contém segredos: nunca commite.

## Código que existe em duas cópias (mudar os dois lados)
`lib/sync-merge.js` e `api/sync-stamps.js`; `lib/glyphs.js` e `api/coach/core/glyphs.js`;
`lib/nudge.js` e `api/nudge.js`; `lib/queue.js` e `api/queue.js`. A imagem da API não importa o front.
