// Composição da imagem que sai do sistema.
//
// Em estética o entregável não é a simulação na tela: é o arquivo que o paciente leva e
// reencaminha. Ele precisa carregar, sozinho, a informação de que é uma simulação — porque
// vai ser visto fora do contexto em que foi gerado, por quem não estava na consulta.
//
// Duas marcas, com papéis diferentes:
//
//   - a faixa de rodapé é a legível: diz o que é, de quem é e de quando é;
//   - a marca d'água diagonal repetida é a que SOBREVIVE A RECORTE. Um rodapé se corta com
//     dois cliques; uma marca que atravessa a imagem inteira, não.

export interface ExportOptions {
  /** Imagem já renderizada da simulação. */
  image: HTMLImageElement | HTMLCanvasElement;
  /** Identificação do caso, como aparece no sistema. */
  caseName: string;
  versionName?: string;
  date?: Date;
}

const DISCLAIMER = 'SIMULAÇÃO — não constitui promessa de resultado';
const WATERMARK_TEXT = 'SIMULAÇÃO';

function formatDate(date: Date, withTime: boolean): string {
  const day = date.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  if (!withTime) return day;
  return `${day}, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Variantes da identificação, da mais completa para a mais enxuta.
 *
 * Em foto estreita os dois textos não cabem. Cortar caractere a caractere deixava um "…"
 * colado no fim do aviso, o que fazia parecer que O AVISO tinha sido cortado — pior que
 * não mostrar nada. Então a identificação perde partes inteiras, na ordem em que fazem
 * menos falta, e some por último. O aviso nunca encolhe nem é cortado.
 */
function identificationVariants(caseName: string, versionName: string | undefined, date: Date): string[] {
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join('  ·  ');
  return [
    join(caseName, versionName, formatDate(date, true)),
    join(caseName, versionName, formatDate(date, false)),
    join(caseName, formatDate(date, false)),
    caseName,
    '',
  ];
}

/**
 * Marca d'água diagonal repetida sobre toda a imagem.
 *
 * Opacidade baixa o bastante para não atrapalhar a leitura do resultado, alta o bastante
 * para permanecer legível se a imagem for recomprimida ou recortada.
 */
function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const fontSize = Math.max(16, Math.round(width * 0.045));
  const stepX = fontSize * 11;
  const stepY = fontSize * 6;
  // A diagonal precisa cobrir a imagem inteira mesmo rotacionada: o alcance é a soma dos
  // lados, não o maior deles.
  const reach = width + height;

  ctx.save();
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-30 * Math.PI) / 180);

  // Preenchimento claro com contorno escuro: só o branco desaparecia sobre roupa escura
  // ou cabelo, e a marca que some não cumpre função nenhuma. O par claro/escuro mantém a
  // legibilidade sobre qualquer fundo sem escurecer a imagem.
  ctx.lineWidth = Math.max(1, fontSize * 0.05);

  for (let y = -reach; y <= reach; y += stepY) {
    for (let x = -reach; x <= reach; x += stepX) {
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(WATERMARK_TEXT, x, y);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(WATERMARK_TEXT, x, y);
    }
  }
  ctx.restore();
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  imageHeight: number,
  footerHeight: number,
  baseFontSize: number,
  variants: string[],
): void {
  const padding = Math.round(baseFontSize * 1.1);

  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, imageHeight, width, footerHeight);
  ctx.textBaseline = 'middle';

  const middle = imageHeight + footerHeight / 2;
  const available = width - padding * 3;

  // Os dois textos disputam a mesma faixa, e em foto estreita eles se sobrepunham no meio.
  // O corpo diminui até caberem os dois; se ainda assim não couber, a identificação é
  // encurtada — o aviso é o que não pode ser cortado.
  const fonts = (size: number) => ({
    left: `600 ${size}px system-ui, -apple-system, sans-serif`,
    right: `400 ${Math.round(size * 0.9)}px system-ui, -apple-system, sans-serif`,
  });

  // Duas concessões, nesta ordem: primeiro o corpo diminui, até um piso legível, para
  // tentar manter a identificação inteira; só se ainda não couber é que ela perde partes.
  const widths = (size: number, text: string) => {
    const applied = fonts(size);
    ctx.font = applied.left;
    const left = ctx.measureText(DISCLAIMER).width;
    ctx.font = applied.right;
    return { left, right: ctx.measureText(text).width };
  };

  let fontSize = baseFontSize;
  const minimum = 11;
  const fullest = variants[0] ?? '';
  for (;;) {
    const { left, right } = widths(fontSize, fullest);
    if (left + right <= available || fontSize <= minimum) break;
    fontSize -= 1;
  }

  const applied = fonts(fontSize);
  const leftWidth = widths(fontSize, '').left;

  ctx.font = applied.right;
  const identification =
    variants.find(text => !text || leftWidth + ctx.measureText(text).width <= available) ?? '';

  ctx.font = applied.left;
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'left';
  ctx.fillText(DISCLAIMER, padding, middle);

  if (identification) {
    ctx.font = applied.right;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(identification, width - padding, middle);
  }
  ctx.restore();
}

/** Devolve a imagem composta como data URL PNG. */
export function renderExport({
  image,
  caseName,
  versionName,
  date = new Date(),
}: ExportOptions): string {
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;

  // Quem limita o texto é a LARGURA, não a altura. Dimensionar a faixa pela altura fazia
  // a tipografia crescer em foto retrato até o aviso ocupar a linha inteira, e a
  // identificação era descartada por falta de espaço — numa foto de celular sobrava só o
  // nome do caso, sem data nem versão. Agora a fonte sai da largura e a faixa segue a
  // fonte; o piso mantém a legibilidade em recorte pequeno.
  const fontSize = Math.max(13, Math.round(width * 0.026));
  const footerHeight = Math.max(48, Math.round(fontSize * 2.6));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height + footerHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(image, 0, 0, width, height);
  drawWatermark(ctx, width, height);

  drawFooter(
    ctx,
    width,
    height,
    footerHeight,
    fontSize,
    identificationVariants(caseName, versionName, date),
  );

  return canvas.toDataURL('image/png');
}
