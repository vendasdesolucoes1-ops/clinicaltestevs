-- C-2: a finalização do Meshy não era idempotente.
--
-- A ação `finalize` baixava o GLB e inseria em `case_3d_scans` sem verificar se aquele
-- `task_id` já tinha sido finalizado. O cliente faz polling a cada 5s por até 10 minutos;
-- uma resposta duplicada, um retry do usuário ou dois navegadores abertos no mesmo caso
-- criavam dois uploads e duas linhas — o mesmo modelo 3D aparecendo duas vezes na lista.
--
-- O ÍNDICE É A GARANTIA, NÃO A CONSULTA. A função passa a consultar antes de baixar, mas
-- duas chamadas simultâneas passariam as duas por essa consulta. Quem de fato impede a
-- duplicata é este índice único: a segunda inserção falha, e a função trata a falha
-- devolvendo a linha que a primeira criou.
--
-- PARCIAL, em `WHERE meshy_task_id IS NOT NULL`: modelos enviados manualmente pelo
-- cirurgião não vêm da Meshy e não têm task_id. Sem o filtro, o índice trataria todos os
-- NULL como colisão a partir do segundo upload manual.

ALTER TABLE public.case_3d_scans
  ADD COLUMN IF NOT EXISTS meshy_task_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_case_3d_scans_meshy_task
  ON public.case_3d_scans (meshy_task_id)
  WHERE meshy_task_id IS NOT NULL;

COMMENT ON COLUMN public.case_3d_scans.meshy_task_id IS
  'Tarefa da Meshy que gerou este modelo. Nulo em modelos enviados manualmente. '
  'O índice único sobre esta coluna é o que garante a idempotência da finalização.';
