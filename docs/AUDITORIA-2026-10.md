# Auditoria completa — InsightsCirurgic (outubro/2026)

Escopo: todo o repositório no commit `06f9e34` — frontend (React/Vite/TS), banco (16 migrations Supabase), edge functions, CI e dependências. Auditoria somente de leitura; nada foi corrigido neste documento.

Os achados críticos e altos foram conferidos diretamente no código. Itens que dependem do estado real do banco de produção estão marcados **(a confirmar)**.

## Resumo executivo

| Área | Crítico | Alto | Médio | Baixo |
|---|---|---|---|---|
| Segurança do backend | 1 | 4 | 6 | 8 |
| Segurança do frontend / LGPD | 1 | 2 | 5 | 6 |
| Correção funcional | 4 | 13 | 8 | 4 |
| Qualidade, CI, dependências | — | 1 | 3 | 2 |

**As cinco coisas a fazer primeiro:**

1. **"Sair" não faz logout** (F-1). Em computador compartilhado, o próximo usuário vê os pacientes do anterior.
2. **`facial_analysis_jobs` aberta para qualquer autenticado** (B-1). Qualquer conta lê URL de foto e landmarks de todos os pacientes, e pode alterar jobs alheios.
3. **Foto do rosto enviada a IA externa e à Meshy sem checar consentimento** (F-2, F-3). Dado sensível (LGPD art. 11) com transferência internacional (art. 33) sem base registrada.
4. **Calibração px/mm global e persistente** (C-1). Medidas em mm de um caso são calculadas com a escala de outra foto, sem aviso: risco clínico direto.
5. **Dados de uma foto gravados em outra** (C-2, C-8). Trocar de foto mantém malha e deformação da anterior, e respostas atrasadas são aplicadas à foto errada.

**Pré-requisito para fechar a auditoria do banco (seção 0):** as migrations versionadas não reproduzem o banco real. Antes de corrigir RLS, extraia o estado de produção.

---

## 0. O histórico de migrations não descreve o banco real

- Há duas cadeias incompatíveis. A "migração completa" `20251230114924` faz `CREATE TYPE`/`CREATE TABLE` sem `IF NOT EXISTS` e falharia sobre a cadeia antiga (`20251213` → `20251218`).
- `20251214204104` cria policy em `facial_analysis_jobs`, tabela que nenhuma migration anterior cria.
- `src/integrations/supabase/types.ts` tem colunas que não estão em nenhuma migration (`photo_id` em várias tabelas, `facial_analysis_jobs.landmarks`) e **não** tem `ai_usage` nem `case_3d_scans.meshy_task_id`. Ou os tipos estão desatualizados, ou as migrations de 12/09 não foram aplicadas **(a confirmar)**.
- `20260908120000` já reconhece em comentário que "o banco real divergiu".

**Ação:** rodar `supabase db dump --schema public,storage` e `select * from pg_policies`, criar uma migration-baseline com o estado real e regenerar `types.ts`. Sem isso, nenhuma análise de RLS feita a partir do repositório é conclusiva.

---

## 1. Segurança do backend

### Crítico

**B-1. `facial_analysis_jobs`: leitura e escrita para qualquer autenticado** (a confirmar em `pg_policies`)
- `supabase/migrations/20251214204104_*.sql` — `SELECT USING (true)` e `UPDATE USING (true)` para `authenticated`; `20251214215642_*.sql` — `INSERT WITH CHECK (true)`. Nenhuma migration posterior remove essas policies, e policies permissivas se somam por OR.
- Exploit: `supabase.from('facial_analysis_jobs').select('*')` devolve `image_url`, `landmarks` (biométrico) e `case_id` de todos os casos. Com o UPDATE, o atacante muda `status`/`error_message` de jobs alheios e o trigger `notify_analysis_complete` entrega o texto dele como notificação ao dono do caso.
- `src/pages/Dashboard.tsx:178-181` consulta essa tabela sem filtro: se a policy estiver ativa, o dashboard já exibe jobs de outros usuários.
- Correção: dropar as três policies; manter só as baseadas em `has_case_access(case_id)` com `WITH CHECK`.

### Alto

**B-2. `generate-3d-model` não amarra `task_id` ao caso (S-1 incompleta)**
- `supabase/functions/generate-3d-model/index.ts:172-260`. Só verifica `canAccessCase(case_id)`; o `task_id` é livre.
- Exploit: `{action:'status', task_id:<da vítima>, case_id:<meu caso>}` devolve o GLB da face de outro paciente. Em `finalize`, `findScanByTask` usa service role e devolve a linha da vítima; se o atacante finaliza primeiro, o índice único faz a vítima receber a linha do atacante.
- Mitigante: `task_id` é difícil de adivinhar, mas aparece em logs do servidor e no console do cliente.
- Correção: gravar `(task_id, case_id, user_id)` na criação e exigir esse vínculo em `status`/`finalize`; filtrar `findScanByTask` por caso.

**B-3. Cota de IA com corrida entre contagem e inserção**
- `supabase/functions/_shared/quota.ts:47-85`: SELECT, conta em memória, INSERT, sem transação.
- Exploit: 300 requisições simultâneas leem todas menos de 20 registros e passam. O teto horário vira ilimitado.
- Correção: RPC `consume_ai_quota(fn)` com `pg_advisory_xact_lock` e contagem+inserção na mesma transação; revogar INSERT direto em `ai_usage`.

**B-4. SSRF e download sem limite em `recommend-mesh-density`**
- `supabase/functions/recommend-mesh-density/index.ts:71`: `fetch(imageUrl)` com URL do cliente, sem allowlist, timeout ou teto de tamanho; o status HTTP volta ao chamador (oráculo de varredura). A chamada ao gateway de IA também não tem timeout. A correção C-4 só chegou à função da Meshy.
- Correção: receber `storage_path`, verificar `canAccessCase` e assinar a URL no servidor; usar `downloadWithLimit`/`fetchWithTimeout` de `generate-3d-model`.

**B-5. Notificações e `audit_logs` aceitam inserção forjada**
- `20251216213912_*.sql:35-38` e `20251230114924_*.sql:316`: `notifications` com `INSERT WITH CHECK (true)` sem `TO` — qualquer um cria notificação para qualquer usuário (phishing interno).
- `20251213232950_*.sql:471-475`: `audit_logs` com `INSERT WITH CHECK (true)` — dá para gravar entradas em nome de outro usuário e caso, o que anula o valor da trilha de auditoria (LGPD art. 37).
- Correção: remover as policies de INSERT; notificação só por trigger/service role; auditoria só via `log_audit()` (já é `SECURITY DEFINER` com `auth.uid()`), validando `has_case_access`.

### Médio

- **B-6.** Criação de modelo na Meshy não consome cota e aceita `image_url` livre; `analyze-face` não recebe `case_id` nem verifica acesso. Receber `photo_id`/`storage_path` e aplicar cota (após B-3).
- **B-7.** `_shared/cors.ts:34-40` volta a `*` sem `ALLOWED_ORIGINS`. Confirmar que a variável está definida em produção. Impacto limitado (auth por header, não cookie).
- **B-8.** `profiles` legível por todos os autenticados (`20251213232950_*.sql:83-87`). Na cadeia de 20251230, `full_name = email`, expondo e-mails. Restringir a `id = auth.uid()`/admin/colegas de caso.
- **B-9.** Logs com PHI ou credenciais temporárias: URL assinada da foto (`generate-3d-model/index.ts:39`), URL do GLB (`:108`), resposta completa da IA com descrição clínica (`recommend-mesh-density/index.ts:176, 215`; `analyze-face/index.ts:236`).
- **B-10.** Erros internos repassados ao cliente (`generate-3d-model/index.ts:60, 282-285`; `analyze-face/index.ts:304-307`). `recommend-mesh-density/index.ts:219-232` responde **200** em erro.
- **B-11.** `notes` e `caseType` interpolados no prompt (`recommend-mesh-density/index.ts:131-138`): prompt injection e notas clínicas enviadas ao gateway.

### Baixo

- **B-12.** Autoria forjável: `case_versions.author_id`, `case_3d_scans.uploaded_by`, `case_exports.user_id` aceitam qualquer UUID. Forçar `auth.uid()` por default+trigger ou `WITH CHECK`.
- **B-13.** `has_role(_user_id, _role)` é `SECURITY DEFINER` e executável por `anon` via RPC (oráculo de quem é admin). `REVOKE EXECUTE ... FROM anon, public`.
- **B-14.** `log_audit` executável por `anon` e sem checagem de caso.
- **B-15.** Buckets sem `allowed_mime_types` e, na cadeia antiga, `case-photos` sem `file_size_limit`.
- **B-16.** `getPublicUrl` em bucket privado (`generate-3d-model/index.ts:132-138`) grava URL que não funciona. Convenção deliberada (ver commit `dddad94`), mas frágil; ver C-16.
- **B-17.** `analyze-face/index.ts:189`: timeout limpo antes de ler o corpo; sem limite de tamanho para `imageBase64`.
- **B-18.** `canAccessCase` não valida formato UUID (falha fechado, mas polui log).
- **B-19.** UPDATE sem `WITH CHECK` explícito em várias tabelas. Não explorável hoje (Postgres reaplica o USING), mas convém explicitar.

### Verificação das correções anteriores

| Item | Situação |
|---|---|
| S-1 autorização Meshy | Parcial — falta vincular `task_id` ao caso (B-2) |
| S-1 storage privado + policies por caso | Correto (sujeito à seção 0) |
| S-2 cota de IA | Conceito correto; corrida (B-3); Meshy sem cota (B-6); tabela ausente de `types.ts` |
| S-3 CORS | Correto quando `ALLOWED_ORIGINS` está definida (B-7) |
| C-2 idempotência Meshy | Correto contra duplicata; a busca do vencedor ignora o caso (B-2) |
| C-4 timeouts | Só em `generate-3d-model`; falta em `recommend-mesh-density` (B-4) e parcial em `analyze-face` (B-17) |

---

## 2. Segurança do frontend, autenticação e LGPD

### Crítico

**F-1. "Sair" não encerra a sessão**
- `src/components/layout/TopBar.tsx:385` — o item é só `<Link to="/login">`. Não existe `supabase.auth.signOut()` em `src/`.
- Como a sessão segue ativa, `/login` redireciona para `/dashboard`. O médico "sai" num PC do consultório e o próximo usuário continua dentro, com JWT e refresh token no localStorage.
- Correção: `await supabase.auth.signOut()`, `queryClient.clear()`, limpar stores zustand (incluindo `canvas-calibration`) e navegar para `/login`.

### Alto

**F-2. Foto do rosto e notas clínicas vão para terceiros sem checar consentimento**
- `Workbench.tsx:636-658` e `useFacialAnalysis.ts:86-96` enviam foto/notas às funções que repassam ao gateway de IA (Gemini); `Workbench.tsx:1243-1249` e `useMeshy3D.ts:191` enviam a URL assinada (válida por 1 h) à Meshy.
- Nenhum caminho lê `consent_registered`, nem no cliente nem nas edge functions.
- Correção: consentimento específico para processamento por IA externa, exigido no servidor; não enviar `notes`; URL de curta duração para a Meshy; documentar os operadores no RIPD/ROPA.

**F-3. Consentimento só validado na UI, e a data é reescrita a cada edição**
- `CaseForm.tsx:217-220` (checagem só no cliente) e `CaseForm.tsx:243-244` (`consent_date: new Date()` em todo update).
- Pela API, casos e fotos podem ser criados sem consentimento; cada edição apaga a data real (LGPD art. 8 §2º — ônus da prova do controlador).
- Correção: gravar a data só na transição false→true, idealmente numa tabela de consentimentos (versão do termo, quem registrou, revogação); impedir fotos/análises sem consentimento no banco.

### Médio

- **F-4.** Sessão sempre em localStorage (`client.ts:12-15`). "Lembrar-me" e "Esqueci minha senha" (`Login.tsx:168-175`) não fazem nada. Sem logout por inatividade.
- **F-5.** Cadastro aberto possivelmente ativo no Supabase **(a confirmar)**: só a UI de cadastro foi removida; `config.toml` não tem `[auth] enable_signup = false`. Combinado com B-1/B-8, qualquer pessoa cria conta e lê dados.
- **F-6.** Sem CSP nem cabeçalhos de segurança. `faceLandmarker.ts:14-16, 72-76` tem fallback para `cdn.jsdelivr.net` e `storage.googleapis.com` sem SRI. Definir CSP, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` (também evita vazar URLs assinadas) e `Permissions-Policy`.
- **F-7.** Dados mock em produção: `TopBar.tsx` e `Settings.tsx` mostram "Dr. Carlos Mendes" para qualquer usuário (o usuário não sabe em qual conta está — agrava F-1); `Exports.tsx` lista exportações fictícias; "Salvar Configurações" finge salvar; "Arquivar" em `CaseList` só mostra toast.
- **F-8.** `Settings.tsx:192-202` afirma criptografia e acesso restrito que o código não implementa. Não há política de privacidade, canal do encarregado (DPO), retenção nem exclusão/portabilidade.

### Baixo

- **F-9.** PDF sem marca d'água "SIMULAÇÃO" (o PNG tem); nenhuma exportação é registrada em `case_exports`.
- **F-10.** `console.log` com IDs de caso, caminhos de storage e respostas completas (`storageUrls.ts:59`, `useMeshy3D.ts:117`, `useFacialAnalysis.ts`). Remover em produção (`esbuild.drop`).
- **F-11.** `ErrorBoundary.tsx:55` e toasts mostram `error.message` cru do Supabase/Meshy.
- **F-12.** Upload aceita qualquer arquivo (`accept="image/*"` apenas); extensão vem de `file.name`.
- **F-13.** Realtime de `notifications` (`TopBar.tsx`) sem `filter: user_id=eq.<uid>`, dependendo só da RLS.
- **F-14.** `public/robots.txt` com `Allow: /` contradiz o `noindex` do `index.html`.

---

## 3. Correção funcional

### Crítico

**C-1. Calibração px/mm global, persistida e nunca zerada**
- `src/hooks/useCalibration.ts:50-143` (zustand `persist`, chave `canvas-calibration`); usada em `SimulationCanvas.tsx:567-575, 918-919, 943`.
- O valor é em pixels do canvas (depende do encaixe da foto na janela) e vale para qualquer foto, caso, resolução e após recarregar. Nada chama `resetCalibration`.
- Cenário: calibrar a frontal do caso X, abrir o perfil do caso Y — medidas e "deslocamento em mm" saem erradas proporcionalmente à diferença de escala, sem aviso.
- Correção: calibração por `photo_id`, em pixels da imagem nativa, invalidada ao trocar de foto.

**C-2. Trocar de foto mantém malha e deformação da foto anterior**
- `Workbench.tsx:1225-1241`: `handlePhotoSelect` só limpa a análise local; `mediaPipeMeshData` e `warpDisplacements` permanecem. A foto B é deformada com a geometria de A e "Salvar nesta versão" grava `photo_id=B` com a deformação de A. Respostas atrasadas da análise de A são aplicadas sobre B.
- Correção: limpar malha e warp na troca (confirmando trabalho não salvo) e descartar respostas cuja foto não é a atual.

**C-3. Falha ao carregar versões cria versão base duplicada**
- `Workbench.tsx:357-361, 456-482`: o `error` das consultas é ignorado; erro transitório → `versions=[]` → nova versão "Original" é inserida, e o caso abre vazio.

**C-4. `upsert(..., { onConflict: 'photo_id' })` sem UNIQUE correspondente** (a confirmar no banco)
- `useMediaPipeMesh.ts:92-102`. As migrations só criam índice não único em `facial_analyses.photo_id`; o Postgres recusa (42P10) e a malha nunca é salva — some ao recarregar.

### Alto

- **C-5.** Alternar 2D ↔ 3D/Comparar desmonta o canvas e apaga as marcações; salvar a versão nesse estado grava `markings: []` por cima das salvas (`Workbench.tsx:1326, 968-969`).
- **C-6.** A versão selecionada ao abrir o caso não tem o estado aplicado (`Workbench.tsx:421-422`); um ajuste seguido de "Salvar nesta versão" sobrescreve o trabalho salvo.
- **C-7.** Sem proteção contra sair com trabalho não salvo (nenhum `beforeunload`/`useBlocker`, apesar de `hasUnsavedWork`). `useMeshAutoSave.ts:111-125` cancela o debounce no unmount e `:27` descarta um save que chega durante outro.
- **C-8.** Análise Gemini não cancelável grava landmarks de A na foto B (`useFacialAnalysis.ts:86-137`). O autosave ignora erro do `maybeSingle` e duplica linhas, e insere sem `status`, que fica `'pending'` — e `restoreAnalysis` só restaura `'landmarks_ready'`: landmarks salvos nunca voltam.
- **C-9.** Puxar pele apaga o avanço ósseo em profundidade: `faceWarp.ts:230-234` grava só `{dx, dy}`, descartando `dz`. Correção: preservar `previous.dz`.
- **C-10.** Medida em mm do warp mistura normalizações: `dx` por largura, `dy` por altura, mas `hypot(...) * imageBounds.width` (`SimulationCanvas.tsx:562-575`). Em foto 3:4, deslocamento vertical sai ~25% subestimado.
- **C-11.** PDF com unidade errada: colunas "(mm)" mostram % da imagem (`exportAnalysisPDF.ts:206-207, 235-236`); imagem forçada a 4:3 distorce o rosto; imagem depende do zoom.
- **C-12.** `CaseForm.tsx:313-341`: o upload do modelo 3D está **dentro** do `for` das fotos (indentação engana). Com N fotos, o modelo é enviado N vezes e cria N linhas em `case_3d_scans`; com 0 fotos, nunca é enviado.
- **C-13.** `CameraCapture.tsx`: a câmera não é desligada ao sair (`stopCamera` captura `stream=null`); **a foto é salva espelhada** (`:115-118`), invertendo esquerda/direita do paciente — risco de lateralidade em planejamento cirúrgico; as fotos capturadas são descartadas e os checks de qualidade são sempre `true`.
- **C-14.** Polling da Meshy (`useMeshy3D.ts:90-169`) sem cancelamento: segue até 10 min após sair do caso, dispara `onSuccess` do caso antigo; um erro de rede isolado abandona a tarefa paga.
- **C-15.** `useCase3DScans.ts:102, 110`: `activeScan` não é zerado ao trocar de caso — o caso B pode mostrar o scan 3D do paciente A.
- **C-16.** Modelo recém-gerado pela Meshy não carrega: `Workbench.tsx:196-206` usa `file_url` crua (pública) de bucket privado → 403.
- **C-17.** `CaseForm`: erros de upload/insert de foto e da versão base ignorados, com toast de sucesso; "remover foto" só limpa o estado local.

### Médio

- **C-18.** Duplicar versão não copia `canvas_state` nem `photo_id` (`Workbench.tsx:730-771`).
- **C-19.** Excluir a versão selecionada a mantém selecionada (closure antiga, `Workbench.tsx:807-809`).
- **C-20.** Comparar usa sempre a primeira A e a primeira B, rotula a foto atual como "Versão B" quando não há B, e em erro mostra a original com rótulo de versão.
- **C-21.** `SimulationCanvas.tsx:385-447`: carregamento de imagem não cancelável (vence a última a carregar); `canvas.add` após unmount; foto nova aparece sem a deformação até o próximo arraste.
- **C-22.** `handleAddPhoto` (`Workbench.tsx:495-570`): ângulo fixo `'frente'` (eixo ósseo errado em perfil); em falha de insert, id falso `ph_…` e arquivo órfão; blob URL não revogado.
- **C-23.** URLs assinadas de 1 h nunca renovadas (`storageUrls.ts:13`): sessões longas passam a falhar com 403.
- **C-24.** `FaceMesh3D.tsx:41-97` recria `BufferGeometry` a cada warp sem `dispose` (vazamento de GPU) e recentraliza a malha deformada, diluindo o avanço; `PatientModelViewer.tsx:33-68` idem para materiais.
- **C-25.** Exclusão de caso apaga linhas em cascata mas deixa fotos e modelos no storage (pendência LGPD de eliminação); `deleteScan` apaga o arquivo antes da linha.

### Baixo

- **C-26.** Dashboard: contadores sobre `.limit(10)`; `case_versions` sem paginação (corta em 1000); erros ignorados; jobs legados "pending" aparecem para sempre.
- **C-27.** `CaseList` sem paginação.
- **C-28.** Código morto: `HybridFaceMesh3D.tsx` (1.146 linhas, com hook condicional), `Canvas2D.tsx`, `Model3DUpload` (importado, não renderizado), `upload3DScan`/`delete3DScan`, consulta `jobData` não usada.
- **C-29.** `Settings.tsx` diz "Y = refazer"; o código usa Shift+Z.

---

## 4. Qualidade, CI e dependências

Resultados das ferramentas no commit auditado:

| Verificação | Resultado |
|---|---|
| `tsc -p tsconfig.app.json` | Passa — mas com `strict: false`, `strictNullChecks: false`, `noImplicitAny: false` |
| `npm run build` | Passa; bundle principal de **2,9 MB** (851 kB gzip) num único chunk |
| `eslint .` | 124 problemas (109 erros): 103 `no-explicit-any`, 8 `exhaustive-deps`, 1 `rules-of-hooks` |
| Testes automatizados | **Nenhum** (0 arquivos de teste, sem script `test`) |
| `npm audit --omit=dev` | 29 vulnerabilidades (2 críticas, 22 altas) |

- **Q-1 (Alto). Nenhum teste automatizado** num sistema que calcula medidas em mm para planejamento cirúrgico. As validações descritas nos commits (asserts de cota, geometria sintética de profundidade) foram feitas fora do repositório e não rodam na CI. Começar por testes unitários de `faceWarp`, `boneShift`, `depthAccuracy`, `useCalibration` e `quota.ts`.
- **Q-2 (Médio). TypeScript sem modo estrito.** Vários bugs da seção 3 (`error` ignorado, `null` não tratado) seriam apontados por `strictNullChecks`. Ativar gradualmente.
- **Q-3 (Médio). Dependências diretas vulneráveis:**
  - `jspdf` 3.x — crítica (path traversal; o vetor principal é Node, mas a linha 3.x tem outros avisos). Atualizar para 4.x.
  - `react-router-dom` 6.30 — alta (open redirect/XSS). `npm audit fix` resolve.
  - `fabric` 6.5 — alta (XSS em export SVG; o app não exporta SVG). As críticas de `tar`/`canvas` vêm de dependências Node opcionais do fabric e não entram no bundle.
  - `dompurify` (via jspdf) — moderada (XSS).
- **Q-4 (Médio). Bundle único de 2,9 MB**: three.js, fabric, jspdf e MediaPipe carregados na tela de login. Usar `React.lazy` por rota e `manualChunks`.
- **Q-5 (Baixo).** Lint é só informativo na CI (decisão documentada). `HybridFaceMesh3D.tsx:369` chama `useLoader` condicionalmente — morto hoje, mas quebraria ao ser reativado.
- **Q-6 (Baixo).** Arquivos grandes demais para manutenção segura: `SimulationCanvas.tsx` (2.059 linhas), `Workbench.tsx` (1.601), `ToolPanel.tsx` (1.346). Boa parte de C-2, C-5, C-6 e C-8 nasce do estado espalhado no `Workbench`.

---

## 5. Pontos positivos

- Rotas protegidas de fato (`ProtectedRoute`), sem flash de conteúdo.
- Buckets de storage privados, policies de storage por caso via `has_case_access` (S-1 de storage correta), URLs assinadas.
- `has_case_access` como fonte única de autorização; funções `SECURITY DEFINER` com `search_path` fixo; sem caminho de autoescalada de papel.
- Edge functions recusam anônimos no código, não só via `verify_jwt`; segredos só em `Deno.env`.
- `.env` versionado contém apenas URL e chave publishable (pública por design); nenhuma service role no histórico.
- MediaPipe roda no navegador; nenhuma foto vai para localStorage/IndexedDB; sem `dangerouslySetInnerHTML` fora de `components/ui`.
- PNG exportado com marca d'água e aviso de simulação; aviso de "não é dispositivo médico" centralizado.
- CI existe e roda typecheck e build; decisões de segurança bem documentadas em migrations e commits.

---

## 6. Plano sugerido

**Sprint 0 — emergência (dias)**
F-1 logout · B-1 policies de `facial_analysis_jobs` · B-5 inserts forjados · F-5 desligar signup · seção 0 (dump do banco real e baseline)

**Sprint 1 — dados clínicos corretos**
C-1 calibração por foto · C-2/C-8 isolamento por foto · C-9/C-10 cálculo de mm · C-13 foto espelhada · C-12 upload do modelo · C-3/C-4 versões e upsert · C-11 unidades do PDF

**Sprint 2 — LGPD e terceiros**
F-2/F-3 consentimento específico e validado no servidor · B-2/B-4/B-6 vínculo de recurso e SSRF · B-3 cota atômica · B-9 logs · C-25 eliminação de arquivos · F-8 texto e política de privacidade

**Sprint 3 — robustez e qualidade**
C-5 a C-7 perda de trabalho · C-14/C-15 polling e troca de caso · F-7 remover mocks · Q-1 testes · Q-3 dependências · Q-4 code splitting · Q-2 strict
