-- N-1: a taxonomia de caso não contemplava estética.
--
-- `case_type` tinha exatamente dois valores, `queimadura` e `trauma`, e o formulário
-- oferecia só esses dois com `trauma` como padrão. O sistema é hoje de planejamento
-- estético facial — as sete regiões ósseas, a mentoplastia, a redução de giba não
-- pertencem a nenhum dos dois rótulos. Na prática todo caso estético entrava gravado
-- como "Trauma": o filtro por tipo não separava nada e o registro ficava errado.
--
-- POR QUE SOZINHA NESTE ARQUIVO: `ALTER TYPE ... ADD VALUE` adiciona o rótulo, mas o
-- novo valor não pode ser USADO na mesma transação que o criou. Qualquer migration que
-- venha a inserir ou comparar com 'estetica' precisa ser um arquivo posterior.
--
-- OS CASOS EXISTENTES NÃO SÃO RECLASSIFICADOS. Reescrever o tipo de casos já gravados é
-- decisão clínica de quem os cadastrou, não de uma migration. A opção passa a existir
-- daqui para a frente; a correção do histórico, se for desejada, é trabalho à parte.

ALTER TYPE public.case_type ADD VALUE IF NOT EXISTS 'estetica';
