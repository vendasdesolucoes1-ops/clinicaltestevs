import React, { useCallback, useState, useRef } from 'react';
import { Upload, X, FileBox, Loader2, CheckCircle2, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Model3DUploadProps {
  onUpload: (file: File, scanSource: string, scanType: string, notes?: string) => Promise<any>;
  onDelete?: (scanId: string) => Promise<boolean>;
  isUploading: boolean;
  uploadProgress: number;
  existingScans?: Array<{
    id: string;
    file_name: string;
    file_size: number | null;
    scan_source: string | null;
    created_at: string;
  }>;
  activeScanId?: string;
  onSelectScan?: (scanId: string) => void;
  className?: string;
}

const SCAN_SOURCES = [
  { value: 'polycam', label: 'Polycam' },
  { value: 'scaniverse', label: 'Scaniverse' },
  { value: '3dscannerapp', label: '3D Scanner App' },
  { value: 'luma', label: 'Luma AI' },
  { value: 'other', label: 'Outro' },
];

const SCAN_TYPES = [
  { value: 'face', label: 'Face Completa' },
  { value: 'face_front', label: 'Face Frontal' },
  { value: 'face_profile', label: 'Perfil' },
  { value: 'head', label: 'Cabeça Completa' },
  { value: 'other', label: 'Outro' },
];

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function Model3DUpload({
  onUpload,
  onDelete,
  isUploading,
  uploadProgress,
  existingScans = [],
  activeScanId,
  onSelectScan,
  className
}: Model3DUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scanSource, setScanSource] = useState('polycam');
  const [scanType, setScanType] = useState('face');
  const [notes, setNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const validateFile = (file: File): boolean => {
    const validExtensions = ['.glb', '.gltf'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExtension)) {
      return false;
    }
    
    const maxSize = 100 * 1024 * 1024; // 100MB
    return file.size <= maxSize;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    const result = await onUpload(selectedFile, scanSource, scanType, notes || undefined);
    
    if (result) {
      setSelectedFile(null);
      setNotes('');
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setNotes('');
  };

  return (
    <Card className={cn("border-border/50", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileBox className="h-4 w-4" />
              Modelo 3D do Paciente
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Upload de escaneamento 3D (Polycam, iPhone)
            </CardDescription>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Info className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-xs">
                Exporte seu scan do Polycam como <strong>GLTF</strong> ou <strong>GLB</strong> 
                com texturas incluídas. O arquivo será usado para visualização 3D real do paciente.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Existing Scans List */}
        {existingScans.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Modelos Carregados</Label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {existingScans.map((scan) => (
                <div
                  key={scan.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md text-xs cursor-pointer transition-colors",
                    activeScanId === scan.id 
                      ? "bg-primary/10 border border-primary/30" 
                      : "bg-muted/50 hover:bg-muted"
                  )}
                  onClick={() => onSelectScan?.(scan.id)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {activeScanId === scan.id && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{scan.file_name}</p>
                      <p className="text-muted-foreground">
                        {formatFileSize(scan.file_size)} • {scan.scan_source || 'Desconhecido'}
                      </p>
                    </div>
                  </div>
                  
                  {onDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover Modelo 3D</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja remover "{scan.file_name}"? 
                            Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => onDelete(scan.id)}
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Area */}
        {!selectedFile && !isUploading && (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
              isDragOver 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className={cn(
              "h-8 w-8 mx-auto mb-2 transition-colors",
              isDragOver ? "text-primary" : "text-muted-foreground"
            )} />
            <p className="text-xs font-medium">
              {isDragOver ? 'Solte o arquivo aqui' : 'Arraste ou clique para upload'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              GLB ou GLTF • Máximo 100MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb,.gltf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* Selected File Preview */}
        {selectedFile && !isUploading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <FileBox className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleCancel}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Options */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Origem</Label>
                <Select value={scanSource} onValueChange={setScanSource}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCAN_SOURCES.map((source) => (
                      <SelectItem key={source.value} value={source.value} className="text-xs">
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={scanType} onValueChange={setScanType}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCAN_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-xs">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações sobre o scan..."
                className="min-h-[60px] text-xs resize-none"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={handleCancel}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={handleUpload}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Enviar
              </Button>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Enviando...
              </span>
              <span className="text-muted-foreground">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
