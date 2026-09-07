# Análise facial (landmarks) travando — diagnóstico e correções

## Qual fluxo o app usa hoje

Configurado em `src/lib/config.ts`:

- Botão de análise no Workbench → `https://vssolutions-n8n.fjsxhg.easypanel.host/webhook/facial-analysis`
- Criação de caso → `https://vssolutions-n8n.fjsxhg.easypanel.host/webhook/facial-mesh-agent`

## O que os testes mostraram (verificado agora)

1. `facial-analysis` responde **200, mas com corpo vazio** — nenhum landmark volta na resposta. Sem dados, o app entra em modo de espera (consulta o banco a cada 3s, até 1 minuto).
2. `facial-mesh-agent` responde **404 — "webhook não registrado / workflow precisa estar ativo"**. Esse fluxo está desligado no n8n.
3. No banco, o pedido de hoje (07/09 23:39) ficou registrado como **"pending"** e nunca mudou de status; nenhuma malha facial foi gravada. Ou seja: o n8n recebe o pedido, cria o registro e **não devolve o resultado nem atualiza o status**.
4. Registros antigos que funcionaram foram gravados com o status escrito errado: **"sucess"** (falta um "c"). O app só reconhece "success"/"completed", então mesmo quando o n8n termina, a tela continua "Processando" para sempre.

Conclusão: o problema está principalmente **do lado do n8n** (fluxo `facial-mesh-agent` desativado e `facial-analysis` sem retorno/atualização), somado a duas fragilidades do app.

## O que fazer no n8n (do seu lado)

- Ativar o workflow `facial-mesh-agent` (toggle "Active" no editor).
- No workflow `facial-analysis`: garantir o nó que **atualiza o registro** para `success` (grafia correta) com `timestamp_end`, e o nó "Respond to Webhook" devolvendo `status`, `job_id`, `case_id` e `face_mesh.points` / `face_mesh.connections`.
- Alternativa recomendada: em vez de responder direto, chamar o endereço de retorno já existente do app (`webhook-n8n-notification`), que grava tudo no banco.

## O que eu ajusto no app

1. **Tolerar a grafia errada de status**: aceitar `sucess`, `succes`, `sucesso`, `ok`, `done` como conclusão (em `useN8nFacialAnalysis` e no webhook de retorno), para não travar em "Processando".
2. **Criar o registro do pedido pelo próprio app** antes de chamar o n8n, guardando `job_id`, `case_id`, `photo_id` e `image_url`, e passar esse `job_id` no envio. A consulta de status passa a olhar **esse** pedido, não o último registro qualquer do caso (hoje pode ler um pedido antigo e se confundir).
3. **Mensagens de erro claras**: quando o n8n responder 404/erro ou vazio, mostrar "Fluxo n8n indisponível ou inativo" em vez de ficar girando até o timeout.
4. **Aumentar a janela de espera** de 1 para ~3 minutos, já que o processamento é assíncrono.
5. **Botão "Tentar novamente"** no aviso de falha, reaproveitando o retry que já existe no hook.

## Detalhes técnicos

- `src/hooks/useN8nFacialAnalysis.ts`: insert em `facial_analysis_jobs` (status `pending`) antes do `fetch`; incluir `job_id` no payload; `pollJobStatus` filtra por `.eq('job_id', jobId)`; função `normalizeStatus` compartilhada com variantes de grafia; tratar `response.status === 404` como falha explícita.
- `src/lib/config.ts`: `MAX_POLLING_ATTEMPTS` de 20 → 60.
- `supabase/functions/webhook-n8n-notification/index.ts`: adicionar as variantes de grafia ao `statusMap`.
- Nenhuma mudança de schema é necessária.
