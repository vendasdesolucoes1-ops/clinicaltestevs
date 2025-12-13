// Version Panel - Left side panel with case info and version management
import { useState, useCallback, useRef } from 'react';
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
  AlertCircle,
  Edit3,
  Trash2,
  Eye,
  Camera,
  Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { type ClinicalCase, type CaseVersion } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VersionPanelProps {
  caseData: ClinicalCase;
  selectedVersion: CaseVersion | null;
  onSelectVersion: (version: CaseVersion) => void;
  onCreateVersion: (type: 'A' | 'B') => void;
  onDuplicateVersion: (version: CaseVersion) => void;
  onRenameVersion: (version: CaseVersion, newName: string) => void;
  onDeleteVersion: (version: CaseVersion) => void;
  onExport: () => void;
  onAddPhoto?: (file: File) => void;
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
  onCreateVersion,
  onDuplicateVersion,
  onRenameVersion,
  onDeleteVersion,
  onExport,
  onAddPhoto,
}: VersionPanelProps) {
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [targetVersion, setTargetVersion] = useState<CaseVersion | null>(null);
  const [newVersionName, setNewVersionName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAddPhoto) {
      onAddPhoto(file);
      toast.success('Foto adicionada com sucesso');
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const baseVersion = caseData.versions.find(v => v.type === 'base');
  const versionsA = caseData.versions.filter(v => v.type === 'A');
  const versionsB = caseData.versions.filter(v => v.type === 'B');

  const hasVersionA = versionsA.length > 0;
  const hasVersionB = versionsB.length > 0;

  const handleRename = useCallback(() => {
    if (targetVersion && newVersionName.trim()) {
      onRenameVersion(targetVersion, newVersionName.trim());
      toast.success('Versão renomeada');
      setRenameDialogOpen(false);
      setTargetVersion(null);
      setNewVersionName('');
    }
  }, [targetVersion, newVersionName, onRenameVersion]);

  const handleDelete = useCallback(() => {
    if (targetVersion) {
      onDeleteVersion(targetVersion);
      toast.success('Versão excluída');
      setDeleteDialogOpen(false);
      setTargetVersion(null);
    }
  }, [targetVersion, onDeleteVersion]);

  const openRenameDialog = (version: CaseVersion) => {
    setTargetVersion(version);
    setNewVersionName(version.name);
    setRenameDialogOpen(true);
  };

  const openDeleteDialog = (version: CaseVersion) => {
    setTargetVersion(version);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {/* Case Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
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
            <Badge variant="outline" className="text-xs border-border">
              {caseData.photos.length} fotos
            </Badge>
          </div>
          <Button 
            variant="ghost" 
            size="icon-sm" 
            className="h-7 w-7"
            onClick={() => fileInputRef.current?.click()}
            title="Adicionar foto"
          >
            <Camera className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="font-semibold text-foreground">{caseData.codename}</h2>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{caseData.notes}</p>
        <div className="flex flex-wrap gap-1 mt-3">
          {caseData.tags.slice(0, 4).map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Versions */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Versões</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {caseData.versions.length} total
            </span>
          </div>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 pb-4">
            {/* Base Version */}
            {baseVersion && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Original</span>
                <VersionItem
                  version={baseVersion}
                  isSelected={selectedVersion?.id === baseVersion.id}
                  onClick={() => onSelectVersion(baseVersion)}
                  onRename={() => openRenameDialog(baseVersion)}
                  canDelete={false}
                />
              </div>
            )}

            <Separator />

            {/* Version A */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-version-a">Técnica A</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs"
                  onClick={() => onCreateVersion('A')}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {hasVersionA ? 'Subversão' : 'Criar'}
                </Button>
              </div>
              {versionsA.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-border text-center">
                  <p className="text-xs text-muted-foreground">Nenhuma versão A criada</p>
                </div>
              ) : (
                versionsA.map(version => (
                  <VersionItem
                    key={version.id}
                    version={version}
                    isSelected={selectedVersion?.id === version.id}
                    onClick={() => onSelectVersion(version)}
                    onDuplicate={() => onDuplicateVersion(version)}
                    onRename={() => openRenameDialog(version)}
                    onDelete={() => openDeleteDialog(version)}
                    variant="A"
                  />
                ))
              )}
            </div>

            <Separator />

            {/* Version B */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-version-b">Técnica B</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs"
                  onClick={() => onCreateVersion('B')}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {hasVersionB ? 'Subversão' : 'Criar'}
                </Button>
              </div>
              {versionsB.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-border text-center">
                  <p className="text-xs text-muted-foreground">Nenhuma versão B criada</p>
                </div>
              ) : (
                versionsB.map(version => (
                  <VersionItem
                    key={version.id}
                    version={version}
                    isSelected={selectedVersion?.id === version.id}
                    onClick={() => onSelectVersion(version)}
                    onDuplicate={() => onDuplicateVersion(version)}
                    onRename={() => openRenameDialog(version)}
                    onDelete={() => openDeleteDialog(version)}
                    variant="B"
                  />
                ))
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border space-y-2">
        <Button variant="default" size="sm" className="w-full text-xs" onClick={onExport}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Exportar Versão
        </Button>
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear Versão</DialogTitle>
            <DialogDescription>
              Digite um novo nome para a versão "{targetVersion?.name}"
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newVersionName}
            onChange={(e) => setNewVersionName(e.target.value)}
            placeholder="Nome da versão"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRename}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Versão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a versão "{targetVersion?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VersionItem({ 
  version, 
  isSelected, 
  onClick,
  onDuplicate,
  onRename,
  onDelete,
  variant,
  canDelete = true,
}: { 
  version: CaseVersion; 
  isSelected: boolean; 
  onClick: () => void;
  onDuplicate?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  variant?: 'A' | 'B';
  canDelete?: boolean;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={cn(
        "relative p-3 rounded-lg border transition-all cursor-pointer",
        isSelected 
          ? variant === 'A'
            ? "border-version-a/50 bg-version-a/10"
            : variant === 'B'
              ? "border-version-b/50 bg-version-b/10"
              : "border-primary/50 bg-primary/10"
          : "border-border hover:border-primary/30 hover:bg-secondary/50"
      )}
      onClick={onClick}
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
        
        {/* Quick actions */}
        {showActions && (
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            {onDuplicate && (
              <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={onDuplicate}>
                <Copy className="h-3 w-3" />
              </Button>
            )}
            {onRename && (
              <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={onRename}>
                <Edit3 className="h-3 w-3" />
              </Button>
            )}
            {canDelete && onDelete && (
              <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
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
    </div>
  );
}
