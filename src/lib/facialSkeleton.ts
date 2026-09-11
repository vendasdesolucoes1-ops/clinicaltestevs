// Regiões ósseas da face, para a ferramenta de modelar osso.
//
// DIFERENÇA PARA `facialAnchors.ts`: lá as regiões RESISTEM ao deslocamento, porque a
// pele desliza sobre um esqueleto parado. Aqui é o contrário — a região é o que se move,
// e a pele por cima acompanha. Usar a ancoragem da pele numa manobra óssea travaria
// justamente o que deveria andar: numa mentoplastia o contorno mandibular é o objetivo.
//
// O MediaPipe publica agrupamentos prontos para olhos, lábios, sobrancelhas e contorno,
// mas não para o mento — não existe `FACE_LANDMARKS_CHIN`. O conjunto abaixo foi
// DERIVADO, não escolhido a dedo, por três critérios anatômicos aplicados sobre os
// landmarks de uma foto real e depois congelado:
//
//   1. abaixo do ponto mais baixo do lábio (o sulco mentolabial é o limite superior);
//   2. dentro do polígono do contorno facial;
//   3. dentro de 1,15x a meia-largura da boca a partir da linha média — a eminência
//      mentual tem aproximadamente a largura da boca, e esse limite é o que separa o
//      mento do corpo da mandíbula.
//
// Congelar é correto: os índices do MediaPipe são topológicos, não geométricos. O ponto
// 152 é o mento em qualquer rosto, então o conjunto derivado de uma foto vale para todas.
// Verificado visualmente sobre a foto de referência antes de fixar.

export type BoneRegion = 'mento';

export const BONE_REGION_LABELS: Record<BoneRegion, string> = {
  mento: 'Mento',
};

export const BONE_REGION_HINTS: Record<BoneRegion, string> = {
  mento: 'Eminência mentual. Avanço, recuo e deslocamento vertical — mentoplastia.',
};

const MENTO_INDICES: readonly number[] = [
  18, 32, 83, 140, 148, 149, 150, 152, 170, 171, 175, 176, 182, 194, 199, 200, 201, 204,
  208, 211, 262, 313, 369, 377, 378, 379, 394, 395, 396, 400, 406, 418, 421, 428, 431,
];

const REGION_INDICES: Record<BoneRegion, readonly number[]> = {
  mento: MENTO_INDICES,
};

export function getBoneRegionIndices(region: BoneRegion): readonly number[] {
  return REGION_INDICES[region];
}

/**
 * Distância, medida pela pele, em que o deslocamento do bloco se dissolve no tecido
 * vizinho.
 *
 * Não é o tamanho da região: é a largura da TRANSIÇÃO a partir da borda dela. Zero
 * produziria um degrau visível no limite do osso; valor alto espalha a manobra por meia
 * face. 0,05 em coordenadas normalizadas fica na ordem de grandeza do raio padrão da
 * ferramenta de pele (0,08), que é a escala de uma sub-região facial.
 */
export const DEFAULT_DRAPE = 0.05;

/**
 * Quanto do deslocamento ósseo a pele por cima reproduz, por landmark.
 *
 * Hoje ninguém preenche: a superfície acompanha o osso integralmente, e `computeBoneShift`
 * aceita o parâmetro como ponto de entrada para o nível 2 — espessura de tecido mole
 * variável, coxim adiposo malar — sem alterar o motor.
 *
 * TENTATIVA DESCARTADA, registrada para não ser refeita. Medido numa foto real, com a
 * transição padrão o vermelhão inferior acompanhava 89% do deslocamento do mento. Parecia
 * demais, e amortecer só os lábios derrubou o número para 31% — mas PIOROU a imagem: um
 * fator por estrutura é um degrau, e um degrau sobre um bloco rígido abre uma fenda na
 * borda, rasgando o tecido entre o lábio segurado e o queixo que desce. Amortecer só
 * funciona se o fator for graduado com a distância, como a própria atenuação; é isso que
 * a diferenciação de tecido do nível 2 vai precisar resolver.
 *
 * Vale notar o que a geodésica já resolve sozinha: o lábio SUPERIOR fica em 0% em
 * qualquer transição, porque o caminho pela pele não atravessa a abertura da boca.
 */
export const DEFAULT_DRAPE_FOLLOW = 1;
