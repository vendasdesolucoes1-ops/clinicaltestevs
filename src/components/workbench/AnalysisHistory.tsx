import { useState, useEffect } from 'react';
import { Clock, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface AnalysisRecord {
  id: string;
  photo_id: string;
  created_at: string;
  updated_at: string;
  symmetry_score: number | null;
  points: any;
  face_roi: any;
  midline_points: string[] | null;
  custom_connections: any;
  photo_angle?: string;
}

interface AnalysisHistoryProps {
  caseId: string;
  onLoadAnalysis: (analysis: {
    points: any;
    faceROI: any;
    midlinePoints: string[];
    customConnections: any;
  }) => void;
  className?: string;
}

const ANGLE_LABELS: Record<string, string> = {
  frente: 'Frente',
  perfil_d: 'Perfil D',
  perfil_e: 'Perfil E',
  tres_quartos: '3/4',
};

export function AnalysisHistory({ caseId, onLoadAnalysis, className }: AnalysisHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!caseId || !isOpen) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        // Fetch analyses with photo info
        const { data, error } = await supabase
          .from('facial_analyses')
          .select(`
            id,
            photo_id,
            created_at,
            updated_at,
            symmetry_score,
            points,
            face_roi,
            midline_points,
            custom_connections,
            case_photos!inner(angle)
          `)
          .eq('case_id', caseId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Erro ao carregar histórico:', error);
          return;
        }

        const mappedData: AnalysisRecord[] = (data || []).map(item => ({
          id: item.id,
          photo_id: item.photo_id,
          created_at: item.created_at,
          updated_at: item.updated_at,
          symmetry_score: item.symmetry_score,
          points: item.points,
          face_roi: item.face_roi,
          midline_points: item.midline_points,
          custom_connections: item.custom_connections,
          photo_angle: (item.case_photos as any)?.angle,
        }));

        setAnalyses(mappedData);
      } catch (err) {
        console.error('Erro ao carregar histórico:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [caseId, isOpen]);

  const handleLoadAnalysis = (analysis: AnalysisRecord) => {
    onLoadAnalysis({
      points: analysis.points || [],
      faceROI: analysis.face_roi,
      midlinePoints: analysis.midline_points || [],
      customConnections: analysis.custom_connections || [],
    });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-between h-8 px-2 text-xs"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            Histórico de Análises
          </span>
          {isOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-2">
        <ScrollArea className="h-[200px] rounded-md border border-border bg-muted/30">
          {isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Carregando...
            </div>
          ) : analyses.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Nenhuma análise anterior encontrada
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {analyses.map((analysis) => (
                <button
                  key={analysis.id}
                  onClick={() => handleLoadAnalysis(analysis)}
                  className={cn(
                    "w-full p-2 rounded-md text-left transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    "border border-transparent hover:border-border"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {ANGLE_LABELS[analysis.photo_angle || ''] || analysis.photo_angle}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {format(new Date(analysis.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {analysis.symmetry_score !== null && (
                      <Badge 
                        variant={analysis.symmetry_score >= 70 ? "default" : "destructive"}
                        className="text-[10px] shrink-0"
                      >
                        {analysis.symmetry_score.toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {Array.isArray(analysis.points) ? analysis.points.length : 0} pontos detectados
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}
