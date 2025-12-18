import { useState } from 'react';
import { Brain, Check, Sparkles, Target, Loader2 } from 'lucide-react';
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
import { type MeshDensity } from '@/types/facialLandmarks';

interface MeshRecommendationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recommendation: MeshRecommendation | null;
  isLoading: boolean;
  onApply: (density2D: MeshDensity, density3D: 'rapido' | 'balanceado' | 'maximo') => void;
  onManualAdjust: () => void;
}

const DENSITY_2D_LABELS: Record<string, { label: string; description: string; points: number }> = {
  simple: { label: 'Simples', description: 'Análise rápida', points: 24 },
  dense: { label: 'Denso', description: 'Análise detalhada', points: 114 },
};

const DENSITY_3D_LABELS: Record<string, { label: string; description: string }> = {
  rapido: { label: 'Rápido', description: 'Menor precisão, mais velocidade' },
  balanceado: { label: 'Balanceado', description: 'Equilíbrio ideal' },
  maximo: { label: 'Máximo', description: 'Máxima precisão (468 pts)' },
};

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
    onApply(recommendation.recommended2D, recommendation.recommended3D);
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

            {/* Recommendations */}
            <div className="grid grid-cols-2 gap-3">
              {/* 2D Density */}
              <div className="p-3 rounded-lg border bg-card space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  Mesh 2D
                </div>
                <p className="font-medium">
                  {DENSITY_2D_LABELS[recommendation.recommended2D]?.label || recommendation.recommended2D}
                </p>
                <p className="text-xs text-muted-foreground">
                  {DENSITY_2D_LABELS[recommendation.recommended2D]?.points} pontos
                </p>
              </div>

              {/* 3D Density */}
              <div className="p-3 rounded-lg border bg-card space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Target className="h-3 w-3" />
                  Mesh 3D
                </div>
                <p className="font-medium">
                  {DENSITY_3D_LABELS[recommendation.recommended3D]?.label || recommendation.recommended3D}
                </p>
                <p className="text-xs text-muted-foreground">
                  {DENSITY_3D_LABELS[recommendation.recommended3D]?.description}
                </p>
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
                      {FOCUS_AREA_LABELS[area] || area}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleApply} className="flex-1">
                <Check className="h-4 w-4 mr-1.5" />
                Aplicar
              </Button>
              <Button variant="outline" onClick={handleManualAdjust} className="flex-1">
                Ajustar Manual
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
