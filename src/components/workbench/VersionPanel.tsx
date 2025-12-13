import { 
  GitBranch, 
  Plus, 
  Copy, 
  RotateCcw, 
  Download,
  Clock,
  User,
  Check,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { type ClinicalCase, type CaseVersion } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VersionPanelProps {
  caseData: ClinicalCase;
  selectedVersion: CaseVersion | null;
  onSelectVersion: (version: CaseVersion) => void;
  onCreateVersion: (type: 'A' | 'B') => void;
}

function VersionStatusIcon({ status }: { status: CaseVersion['status'] }) {
  switch (status) {
    case 'pronto':
      return <Check className="h-3 w-3 text-success" />;
    case 'processando':
      return <Loader2 className="h-3 w-3 text-warning animate-spin" />;
    case 'falhou':
      return <AlertCircle className="h-3 w-3 text-destructive" />;
  }
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  return `${diffDays}d atrás`;
}

export function VersionPanel({ 
  caseData, 
  selectedVersion, 
  onSelectVersion,
  onCreateVersion 
}: VersionPanelProps) {
  const baseVersion = caseData.versions.find(v => v.type === 'base');
  const versionsA = caseData.versions.filter(v => v.type === 'A');
  const versionsB = caseData.versions.filter(v => v.type === 'B');

  const hasVersionA = versionsA.length > 0;
  const hasVersionB = versionsB.length > 0;

  const handleDuplicate = () => {
    toast.info('Duplicar versão');
  };

  const handleRevert = () => {
    toast.info('Reverter para versão selecionada');
  };

  const handleExport = () => {
    toast.success('Export iniciado');
  };

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* Case Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs",
              caseData.type === 'queimadura' 
                ? 'border-warning/30 text-warning bg-warning/10' 
                : 'border-primary/30 text-primary bg-primary/10'
            )}
          >
            {caseData.type === 'queimadura' ? 'Queimadura' : 'Trauma'}
          </Badge>
        </div>
        <h2 className="font-semibold text-foreground">{caseData.codename}</h2>
        <div className="flex flex-wrap gap-1 mt-2">
          {caseData.tags.slice(0, 3).map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Versions */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="panel-title mb-0">Versões / Histórico</span>
          </div>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-3 pb-4">
            {/* Base Version */}
            {baseVersion && (
              <VersionItem
                version={baseVersion}
                isSelected={selectedVersion?.id === baseVersion.id}
                onClick={() => onSelectVersion(baseVersion)}
              />
            )}

            <Separator className="my-2" />

            {/* Version A */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-version-a">Técnica A</span>
                {!hasVersionA && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs"
                    onClick={() => onCreateVersion('A')}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Criar
                  </Button>
                )}
              </div>
              {versionsA.map(version => (
                <VersionItem
                  key={version.id}
                  version={version}
                  isSelected={selectedVersion?.id === version.id}
                  onClick={() => onSelectVersion(version)}
                  variant="A"
                />
              ))}
              {hasVersionA && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full h-7 text-xs text-muted-foreground"
                  onClick={() => onCreateVersion('A')}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nova subversão A
                </Button>
              )}
            </div>

            <Separator className="my-2" />

            {/* Version B */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-version-b">Técnica B</span>
                {!hasVersionB && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs"
                    onClick={() => onCreateVersion('B')}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Criar
                  </Button>
                )}
              </div>
              {versionsB.map(version => (
                <VersionItem
                  key={version.id}
                  version={version}
                  isSelected={selectedVersion?.id === version.id}
                  onClick={() => onSelectVersion(version)}
                  variant="B"
                />
              ))}
              {hasVersionB && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full h-7 text-xs text-muted-foreground"
                  onClick={() => onCreateVersion('B')}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nova subversão B
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="text-xs" onClick={handleDuplicate}>
            <Copy className="h-3 w-3 mr-1" />
            Duplicar
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleRevert}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Reverter
          </Button>
        </div>
        <Button variant="default" size="sm" className="w-full text-xs" onClick={handleExport}>
          <Download className="h-3 w-3 mr-1" />
          Exportar
        </Button>
      </div>
    </div>
  );
}

function VersionItem({ 
  version, 
  isSelected, 
  onClick,
  variant
}: { 
  version: CaseVersion; 
  isSelected: boolean; 
  onClick: () => void;
  variant?: 'A' | 'B';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-all",
        isSelected 
          ? variant === 'A'
            ? "border-version-a/50 bg-version-a/10"
            : variant === 'B'
              ? "border-version-b/50 bg-version-b/10"
              : "border-primary/50 bg-primary/10"
          : "border-border hover:border-primary/30 hover:bg-secondary/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-medium text-sm",
              isSelected ? "text-foreground" : "text-foreground/80"
            )}>
              {version.name}
            </span>
            <VersionStatusIcon status={version.status} />
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {version.description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatRelativeTime(version.createdAt)}
        </span>
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {version.author.split(' ')[0]}
        </span>
      </div>
    </button>
  );
}
