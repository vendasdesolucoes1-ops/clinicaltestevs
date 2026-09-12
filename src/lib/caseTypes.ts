// Rótulo e cor de cada tipo de caso, num lugar só.
//
// N-1: `case_type` tinha apenas `queimadura` e `trauma`, e quatro telas repetiam a mesma
// binária — `type === 'queimadura' ? 'Queimadura' : 'Trauma'`. Com um terceiro valor,
// cada uma dessas ternárias passaria a rotular caso estético como "Trauma", que é
// exatamente o defeito que a migration veio corrigir.
//
// Um mapa por tipo resolve as quatro de uma vez e faz o TypeScript cobrar a atualização
// quando um novo valor entrar no enum: `Record<CaseType, ...>` não compila incompleto.

import type { Database } from '@/integrations/supabase/types';

export type CaseType = Database['public']['Enums']['case_type'];

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  estetica: 'Estética',
  trauma: 'Trauma',
  queimadura: 'Queimadura',
};

/** Classes do badge de cada tipo, na paleta já usada pelo sistema. */
export const CASE_TYPE_BADGE_CLASSES: Record<CaseType, string> = {
  estetica: 'border-accent/30 text-accent bg-accent/10',
  trauma: 'border-primary/30 text-primary bg-primary/10',
  queimadura: 'border-warning/30 text-warning bg-warning/10',
};

/**
 * Ordem de exibição no seletor: estética primeiro, por ser o uso corrente do sistema.
 * Os dois anteriores continuam disponíveis — há casos gravados com eles.
 */
export const CASE_TYPE_OPTIONS: CaseType[] = ['estetica', 'trauma', 'queimadura'];
