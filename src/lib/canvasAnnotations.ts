// Distinção entre o que o usuário desenhou e o que o sistema desenhou, no canvas do Fabric.

import type { FabricObject } from 'fabric';
import type { VersionFrame } from '@/lib/versionState';

/**
 * O objeto é uma anotação do usuário (e não estrutura do canvas)?
 *
 * Este critério estava copiado em três lugares, e não nos mesmos termos: os filtros de
 * desfazer e limpar excluíam `grid_`, `mesh_` e a imagem de fundo, mas não `mediapipe_`
 * nem `face_roi`. O efeito era limpar o canvas apagando junto a malha detectada, e
 * desfazer remover um ponto da malha em vez da última marcação. Salvar com um critério e
 * restaurar com outro perderia objetos do mesmo jeito, então o critério passa a ser um só.
 */
const CANVAS_STRUCTURE_PREFIXES = ['grid_', 'mesh_', 'mediapipe_'];

export function isAnnotationObject(object: FabricObject): boolean {
  const name = (object as FabricObject & { customName?: string }).customName;
  if (!name) return true;
  if (name === 'backgroundImage' || name === 'face_roi') return false;
  return !CANVAS_STRUCTURE_PREFIXES.some(prefix => name.startsWith(prefix));
}


/**
 * Recoloca um objeto restaurado no quadro atual da foto.
 *
 * O canvas do Fabric tem o tamanho do contêiner, então a mesma coordenada cai sobre um
 * ponto diferente do rosto quando a janela muda de tamanho. A conversão preserva a posição
 * RELATIVA à foto — é o que faz uma marcação sobre o lábio continuar sobre o lábio numa
 * tela menor. Escala junto, senão o traço mudaria de espessura aparente em relação ao rosto.
 */
export function repositionForFrame(object: FabricObject, from: VersionFrame, to: VersionFrame): void {
  const ratioX = to.width / from.width;
  const ratioY = to.height / from.height;

  object.set({
    left: to.left + ((object.left ?? 0) - from.left) * ratioX,
    top: to.top + ((object.top ?? 0) - from.top) * ratioY,
    scaleX: (object.scaleX ?? 1) * ratioX,
    scaleY: (object.scaleY ?? 1) * ratioY,
  });
  object.setCoords();
}
