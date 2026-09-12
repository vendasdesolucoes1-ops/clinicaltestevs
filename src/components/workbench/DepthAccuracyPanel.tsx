// Confere, com as fotos do próprio caso, se a profundidade que o sistema usa é deste
// paciente ou um molde genérico. A conta e as imagens ficam no navegador.
//
// Por que isto existe: toda a ferramenta óssea repousa sobre o `z` estimado de UMA foto.
// Ele já foi medido como repetível a cerca de 1 mm entre variações da mesma imagem — o
// que não diz nada sobre estar certo. Ver `depthAccuracy.ts`.

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectFaceLandmarks } from '@/lib/faceLandmarker';
import { measureDepthAccuracy, type DepthAccuracyResult } from '@/lib/depthAccuracy';

export interface DepthAccuracyPhoto {
  id: string;
  angle?: string;
  url: string;
}

interface DepthAccuracyPanelProps {
  photos?: DepthAccuracyPhoto[];
}

type State =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: DepthAccuracyResult }
  | { status: 'error'; message: string };

// Acima disto a escala estimada está longe demais do observado para se chamar acerto.
const SCALE_TOLERANCE = 0.15;
// Resíduo de forma, como fração do relevo observado, a partir do qual a forma do perfil
// diverge o bastante para que um fator de escala não resolva.
const SHAPE_TOLERANCE = 0.12;
// Discordância entre as proporções verticais das duas fotos que denuncia inclinação de
// cabeça diferente entre elas.
const TILT_TOLERANCE = 0.08;

export function DepthAccuracyPanel({ photos = [] }: DepthAccuracyPanelProps) {
  const [state, setState] = useState<State>({ status: 'idle' });

  const pair = useMemo(() => {
    const frontal = photos.find(photo => photo.angle === 'frente');
    const profile = photos.find(photo => photo.angle === 'perfil_d' || photo.angle === 'perfil_e');
    return frontal && profile ? { frontal, profile } : null;
  }, [photos]);

  const run = useCallback(async () => {
    if (!pair) return;
    setState({ status: 'running' });

    try {
      // As duas fotos são detectadas de novo, em vez de reaproveitar a análise aberta:
      // assim a medição não depende de qual foto está selecionada na tela.
      const [frontal, profile] = await Promise.all([
        detectFaceLandmarks(pair.frontal.url),
        detectFaceLandmarks(pair.profile.url),
      ]);

      const result = measureDepthAccuracy({
        frontal: frontal.points,
        profile: profile.points,
      });

      if (!result) {
        setState({
          status: 'error',
          message: 'Não há pontos suficientes na linha média das duas fotos para medir.',
        });
        return;
      }

      setState({ status: 'done', result });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Falha ao processar as fotos.',
      });
    }
  }, [pair]);

  if (!pair) {
    return (
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Requer uma foto de <strong className="text-foreground">frente</strong> e uma de{' '}
        <strong className="text-foreground">perfil</strong> no mesmo caso. De lado, a
        profundidade do rosto deita no plano da imagem e deixa de ser estimada — é a única
        forma de conferir a que o sistema usa.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Compara a profundidade que o sistema estima na foto de frente com a que a foto de
        perfil mostra de verdade. As imagens não saem deste navegador.
      </p>

      <Button
        variant="outline"
        size="sm"
        className="w-full h-8 gap-1.5"
        onClick={run}
        disabled={state.status === 'running'}
      >
        {state.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Ruler className="h-3.5 w-3.5" />
        )}
        <span className="text-xs">
          {state.status === 'running' ? 'Medindo…' : 'Medir profundidade'}
        </span>
      </Button>

      {state.status === 'error' && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">{state.message}</p>
        </div>
      )}

      {state.status === 'done' && <DepthAccuracyReport result={state.result} />}
    </div>
  );
}

/**
 * Os dois números dizem coisas diferentes, e a diferença é o ponto todo:
 * a escala é erro corrigível por um fator, o resíduo é erro de forma.
 */
function DepthAccuracyReport({ result }: { result: DepthAccuracyResult }) {
  // Sem um perfil de verdade não há o que comparar, e um laudo aqui seria pior que
  // nenhum: os números saem confiantes e errados.
  if (result.profileLooksFrontal) {
    return (
      <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/20">
        <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          A foto guardada como perfil <strong className="text-foreground">não parece um
          perfil</strong>: a silhueta do rosto quase não se espalha na horizontal, o que é o
          que se vê numa foto de frente. Confira se a imagem certa está no campo de perfil —
          sem ela não há profundidade observável para comparar.
        </p>
      </div>
    );
  }

  const scaleOff = Math.abs(result.scale - 1);
  const scaleOk = scaleOff <= SCALE_TOLERANCE;
  const shapeOk = result.residualFraction <= SHAPE_TOLERANCE;
  const percentOff = Math.round(scaleOff * 100);

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-border p-2 space-y-1.5">
        <Row
          label="Escala da profundidade"
          value={`${result.scale.toFixed(2)}×`}
          ok={scaleOk}
          note={
            scaleOk
              ? 'A projeção estimada bate com a observada.'
              : result.scale > 1
                ? `A projeção real é ${percentOff}% MAIOR do que o sistema estima.`
                : `A projeção real é ${percentOff}% MENOR do que o sistema estima.`
          }
        />
        <Row
          label="Erro de forma"
          value={`${result.residualMm.toFixed(1)} mm`}
          ok={shapeOk}
          note={`${Math.round(result.residualFraction * 100)}% do relevo observado, depois de corrigir a escala.`}
        />
        <Row
          label="Relevo observado"
          value={`${result.observedReliefMm.toFixed(0)} mm`}
          note={`Medido em ${result.pointCount} pontos da linha média.`}
        />
      </div>

      <div className="flex items-start gap-2 p-2 rounded-md bg-muted/40 border border-border">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {scaleOk && shapeOk ? (
            <>
              A profundidade de uma foto <strong className="text-foreground">serve</strong>:
              escala e forma batem com o perfil. Fundir as vistas acrescentaria pouco.
            </>
          ) : !shapeOk ? (
            <>
              A <strong className="text-foreground">forma</strong> do perfil estimado diverge da
              real, e isso nenhum fator de escala conserta — é o caso em que fundir as duas
              vistas agrega de verdade.
            </>
          ) : (
            <>
              A forma do perfil está certa; o que erra é a{' '}
              <strong className="text-foreground">escala</strong>. Erro sistemático como esse se
              corrige com um fator, sem precisar reconstruir nada.
            </>
          )}
        </p>
      </div>

      {!result.millimetresAreCalibrated && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Milímetros calculados sobre uma altura násio–mento de 120 mm, que é média de adulto e
          não medida deste paciente. A escala e a porcentagem acima não dependem disso.
        </p>
      )}

      {result.verticalMismatch > TILT_TOLERANCE && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            As duas fotos discordam em {Math.round(result.verticalMismatch * 100)}% sobre as
            proporções verticais do rosto, o que quase sempre é inclinação de cabeça diferente
            entre elas. A medição continua válida em ordem de grandeza, mas perde precisão —
            refazer as fotos com a cabeça no mesmo plano melhora o número.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, ok, note }: { label: string; value: string; ok?: boolean; note: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1">
          {ok === true && <Check className="h-3 w-3 text-success" />}
          {ok === false && <AlertTriangle className="h-3 w-3 text-warning" />}
          <span className="text-xs font-mono text-foreground">{value}</span>
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{note}</p>
    </div>
  );
}
