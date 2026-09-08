// WorkbenchHeader - Top navigation bar for the workbench
import { Link } from 'react-router-dom';
import { 
  ChevronRight, 
  Image, 
  CheckCircle2,
  Layers,
  Box,
  GitCompare,
  Keyboard,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { EXPERIMENTAL_USE_NOTICE } from '@/lib/config';
import type { ClinicalCase, CaseVersion, CasePhoto } from '@/lib/mockData';

type ViewMode = '2d' | '3d' | 'compare';

interface WorkbenchHeaderProps {
  caseData: ClinicalCase;
  selectedVersion: CaseVersion | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  // O seletor identifica a foto pelo id: a URL de exibição é uma signed URL efêmera
  // (bucket privado), então não serve como chave estável.
  currentPhotoId?: string;
  onPhotoSelect: (url: string, photo: CasePhoto) => void;
  analyzedPhotoIds: Set<string>;
  canCompare: boolean;
}

const KEYBOARD_SHORTCUTS = [
  { key: '1-7', action: 'Trocar ferramenta' },
  { key: 'Z', action: 'Desfazer' },
  { key: 'Shift+Z', action: 'Refazer' },
  { key: 'Space', action: 'Segurar para pan' },
  { key: 'Esc', action: 'Desselecionar' },
  { key: 'Delete', action: 'Remover selecionado' },
];

export function WorkbenchHeader({
  caseData,
  selectedVersion,
  viewMode,
  onViewModeChange,
  currentPhotoId,
  onPhotoSelect,
  analyzedPhotoIds,
  canCompare,
}: WorkbenchHeaderProps) {
  return (
    <div className="h-12 border-b border-border px-4 flex items-center justify-between bg-card shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link 
          to="/cases" 
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Casos
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-foreground font-medium">{caseData.codename}</span>
        {selectedVersion && (
          <>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className={cn(
              "font-medium",
              selectedVersion.type === 'A' ? "text-version-a" :
              selectedVersion.type === 'B' ? "text-version-b" :
              "text-foreground"
            )}>
              {selectedVersion.name}
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Photo Selector */}
        {caseData.photos.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Select
                  value={currentPhotoId ?? ''}
                  onValueChange={(photoId) => {
                    const photo = caseData.photos.find(p => p.id === photoId);
                    if (photo) onPhotoSelect(photo.url, photo);
                  }}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <Image className="h-3.5 w-3.5 mr-2" />
                    <SelectValue placeholder="Selecionar foto" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    {caseData.photos.map((photo) => (
                      <SelectItem key={photo.id} value={photo.id} className="text-xs">
                        <span className="flex items-center gap-2">
                          {photo.angle === 'frente' ? 'Frente' :
                           photo.angle === 'perfil_d' ? 'Perfil Direito' :
                           photo.angle === 'perfil_e' ? 'Perfil Esquerdo' :
                           photo.angle === 'tres_quartos' ? '3/4' : photo.angle}
                          {analyzedPhotoIds.has(photo.id) && (
                            <CheckCircle2 className="h-3 w-3 text-success" />
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Selecione uma foto para trabalhar. ✓ indica análise existente.
            </TooltipContent>
          </Tooltip>
        )}


        {/* View Mode Tabs */}
        <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as ViewMode)}>
          <TabsList className="h-8">
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="2d" className="text-xs gap-1.5 px-3">
                  <Layers className="h-3.5 w-3.5" />
                  2D
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>Visualização 2D com mesh e ferramentas de edição</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="3d" className="text-xs gap-1.5 px-3">
                  <Box className="h-3.5 w-3.5" />
                  3D
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>Visualização 3D do mesh facial</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger 
                  value="compare" 
                  className="text-xs gap-1.5 px-3"
                  disabled={!canCompare}
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  Comparar
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {canCompare 
                  ? 'Comparar versões lado a lado' 
                  : 'Crie versões A ou B para comparar'}
              </TooltipContent>
            </Tooltip>
          </TabsList>
        </Tabs>

        {/* PR-1: aviso permanente de uso experimental (sistema não registrado como SaMD) */}
        <Tooltip>
          {/* Badge não encaminha ref: o span existe para o asChild do Tooltip ancorar,
              mesmo padrão já usado no seletor de fotos acima. */}
          <TooltipTrigger asChild>
            <span>
              <Badge
                variant="outline"
                className="h-8 gap-1.5 px-2 text-xs font-normal border-warning/40 text-warning cursor-help"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Experimental
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {EXPERIMENTAL_USE_NOTICE}
          </TooltipContent>
        </Tooltip>

        {/* Help Dialog */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Keyboard className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Atalhos de Teclado</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              {KEYBOARD_SHORTCUTS.map((shortcut) => (
                <div key={shortcut.key} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{shortcut.action}</span>
                  <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
