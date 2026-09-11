// Regiões ósseas da face, para a ferramenta de modelar osso.
//
// DIFERENÇA PARA `facialAnchors.ts`: lá as regiões RESISTEM ao deslocamento, porque a
// pele desliza sobre um esqueleto parado. Aqui é o contrário — a região é o que se move,
// e a pele por cima acompanha. Usar a ancoragem da pele numa manobra óssea travaria
// justamente o que deveria andar: numa mentoplastia o contorno mandibular é o objetivo.
//
// O MediaPipe publica agrupamentos prontos para olhos, lábios, sobrancelhas e contorno —
// e nenhum para osso. Não existe `FACE_LANDMARKS_CHIN` nem equivalente. Os conjuntos
// abaixo foram DERIVADOS, não escolhidos a dedo, e depois congelados.
//
// Congelar é correto porque os índices do MediaPipe são TOPOLÓGICOS, não geométricos: o
// ponto 152 é o mento em qualquer rosto. Um conjunto derivado de uma foto vale para todas.
//
// DOIS MÉTODOS DE DERIVAÇÃO, por motivos diferentes:
//
// 1. O MENTO veio de critério de coordenadas — abaixo do sulco mentolabial, dentro do
//    contorno facial, dentro de 1,15x a meia-largura da boca. Funciona porque o mento é
//    delimitado por referências que existem como coordenada.
//
// 2. AS DEMAIS vieram de CRESCIMENTO POR NÚMERO DE ARESTAS a partir de sementes
//    verificadas na imagem (o landmark 425 cai sobre a eminência malar, o 288 sobre o
//    ângulo da mandíbula, e assim por diante). O motivo de contar arestas em vez de medir
//    distância é simetria: a topologia da malha é exatamente simétrica, então sementes que
//    são pares espelhados produzem regiões que são espelhos exatos, INDEPENDENTE de quão
//    assimétrico seja o rosto de referência. Com distância ponderada isso não vale — os
//    pesos são as distâncias reais daquele rosto, e os dois lados divergem. Medido: pelo
//    método ponderado, malar esquerdo saía com 21 pontos e o direito com 20.
//
// Numa ferramenta de estética, regiões esquerda e direita de tamanhos diferentes
// introduziriam assimetria no próprio instrumento. Daí o cuidado.
//
// AS REGIÕES SE TOCAM NAS BORDAS (o rádix é do dorso e da glabela; o ângulo mandibular
// encosta no mento). É anatomicamente correto — ossos adjacentes compartilham limites —
// mas significa que mover duas regiões vizinhas desloca duas vezes os pontos comuns.
//
// Todas verificadas visualmente sobre uma foto real antes de fixar.

export type BoneRegion =
  | 'mento'
  | 'dorso_nasal'
  | 'malar_e'
  | 'malar_d'
  | 'gonio_e'
  | 'gonio_d'
  | 'glabela';

export const BONE_REGION_LABELS: Record<BoneRegion, string> = {
  mento: 'Mento',
  dorso_nasal: 'Dorso nasal',
  malar_e: 'Malar E',
  malar_d: 'Malar D',
  gonio_e: 'Mandíbula E',
  gonio_d: 'Mandíbula D',
  glabela: 'Glabela',
};

export const BONE_REGION_HINTS: Record<BoneRegion, string> = {
  mento: 'Eminência mentual. Avanço, recuo e deslocamento vertical — mentoplastia.',
  dorso_nasal: 'Dorso do nariz, do rádix à ponta. Redução de giba — a manobra que mais aparece no perfil.',
  malar_e: 'Eminência malar esquerda (lado do paciente). Projeção do terço médio.',
  malar_d: 'Eminência malar direita (lado do paciente). Projeção do terço médio.',
  gonio_e: 'Ângulo e ramo mandibular esquerdos. Definição do contorno posterior.',
  gonio_d: 'Ângulo e ramo mandibular direitos. Definição do contorno posterior.',
  glabela: 'Glabela e arco supraorbitário. Projeção da fronte entre os supercílios.',
};

const MENTO_INDICES: readonly number[] = [
  18, 32, 83, 140, 148, 149, 150, 152, 169, 170, 171, 175, 176, 182, 194, 199, 200, 201, 204,
  208, 211, 262, 313, 369, 377, 378, 379, 394, 395, 396, 400, 406, 418, 421, 424, 428, 431,
];

// Do rádix à ponta. É o bloco que uma redução de giba desloca.
const DORSO_NASAL_INDICES: readonly number[] = [
  1, 3, 4, 5, 6, 8, 44, 45, 51, 122, 168, 193, 195, 196, 197, 248, 274, 275, 281, 351, 417, 419,
];

const MALAR_E_INDICES: readonly number[] = [
  266, 280, 329, 330, 346, 347, 348, 349, 352, 371, 411, 423, 425, 426, 427, 436,
];

const MALAR_D_INDICES: readonly number[] = [
  36, 50, 100, 101, 117, 118, 119, 120, 123, 142, 187, 203, 205, 206, 207, 216,
];

const GONIO_E_INDICES: readonly number[] = [
  288, 323, 352, 361, 364, 365, 366, 367, 376, 379, 394, 397, 401, 411, 416, 433, 434, 435,
];

const GONIO_D_INDICES: readonly number[] = [
  58, 93, 123, 132, 135, 136, 137, 138, 147, 150, 169, 172, 177, 187, 192, 213, 214, 215,
];

const GLABELA_INDICES: readonly number[] = [
  8, 9, 55, 65, 66, 69, 107, 108, 151, 168, 189, 193, 221, 285, 295, 296, 299, 336, 337,
  413, 417, 441,
];

const REGION_INDICES: Record<BoneRegion, readonly number[]> = {
  mento: MENTO_INDICES,
  dorso_nasal: DORSO_NASAL_INDICES,
  malar_e: MALAR_E_INDICES,
  malar_d: MALAR_D_INDICES,
  gonio_e: GONIO_E_INDICES,
  gonio_d: GONIO_D_INDICES,
  glabela: GLABELA_INDICES,
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
