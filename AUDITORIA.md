# Auditoria completa — InsightsCirurgic (clinicaltestevs)

Data: 2026-10-20 · Commit auditado: `06f9e34` · Escopo: migrations/RLS, edge functions, frontend (páginas, hooks, libs, workbench 2D/3D), dependências, CI/build.

**Limites desta auditoria.** Somente leitura. Não foi possível consultar o banco de produção: o Supabase conectado à sessão (`uozxeg…`, "Ashby") não é o do app (`kekxxy…`). Tudo sobre RLS/policies vem das migrations, que **divergem do banco real** (ver S-8). O que não foi confirmado por leitura está marcado como *suspeita*. Nada foi executado em ambiente real (as edge functions nunca foram type-checadas contra o SDK).

Verificado por execução: `tsc` passa; `vite build` passa (bundle único de 2,9 MB / 851 KB gzip); `eslint` = 109 erros + 15 avisos (103× `no-explicit-any`, 1× `rules-of-hooks`); `npm audit --omit=dev` = 29 vulnerabilidades (2 críticas, 22 altas); **não existe nenhum teste automatizado**.

---

## 1. Resumo executivo

O sistema tem uma base de segurança razoável (RLS por caso, buckets privados, autenticação e cota nas edge functions — corrigidos nos sprints anteriores). Os maiores riscos hoje **não estão no banco, estão no uso clínico e na conformidade**:

1. **Números que podem enganar o cirurgião**: calibração px→mm global e persistida; edição de uma foto que "vaza" para outra; simetria que dá 100% quando não há dados; profundidade com erro de proporção e texto que afirma mais do que o método sustenta.
2. **LGPD / dados de saúde**: consentimento nunca é exigido antes de enviar a face a terceiros (Gemini, Meshy); nenhuma auditoria é gravada; exclusão de caso deixa fotos no storage; "Sair" não faz logout.
3. **Perda silenciosa de dados**: autosave descarta edições; saída da página sem aviso; cadastro de caso reporta sucesso mesmo com upload falho.
4. **Qualidade de engenharia**: zero testes, TypeScript `strict: false`, schema de banco não reproduzível pelas migrations, dependências com CVEs.

## 2. Achados

Severidade: **C** crítico · **A** alto · **M** médio · **B** baixo.

### 2.1 Segurança e acesso

| # | Sev | Achado | Onde |
|---|---|---|---|
| S-1 | C | **"Sair" não encerra a sessão.** É um `<Link to="/login">` sem `signOut`; `/login` redireciona para `/dashboard` se há sessão. Em notebook compartilhado de consultório a sessão fica aberta indefinidamente (também sem timeout de inatividade). | `TopBar.tsx:384`, `App.tsx:59` |
| S-2 | A | **`audit_logs` e `notifications` aceitam INSERT `WITH CHECK (true)` e a policy não tem `TO authenticated`** → vale também para o papel `anon`, cuja chave está no bundle. Qualquer pessoa pode forjar entradas de auditoria (com `user_id`/`case_id` arbitrários) e notificações para qualquer usuário. *Confirmar em `pg_policies` de produção.* | migrations `20251213…`, `20251230114924…` |
| S-3 | A | **Auto-cadastro só foi removido da UI.** `config.toml` não define `enable_signup=false`; com a chave anon pública, `auth.signUp()` via API pode seguir aberto. Cada conta nova ganha cota própria de IA, lê todos os `profiles` e pode poluir `audit_logs`/`notifications`. Desativar em Authentication → Providers/Settings. | `Login.tsx:16` (comentário), `config.toml` |
| S-4 | A | **`recommend-mesh-density` faz `fetch(imageUrl)` de URL arbitrária enviada pelo cliente** (SSRF: sem allowlist, sem timeout, sem limite de tamanho; lê o corpo inteiro e converte para base64). | `recommend-mesh-density/index.ts` (bloco `imageUrl`) |
| S-5 | M | **Cota não é atômica** (lê N linhas, depois insere): requisições paralelas passam todas. `generate-3d-model` (ação de criar, paga) **não tem cota** nenhuma. `ai_usage` cresce sem limpeza. | `_shared/quota.ts`, `generate-3d-model` |
| S-6 | M | **`task_id` da Meshy não é amarrado ao caso no servidor.** Quem conhecer um `task_id` e tiver acesso a *qualquer* caso próprio obtém as URLs/o modelo de outra tarefa (`status` e `finalize`). Registrar `task_id↔case_id` na criação e validar. | `generate-3d-model` |
| S-7 | M | `profiles` legível por todo autenticado (inclui `crm`, `specialty`). Erros de fornecedores (mensagem crua da Meshy, `error.message`) são devolvidos ao cliente. `ALLOWED_ORIGINS` ausente → `*`. Admin lê qualquer caso sem registro e sem aviso visual. | migrations, `cors.ts`, `Workbench.tsx:332` |
| S-8 | A | **Migrations não reproduzem o banco.** Duas migrations "completas" (`20251213…` e `20251230114924…`) criam os mesmos tipos/tabelas com esquemas diferentes (`profiles`: first/last_name vs full_name; `audit_logs`: description/metadata vs details); `20251214…` referencia tabela criada só depois. Um `db reset` falha, e `types.ts` (banco real) não bate com nenhuma. Policies "frouxas" antigas (`facial_analysis_jobs` com `USING (true)`, SELECT/UPDATE para todo autenticado) podem ainda existir em produção. Gerar baseline do banco real e arquivar as antigas. | `supabase/migrations/` |
| S-9 | M | `facial_analyses.upsert(onConflict:'photo_id')` exige UNIQUE inexistente nas migrations (*suspeita*: erro 42P10); autosave faz select+insert sem constraint → duplicatas e `maybeSingle()` retornando null. | `useMediaPipeMesh.ts:92`, `useMeshAutoSave.ts:256` |
| S-10 | M | `.env` versionado (só contém chave pública/URL — sem segredo, mas não deveria estar no git); sem cabeçalhos de segurança/CSP (hospedagem não definida no repo); WASM/modelo MediaPipe com fallback para jsdelivr/googleapis sem SRI; Google Fonts e HDR do `Environment` via CDN (falha em rede de clínica restrita). | `.env`, `index.html`, `faceLandmarker.ts`, `PatientModelViewer.tsx` |

### 2.2 Privacidade e conformidade (LGPD / regulatório)

| # | Sev | Achado | Onde |
|---|---|---|---|
| P-1 | C | **Consentimento nunca é verificado antes de enviar foto a IA/Meshy.** `consent_registered` só é lido, nunca testado. Desmarcar no edit ou adicionar foto pelo Workbench não bloqueia nada. | `Workbench.tsx:415, 636`, `useFacialAnalysis.ts:86`, `useMeshy3D.ts:191`, `useMeshRecommendation.ts:54` |
| P-2 | C | **Nenhuma auditoria é gravada.** Zero chamadas a `log_audit`/`audit_logs` no app: abrir caso (inclusive admin em caso alheio), exportar, excluir, enviar à IA, mudar consentimento não deixam rastro — embora o produto prometa "auditoria básica". Pior: `audit_logs.case_id` é `ON DELETE CASCADE` (a trilha some com o caso). | todo o `src/`, migrations |
| P-3 | C | **Exclusão de caso não apaga storage** (fotos e modelos 3D ficam órfãos) → não atende ao direito de apagamento. "Remover foto" no CaseForm só limpa o estado. | `CaseList.tsx:166`, `CaseForm.tsx:633` |
| P-4 | A | Face inteira em base64 (resolução original) e URL assinada (1 h) enviadas a terceiros; **`notes` (texto clínico livre) vai à IA**. Sem aviso/confirmação ao usuário. | `useFacialAnalysis.ts:63`, `useMeshRecommendation.ts` |
| P-5 | A | Nada impede nome real em `codename`/`notes`; o codename vai para marca d'água do PNG, nome de arquivo e PDF. | `CaseForm.tsx:393`, `exportImage.ts:41`, `exportAnalysisPDF.ts:60` |
| P-6 | A | **PDF exporta a face sem marca "SIMULAÇÃO"**, sem o aviso de uso experimental, com texto interpretativo ("dentro dos parâmetros normais") e imagem forçada 4:3 (distorção). Exportações não geram registro. | `exportAnalysisPDF.ts:72-117` |
| P-7 | M | Editar um caso **regrava `consent_date = agora`** (perde a data original) e permite desmarcar o consentimento sem registro. | `CaseForm.tsx:239` |
| P-8 | M | Sem enquadramento regulatório (ANVISA RDC 657/2022 — SaMD): o aviso existe no login/Workbench, mas medidas sem validação são exibidas com precisão de décimos (ver C-1…C-4). | `config.ts` |

### 2.3 Correção clínica e numérica

| # | Sev | Achado | Onde |
|---|---|---|---|
| C-1 | C | **Calibração global, persistida em `localStorage` e em pixels do *canvas da tela*** (não da imagem). Vale para qualquer foto/paciente/ângulo e muda com o tamanho da janela (ex.: calibrar a 0,60 e reabrir a 0,45 → valores ~33% maiores, sem aviso). Dois cliques no mesmo ponto geram `pixelsPerMm = 0` com `isCalibrated = true`. Salvar por foto, em px da imagem natural, validar faixa, exibir data. | `useCalibration.ts:85-141`, `SimulationCanvas.tsx:385` |
| C-2 | C | **Edição atravessa troca de foto e de versão.** `handlePhotoSelect` só chama `clearMesh`; os deslocamentos (por índice de landmark) e o undo continuam e são aplicados à malha da foto nova — um avanço de mento feito no perfil deforma a frontal e pode ser salvo/exportado. Medidas SVG antigas ficam sobre a foto nova. Abrir uma versão não troca para o `photoId` dela. | `Workbench.tsx:1225, 1052-1070`, `SimulationCanvas.tsx:513` |
| C-3 | C | **Simetria**: com 0 pares encontrados o score é **100% (verde)**; sem checagem de NaN; sem correção de inclinação da cabeça (roll de 5° ⇒ ~23% de "desvio" em um par); eixos normalizados por largura e altura somados em quadratura; denominador é fração da *imagem*, não do rosto; calculado em perfil/3-4 sem aviso; os pontos vêm de um LLM (Gemini), exibidos com 0,1% de precisão. | `useSymmetryAnalysis.ts:55-125`, `analyze-face` |
| C-4 | A | **Profundidade (`depthAccuracy`)**: x/z do MediaPipe estão na escala da *largura* e a régua násio-mento na *altura* ⇒ valores 1,33× maiores em 3:4; razões entre fotos de proporções distintas dão resultados falsos; "relevo observado" é saída do próprio MediaPipe em perfil 90° (onde é pouco confiável), não verdade de campo; mm sempre com 120 mm assumidos; texto "deixa de ser estimada" afirma mais do que o método sustenta. | `depthAccuracy.ts:177`, `DepthAccuracyPanel.tsx:60, 187` |
| C-5 | A | "Deslocamento máximo (mm)" usa `hypot(dx,dy,dz)·W` — o componente vertical deveria usar `H` (25% a menos em 3:4) e é o máximo entre *todos* os landmarks, não do ponto de interesse. A mesma anisotropia afeta o raio do warp, a geodésica e a malha 3D (rosto ~33% mais alto). | `SimulationCanvas.tsx:564`, `faceGeodesic.ts:53`, `Workbench.tsx:253` |
| C-6 | A | Handlers do Fabric com *closure* velha (`imageBounds`, malha, medidas) ao trocar foto com a ferramenta ativa: o pull é aplicado ao landmark da foto anterior. Corrida no carregamento da imagem de fundo; falha vira retângulo cinza 400×500 sem aviso que aceita medidas e calibração. | `SimulationCanvas.tsx:385-447, 681, 1028` |
| C-7 | M | Medidas por landmark ignoram o warp ("depois" devolve o valor pré-op); unidades misturadas (`cm` em medida livre, `mm` em landmark); redo do canvas é falso (só mostra toast); arco de ângulo pode desenhar o reflexo; `exportImage` não inclui as medidas. | `MediaPipeMeshRenderer.tsx:135`, `SimulationCanvas.tsx:919, 1252` |
| C-8 | M | `faceLandmarker` não valida faixa (rosto cortado, x<0 ou >1), pega silenciosamente o 1º rosto, sem score de confiança. | `faceLandmarker.ts:174` |
| C-9 | M | Funcionalidades mortas que prometem e não entregam: "Medidas Anatômicas" (painel "Aguardando Mesh" para sempre), "área em mm²", `HybridFaceMesh3D` (1146 linhas, não importado, com hook condicional), `Canvas2D`. Remover ou concluir. | `useAnatomicalMeasurements.ts`, `ToolPanel.tsx:749` |

### 2.4 Integridade de dados e fluxos

| # | Sev | Achado | Onde |
|---|---|---|---|
| D-1 | A | **CaseForm**: o upload do modelo 3D está *dentro* do laço de fotos (nunca sobe sem fotos; sobe N vezes com N fotos). Falhas de upload/insert de foto e versão base são silenciosas e o app mostra "Caso criado com sucesso"; sem rollback do objeto. Substituir foto cria linha duplicada sem apagar a antiga. | `CaseForm.tsx:287-347` |
| D-2 | A | Exclusão de caso mostra "excluído com sucesso" mesmo quando o RLS bloqueia (0 linhas, `error = null`). "Arquivar" é só um toast. | `CaseList.tsx:166-188` |
| D-3 | A | **Captura Guiada descarta as fotos** (`handleComplete` só navega); indicadores de qualidade (iluminação/foco) são constantes `true`; câmera não é desligada ao sair da página. | `CameraCapture.tsx:98, 166` |
| D-4 | A | **Autosave perde edições** (descarta a edição feita durante um save e cancela o timer no unmount); **sem `beforeunload`/`useBlocker`** — deformação e marcações somem ao recarregar/fechar; `handleUpdateVersion` sobrescreve a versão sem confirmação. | `useMeshAutoSave.ts:237, 328`, `Workbench.tsx:994, 1073` |
| D-5 | A | **`Exports`, `Settings` e TopBar usam dados fictícios em produção** ("Dr. Carlos Mendes" para qualquer usuário; arquivos inventados; "Salvar Configurações" não salva; nenhuma exportação grava `case_exports`). | `Exports.tsx`, `Settings.tsx:17`, `TopBar.tsx:33` |
| D-6 | A | Foto adicionada no Workbench: se o insert falha segue com id falso `ph_<timestamp>` (análises/versões com `photo_id` inválido); ângulo fixo "frente"; sem validação de tipo/tamanho. Modelo recém-gerado pela Meshy não carrega até recarregar (URL não assinada). | `Workbench.tsx:495-570, 196` |
| D-7 | M | Dashboard conta no máximo 10 casos ("Casos ativos"), baixa tabelas inteiras só para contar, progresso de job inventado (50/25). CaseList sem paginação, baixa `notes`, filtro sem `estetica`. | `Dashboard.tsx:149-243`, `CaseList.tsx:110, 246` |
| D-8 | M | Exclusão de versão usa *closure* velha (seleciona versão apagada); nome `length+1` duplica; comparação usa só a 1ª A e a 1ª B; versão "Original" criada como efeito de *leitura* (duplicável); autor "Autor" fixo; `loadCase` sem cancelamento (troca rápida de `:id` mistura casos). | `Workbench.tsx:455, 807, 1151` |
| D-9 | M | `useCase3DScans`: refetch em loop por dependência de `activeScan`; scan do caso anterior pode permanecer ativo; `deleteScan` remove objeto antes da linha sem checar erro. Polling da Meshy sem cleanup; `console.log` da resposta do provedor. Zip de até 200 MB descomprimido antes do limite (zip bomb); validação só por extensão. | `useCase3DScans.ts:309, 493`, `useMeshy3D.ts:117, 153`, `Model3DUpload.tsx` |

### 2.5 Desempenho

- Bundle único de **2,9 MB (851 KB gzip)**, sem code splitting (Three, Fabric, jsPDF, MediaPipe, html2canvas carregados no login).
- Projeção de 478 landmarks por *raycast* sem BVH recalculada a cada render do Workbench; `warpFace` redesenha imagem de 12 MP ×870 `drawImage` a cada `mousemove`; texturas 12 MP e base64 em resolução original (≈10 MB) sem downscale nem `dispose`; `setCursorPosition` a cada movimento re-renderiza o componente de 2.059 linhas; malha recria ~3.000 objetos Fabric a cada mudança de opacidade (`SimulationCanvas.tsx:981`, `MediaPipeMeshRenderer.tsx:111`, `FaceMesh3D.tsx:39`).

### 2.6 Dependências, build e CI

- **29 vulnerabilidades** em produção. Diretas: `jspdf` ≤4.2.0 (crítica, 10 advisories — exposição prática baixa: o app só usa `text`/`addImage` com imagem própria, mas atualize), `fabric` ≤7.3.1 (XSS em export SVG — baixa exposição), `react-router-dom`, `postcss`, `tailwindcss`; transitivas `tar`, `ws`, `yaml`.
- CI roda typecheck/build, mas o **lint é informativo** (`continue-on-error`) e **não há testes nem `npm audit`**. `strict: false` no TypeScript. Edge functions importam `esm.sh/@supabase/supabase-js@2.39.3` e `std@0.168.0` (versões antigas; frontend usa 2.112).
- Marca inconsistente (InsightsCirurgic / InsgthsCirurgic / CranioSim / Cranio Sculpt); README é o prompt original, não documentação; login com "Lembrar-me" e "Esqueci minha senha" mortos, "© 2024".

## 3. Plano de ação sugerido

**Sprint 0 — imediato (horas)**
1. Desativar auto-cadastro no painel do Supabase (S-3).
2. Corrigir logout: `signOut()` + navegação (S-1); adicionar timeout de inatividade.
3. Rodar `select * from pg_policies` em produção e eliminar policies `USING/WITH CHECK (true)` e as sem `TO authenticated` (S-2, S-8).
4. Bloquear análise/Meshy/IA quando `consent_registered = false` (P-1); parar de enviar `notes` à IA (P-4).

**Sprint 1 — segurança e conformidade (dias)**
5. Gravar auditoria (`log_audit` via RPC ou trigger) em abrir/editar/excluir/exportar/enviar à IA; trocar `ON DELETE CASCADE` de `audit_logs`; impedir inserção forjada (P-2).
6. Exclusão de caso/foto removendo objetos do storage (função com service role após `has_case_access`); conferir linhas afetadas (P-3, D-2).
7. SSRF: allowlist de host (apenas storage do projeto) + timeout + limite em `imageUrl` (S-4); cota atômica (função SQL `consume_quota`) e cota na criação de tarefa Meshy; vincular `task_id` ao caso (S-5, S-6).
8. Baseline único de migrations a partir do banco real (S-8); UNIQUE em `facial_analyses(photo_id)` (S-9).

**Sprint 2 — segurança clínica (1–2 semanas)**
9. Calibração por foto (px da imagem natural, validada, com data); zerar warp/undo/medidas ao trocar foto; abrir versão troca para o `photoId` (C-1, C-2).
10. Simetria: exigir ≥N pares, corrigir roll pelo eixo interpupilar, normalizar pela distância interpupilar, bloquear não frontais, 0 casas decimais (C-3).
11. Corrigir conversões px (`x·W, y·H, z·W`) em profundidade, deslocamento, geodésica; reescrever os textos que afirmam validação inexistente (C-4, C-5).
12. Marca d'água + aviso experimental no PDF; pseudonimização do nome de arquivo (P-5, P-6).

**Sprint 3 — robustez**
13. CaseForm (3D fora do laço, erros visíveis, rollback), autosave com flush, `beforeunload`, remover dados fictícios (D-1…D-6).
14. Testes (Vitest) para `lib/` numéricas e `versionState`; RLS testado com `pgTAP`; CI com lint bloqueante e `npm audit`.
15. Code splitting (rotas + Three/Fabric), downscale de imagens, `dispose`; atualizar dependências com CVEs; remover código morto (`HybridFaceMesh3D`, `Canvas2D`, medidas anatômicas ou concluí-las).
