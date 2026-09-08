// Application configuration
//
// A detecção de landmarks faciais roda no navegador (src/lib/faceLandmarker.ts).
// As URLs de webhook n8n, o intervalo de polling e o limite de tentativas que existiam
// aqui foram removidos junto com aquele pipeline: não há mais serviço externo, fila
// nem espera assíncrona no fluxo de análise.

// PR-1: o sistema não tem enquadramento regulatório como Software como Dispositivo
// Médico (ANVISA RDC 657/2022). Enquanto isso não existir, a interface precisa declarar
// isso de forma explícita. Texto único, referenciado no login e no Workbench, para não
// divergir entre as telas.
export const EXPERIMENTAL_USE_NOTICE =
  'Ferramenta em fase experimental — as medidas e simulações exibidas são apoio visual ' +
  'e não substituem avaliação clínica, exame de imagem (CT/CBCT) ou julgamento do ' +
  'cirurgião responsável. Não é um dispositivo médico registrado.';
