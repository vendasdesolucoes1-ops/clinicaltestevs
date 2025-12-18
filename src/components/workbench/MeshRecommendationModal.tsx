import { Brain, Check, Sparkles, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { type MeshRecommendation } from '@/hooks/useMeshRecommendation';
import { type MeshDensity, MESH_PRESETS } from '@/types/facialLandmarks';
import { cn } from '@/lib/utils';

interface MeshRecommendationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recommendation: MeshRecommendation | null;
  isLoading: boolean;
  onApply: (density: MeshDensity) => void;
  onManualAdjust: () => void;
}

const FOCUS_AREA_LABELS: Record<string, string> = {
  olho_esquerdo: 'Olho Esquerdo',
  olho_direito: 'Olho Direito',
  nariz: 'Nariz',
  boca: 'Boca',
  bochecha_esquerda: 'Bochecha Esquerda',
  bochecha_direita: 'Bochecha Direita',
  testa: 'Testa',
  queixo: 'Queixo',
  face_completa: 'Face Completa',
  regiao_periorbital: 'Região Periorbital',
  regiao_perioral: 'Região Perioral',
  face: 'Face',
  estrutura_ossea: 'Estrutura Óssea',
};

export function MeshRecommendationModal({
  open,
  onOpenChange,
  recommendation,
  isLoading,
  onApply,
  onManualAdjust,
}: MeshRecommendationModalProps) {
  const handleApply = () => {
    if (!recommendation) return;
    onApply(recommendation.recommended);
    onOpenChange(false);
  };

  const handleSelectPreset = (preset: MeshDensity) => {
    onApply(preset);
    onOpenChange(false);
  };

  const handleManualAdjust = () => {
    onManualAdjust();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Auto-Mesh IA
          </DialogTitle>
          <DialogDescription>
            Análise inteligente para determinar a densidade ideal de mesh facial.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analisando imagem com GPT-4 Vision...</p>
          </div>
        ) : recommendation ? (
          <div className="space-y-4">
            {/* Confidence */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confiança da análise</span>
                <span className="font-medium">{Math.round(recommendation.confidence * 100)}%</span>
              </div>
              <Progress value={recommendation.confidence * 100} className="h-2" />
            </div>

            {/* Preset Selection Grid */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Selecione a densidade do mesh</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MESH_PRESETS) as MeshDensity[]).map((preset) => {
                  const config = MESH_PRESETS[preset];
                  const isRecommended = recommendation.recommended === preset;
                  return (
                    <button
                      key={preset}
                      onClick={() => handleSelectPreset(preset)}
                      className={cn(
                        "relative p-3 rounded-lg border text-left transition-all",
                        "hover:border-primary hover:bg-primary/5",
                        isRecommended 
                          ? "border-primary bg-primary/10 ring-2 ring-primary/20" 
                          : "border-border bg-card"
                      )}
                    >
                      {isRecommended && (
                        <Badge 
                          variant="default" 
                          className="absolute -top-2 -right-2 text-[10px] px-1.5 py-0"
                        >
                          <Sparkles className="h-3 w-3 mr-0.5" />
                          IA
                        </Badge>
                      )}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{config.icon}</span>
                        <span className="font-medium text-sm">{config.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mb-1">
                        {config.points} pontos
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        {config.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reasoning */}
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Justificativa da IA</p>
              <p className="text-sm">{recommendation.reasoning}</p>
            </div>

            {/* Focus Areas */}
            {recommendation.focusAreas.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Áreas de foco</p>
                <div className="flex flex-wrap gap-1.5">
                  {recommendation.focusAreas.map((area) => (
                    <Badge key={area} variant="secondary" className="text-xs">
                      {FOCUS_AREA_LABELS[area] || area.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleApply} className="flex-1">
                <Check className="h-4 w-4 mr-1.5" />
                Aplicar Recomendação
              </Button>
              <Button variant="outline" onClick={handleManualAdjust}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <p>Clique em "Auto-Mesh IA" para analisar a imagem.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
