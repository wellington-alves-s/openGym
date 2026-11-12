# Etapa 3b: Aba Avançado do Corpo

Data: 2026-11-11. Estado: para revisão. Segunda metade da etapa 3 da spec mestra
[2026-11-01-personal-aluno-design.md](2026-11-01-personal-aluno-design.md) (seções 7.1 e 10), sobre a 3a
([2026-11-09-etapa3a-corpo-design.md](2026-11-09-etapa3a-corpo-design.md)), já na `main`. Não depende das etapas de
personal.

## 1. Objetivo

A tela Corpo ganha a aba **Avançado**: o aluno registra dobras cutâneas e diâmetros ósseos no mesmo Registrar
de sempre e vê o percentual de gordura, a composição corporal e a faixa de peso ideal calculados. Sucesso: com
altura, sexo, nascimento, peso e as dobras de uma data, a aba mostra o % de gordura (Jackson e Pollock de 7 e de 3
dobras) e a composição; com os diâmetros, a composição avançada; quando falta algo, diz o que falta.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Protocolos de gordura | Jackson e Pollock de 7 dobras e de 3 dobras, com densidade corporal e conversão de Siri. Guedes e Faulkner ficam fora. |
| Composição | Dois modos: **simples** (gorda e magra) sempre que há % de gordura; **avançado** (gorda, óssea, residual, muscular) por Rocha e Würch, quando há também os diâmetros do punho e do fêmur. |
| Peso ideal | Faixa que leva o IMC de 18,5 a 24,9 para a altura. Sem sexo. |
| Onde ficam os dados | Dobras (mm) e diâmetros (cm) são **medidas novas** em `S.measurements`: herdam o registro único por data, a sincronização, o backup, o CSV e o gráfico por medida. Sem mapa novo. |
| Unidade | Fixa por campo: dobras em mm, diâmetros em cm. **Não** seguem o perfil em polegadas nem em libras. |
| Sexo e nascimento | `S.sex` e `S.birthDate`, configurações do perfil editadas no cartão Diagnóstico, ao lado da altura. Nada é obrigatório. |
| Fora | Guedes, Faulkner, gravar o % calculado em `bodyFat`, FC máxima (etapa 10), visão do personal (etapa 7). |

## 3. Dados

### 3.1 Perfil

- `S.sex`: `'m'`, `'f'` ou `null`.
- `S.birthDate`: `'AAAA-MM-DD'` ou `null`. Válida é uma data real, não futura, de 1900 em diante.

São configurações como `heightCm` (3a): padrão em `DEF`, sincronizam por campo com o carimbo próprio de cada
configuração, e o perfil de um backup antigo abre sem elas. A idade numa data é em anos completos entre
`birthDate` e essa data.

### 3.2 Campos de medida novos

Entram em `MEASUREMENT_FIELDS` (`lib/measurements.js`), todos `optional` (desligados por padrão), com uma
**unidade fixa** e uma faixa válida própria.

| Grupo | Chave | Rótulo | Unidade | Faixa |
|---|---|---|---|---|
| Skinfolds | `skChest` | Chest skinfold | mm | 1 a 80 |
| Skinfolds | `skMidaxillary` | Midaxillary skinfold | mm | 1 a 80 |
| Skinfolds | `skTriceps` | Triceps skinfold | mm | 1 a 80 |
| Skinfolds | `skSubscapular` | Subscapular skinfold | mm | 1 a 80 |
| Skinfolds | `skAbdominal` | Abdominal skinfold | mm | 1 a 80 |
| Skinfolds | `skSuprailiac` | Suprailiac skinfold | mm | 1 a 80 |
| Skinfolds | `skThigh` | Thigh skinfold | mm | 1 a 80 |
| Skinfolds | `skBiceps` | Biceps skinfold | mm | 1 a 80 |
| Skinfolds | `skCalf` | Medial calf skinfold | mm | 1 a 80 |
| Bones | `bnHumerus` | Humerus diameter | cm | 2 a 20 |
| Bones | `bnWrist` | Wrist diameter | cm | 2 a 20 |
| Bones | `bnFemur` | Femur diameter | cm | 2 a 20 |
| Bones | `bnAnkle` | Ankle diameter | cm | 2 a 20 |

Armazenamento canônico: a própria unidade fixa, com uma casa decimal, como as outras medidas. Valor fora da faixa
é nulo na normalização e recusado no Registrar (seção 6). O que muda no código que hoje trata só `bodyFat` como
caso especial:

- `measurementUnit(unit, field)`: um campo embutido com unidade fixa devolve essa unidade, seja qual for o perfil;
  `toMeasurementDisplay` e `fromMeasurementDisplay` não convertem esses campos.
- `normalizeMeasurementEntry` e `measurementValue`: validam pela faixa do campo (hoje só `bodyFat` é percentual).
- `builtinCsvColumn`: as dobras viram `sk_chest_mm` e assim por diante, os diâmetros `bn_wrist_cm`; a importação
  lê essas colunas de volta pelo mesmo mapa (`import-csv.js`).
- Os grupos novos aparecem sozinhos em "Escolher medidas" (`manageMeasurementsSheet` agrupa por `group`).
- O plano confere os demais leitores de `MEASUREMENT_FIELDS` (`export-csv.js`, `demoSeed.js`, `mcp/src/labels.js`).

## 4. Funções puras (`frontend/src/lib`)

Cada uma com teste ao lado. Entradas em kg e cm; a tela converte para a unidade do perfil.

- `body-fat.js`:
  - `skinfoldSum(m, keys)` → soma em mm ou `null` se faltar alguma dobra.
  - `jacksonPollock7(sum, age, sex)` → densidade corporal. Homem: `1,112 − 0,00043499 S + 0,00000055 S² − 0,00028826 idade`.
    Mulher: `1,097 − 0,00046971 S + 0,00000056 S² − 0,00012828 idade`. `S` é a soma de peitoral, axilar média,
    tríceps, subescapular, abdominal, supra-ilíaca e coxa.
  - `jacksonPollock3(sum, age, sex)` → densidade. Homem (peitoral, abdominal, coxa):
    `1,10938 − 0,0008267 S + 0,0000016 S² − 0,0002574 idade`. Mulher (tríceps, supra-ilíaca, coxa):
    `1,0994921 − 0,0009929 S + 0,0000023 S² − 0,0001392 idade`.
  - `siri(density)` → `(4,95 / D − 4,50) × 100`, uma casa; `null` se não for número ou ficar fora de 0 a 70.
  - `bodyFatOf(m, { age, sex })` → `{ jp7, jp3 }`, cada um um número ou `null`.
- `body-composition.js`:
  - `simpleComposition(weightKg, fatPct)` → `{ fat, lean }` em kg.
  - `rochaBone(heightCm, wristCm, femurCm)` → kg: `3,02 × (H² × R × F × 400)^0,712`, com `H`, `R` e `F` em metros.
  - `advancedComposition(weightKg, fatPct, { heightCm, wristCm, femurCm, sex })` → `{ fat, bone, residual, muscle }`.
    Residual por Würch: 24,1% do peso nos homens, 20,9% nas mulheres. Muscular é o que sobra:
    `peso − gorda − óssea − residual`; se der negativo, `null`.
- `ideal-weight.js`: `idealWeightRange(heightCm)` → `{ minKg, maxKg }` com `18,5 × h²` e `24,9 × h²`, `h` em metros,
  uma casa; `null` sem altura válida (usa `normalizeHeightCm` de `bmi.js`).
- `body-assessment.js`: `assessmentOf(S, d)` → `{ d, age, sex, weightKg, fat: { jp7, jp3 }, simple, advanced, ideal, missing }`
  - `missing` lista motivos em texto fixo: `needs-sex`, `needs-age`, `needs-height`, `needs-weight`, `needs-skinfolds`,
    `needs-bones`, `age-out-of-range`.
  - O peso é o da pesagem do próprio dia ou, senão, a mais recente até essa data (na unidade do perfil,
    convertido para kg como `bmiOf`).
  - Jackson e Pollock valem de 18 a 61 anos; fora disso `fat` fica nulo e `missing` traz `age-out-of-range`.
  - O % de gordura da composição vem de `jp7` quando existe, senão de `jp3`.
- `assessmentSeries(S)` → um ponto por data que tem pelo menos um protocolo calculável, `{ d, jp7, jp3 }`, para o
  gráfico.

## 5. Interface

### 5.1 Aba Avançado (`views/Body.jsx`, `?tab=advanced`)

Terceira aba do `Segmented`, depois de Peso e Medidas. De cima para baixo, para a **data mais recente com algum
resultado** (ou, sem nenhuma, só os estados vazios):

1. **Cartão de gordura:** dois valores lado a lado, "Jackson e Pollock 7 dobras" e "3 dobras", em %, com a data.
   Abaixo, o gráfico do % de gordura por data (`LineChart`) com as duas séries.
2. **Cartão de composição:** o modo simples (massa gorda e magra, em kg ou lb do perfil) e, quando há punho e
   fêmur, o avançado (gorda, óssea, residual, muscular), cada parte com o valor e a porcentagem do peso.
3. **Cartão de peso ideal:** a faixa em kg ou lb e onde o peso atual está em relação a ela. Só precisa da altura.
4. **Falta algo:** uma linha por motivo de `missing`, com o que fazer ("Informe seu sexo no cartão Diagnóstico",
   "Registre as dobras em Medidas"...). O botão **Ligar dobras e diâmetros** (só quando algum dos 13 campos está
   desligado) liga todos de uma vez em `measurementEnabled`.

Sem nenhum dado, a aba mostra o convite e esse botão; nenhuma parte quebra sem altura, sexo, nascimento, peso ou
dobras.

### 5.2 Cartão Diagnóstico

Mantém a altura e o IMC da 3a. Ganha **Sexo** (Masculino ou Feminino, escolha dos dois botões) e **Data de
nascimento** (campo de data), com o mesmo padrão de editar, Salvar e Cancelar da altura: salvar sem mudança não
grava, valor inválido recusa com toast e não grava. Aparece nas abas Peso e Avançado, como a altura hoje.

### 5.3 Registrar

Nada muda no formulário: as dobras e os diâmetros ligados aparecem como os grupos "Skinfolds" e "Bones" dentro de
"Medidas", com a unidade fixa ao lado do campo. Só as chaves tocadas vão para `applyCheckin` (regra da 3a).

### 5.4 Rotas

`/body?tab=advanced` abre a aba. Nenhuma rota nova.

## 6. Erros e bordas

- Dobra ou diâmetro fora da faixa: o Registrar recusa com a razão `range` e o campo, sem gravar nada; o toast diz
  "{0} must be between {1} and {2}". A normalização anula o valor de um backup fora da faixa, sem derrubar o dia.
- Perfil em libras: dobras e diâmetros continuam em mm e cm; peso e composição aparecem em lb.
- Idade fora de 18 a 61: não calcula gordura e explica. Data de nascimento depois da data do registro: idade
  inválida, mesmo motivo `needs-age`.
- Soma de dobras que dá % fora de 0 a 70: o protocolo fica nulo para aquela data.
- Só algumas dobras: cada protocolo exige o seu conjunto inteiro; o outro pode calcular sozinho.
- Duas pessoas de aparelhos diferentes: dobras e diâmetros seguem a mescla das medidas de hoje; sexo e nascimento
  seguem o carimbo de cada configuração.
- Backup antigo sem `sex`, `birthDate` nem campos novos: abre normal.
- Aviso curto no cartão de gordura: as fórmulas são estimativas para adultos de 18 a 61 anos e dependem da técnica
  de medição.

## 7. Testes

- `lib`: `body-fat.test.js` (vetores conhecidos: homem de 30 anos com soma de 7 dobras = 100 mm dá cerca de 14,6%;
  com soma de 3 dobras = 60 mm dá cerca de 18,0%; mulher; bordas de idade 18 e 61; entradas inválidas; `siri` fora
  de faixa), `body-composition.test.js` (simples, Rocha com altura 175, punho 5,6 e fêmur 9,5 dá cerca de 11,5 kg,
  Würch por sexo, muscular negativa), `ideal-weight.test.js` (175 cm dá 56,7 a 76,3 kg), `body-assessment.test.js`
  (cada motivo de `missing`, peso do dia versus anterior, lb convertido, série).
- Medidas: `measurements.test.js` e `body-checkin.test.js` para a unidade fixa (não converte em perfil `in`), a
  faixa por campo e a recusa `range`; `export-csv.test.js` e `import-csv` para as colunas `_mm` e `_cm` de ida e
  volta; backup antigo sem os campos.
- Sincronização: `sex` e `birthDate` por carimbo de configuração, como `heightCm`.
- Telas: `Body.test.jsx` (aba Avançado vazia, com dados, motivos que faltam, botão Ligar, sexo e nascimento no
  Diagnóstico, salvar sem mudança não grava), `BodyCheckinSheet.test.jsx` (grupos novos, unidade fixa em perfil
  `lb`, faixa).
- Textos novos nos 19 pacotes de idioma (pt-PT em `pt.js`, pt-BR em `PT_BR_OVERRIDES`, traduzido nos demais, sem
  travessão). Os checks de CI (`check-locales`, `check-source-strings --strict`, auditoria de testes) passam.

## 8. Fora do escopo

Guedes e Faulkner. Gravar o % calculado no campo `bodyFat` manual. FC máxima e VO2máx (etapa 10). Visão do personal
em leitura (etapa 7). Rótulo de ângulo nas fotos. Dobras com várias medições por ponto (média de duas ou três).
