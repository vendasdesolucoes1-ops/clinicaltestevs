import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Upload, 
  Check, 
  X, 
  Camera,
  AlertCircle,
  Box,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { N8N_WEBHOOK_URL } from '@/lib/config';

type PhotoAngle = Database['public']['Enums']['photo_angle'];
type CaseType = Database['public']['Enums']['case_type'];

const REQUIRED_ANGLES: PhotoAngle[] = ['frente', 'perfil_d', 'perfil_e'];
const OPTIONAL_ANGLES: PhotoAngle[] = ['tres_quartos'];

const ANGLE_LABELS: Record<PhotoAngle, string> = {
  frente: 'Frente',
  perfil_d: 'Perfil Direito',
  perfil_e: 'Perfil Esquerdo',
  tres_quartos: '3/4',
};

export default function CaseForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  const [formData, setFormData] = useState({
    codename: '',
    type: 'trauma' as CaseType,
    notes: '',
    tags: [] as string[],
    consentRegistered: false,
  });

  const [photos, setPhotos] = useState<Record<PhotoAngle, File | null>>({
    frente: null,
    perfil_d: null,
    perfil_e: null,
    tres_quartos: null,
  });

  const [existingPhotos, setExistingPhotos] = useState<Record<PhotoAngle, string | null>>({
    frente: null,
    perfil_d: null,
    perfil_e: null,
    tres_quartos: null,
  });

  // 3D Model state
  const [model3DFile, setModel3DFile] = useState<File | null>(null);

  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUser();
  }, []);

  // Load existing case if editing
  useEffect(() => {
    if (isEditing && id) {
      const loadCase = async () => {
        // Load case data
        const { data: caseData } = await supabase
          .from('clinical_cases')
          .select('*')
          .eq('id', id)
          .single();
        
        if (caseData) {
          setFormData({
            codename: caseData.codename,
            type: caseData.type,
            notes: caseData.notes || '',
            tags: caseData.tags || [],
            consentRegistered: caseData.consent_registered,
          });
        }

        // Load existing photos
        const { data: photosData } = await supabase
          .from('case_photos')
          .select('angle, url')
          .eq('case_id', id);

        if (photosData && photosData.length > 0) {
          const photoMap: Record<PhotoAngle, string | null> = {
            frente: null,
            perfil_d: null,
            perfil_e: null,
            tres_quartos: null,
          };
          photosData.forEach(photo => {
            photoMap[photo.angle] = photo.url;
          });
          setExistingPhotos(photoMap);
        }
      };
      loadCase();
    }
  }, [isEditing, id]);

  const handlePhotoUpload = (angle: PhotoAngle, file: File) => {
    setPhotos(prev => ({ ...prev, [angle]: file }));
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!formData.tags.includes(tagInput.trim())) {
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, tagInput.trim()],
        }));
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }));
  };

  const uploadPhotoToStorage = async (caseId: string, angle: PhotoAngle, file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${caseId}/${angle}_${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('case-photos')
      .upload(fileName, file, { upsert: true });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('case-photos')
      .getPublicUrl(fileName);
    
    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.codename.trim()) {
      toast.error('Por favor, insira um codinome para o caso');
      return;
    }

    if (!formData.consentRegistered) {
      toast.error('É necessário registrar o consentimento do paciente');
      return;
    }

    // Photos are optional - case can be created without photos

    if (!userId) {
      toast.error('Você precisa estar logado para criar um caso');
      return;
    }

    setIsSubmitting(true);

    try {
      let caseId: string;

      if (isEditing && id) {
        // Update existing case
        const { error } = await supabase
          .from('clinical_cases')
          .update({
            codename: formData.codename,
            type: formData.type,
            notes: formData.notes,
            tags: formData.tags,
            consent_registered: formData.consentRegistered,
            consent_date: formData.consentRegistered ? new Date().toISOString() : null,
          })
          .eq('id', id);
        
        if (error) throw error;
        caseId = id;
        toast.success('Caso atualizado com sucesso');
      } else {
        // Create new case
        const { data: newCase, error } = await supabase
          .from('clinical_cases')
          .insert({
            codename: formData.codename,
            type: formData.type,
            notes: formData.notes,
            tags: formData.tags,
            consent_registered: formData.consentRegistered,
            consent_date: formData.consentRegistered ? new Date().toISOString() : null,
            responsible_id: userId,
          })
          .select()
          .single();
        
        if (error) throw error;
        caseId = newCase.id;

        // Create base version
        await supabase
          .from('case_versions')
          .insert({
            case_id: caseId,
            name: 'Original',
            type: 'base',
            description: 'Versão base - imagens originais',
            status: 'pronto',
            author_id: userId,
          });
      }

      // Upload photos and collect URLs with photo_id
      const photosToUpload = Object.entries(photos).filter(([_, file]) => file !== null);
      const uploadedPhotosData: { photo_id: string; angle: PhotoAngle; url: string }[] = [];
      
      for (const [angle, file] of photosToUpload) {
        if (!file) continue;
        
        const publicUrl = await uploadPhotoToStorage(caseId, angle as PhotoAngle, file);
        
        if (publicUrl) {
          const { data: insertedPhoto } = await supabase
            .from('case_photos')
            .insert({
              case_id: caseId,
              angle: angle as PhotoAngle,
              url: publicUrl,
              storage_path: `${caseId}/${angle}_${Date.now()}`,
            })
            .select('id')
            .single();
          
          if (insertedPhoto) {
            uploadedPhotosData.push({ 
              photo_id: insertedPhoto.id, 
              angle: angle as PhotoAngle, 
              url: publicUrl 
            });
        }
      }

      // Upload 3D model if provided
      if (model3DFile) {
        try {
          const fileExt = model3DFile.name.split('.').pop()?.toLowerCase();
          const fileName = `${caseId}/model_${Date.now()}.${fileExt}`;
          
          const { error: uploadError } = await supabase.storage
            .from('case-3d-models')
            .upload(fileName, model3DFile, { upsert: true });
          
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('case-3d-models')
              .getPublicUrl(fileName);
            
            await supabase.from('case_3d_scans').insert({
              case_id: caseId,
              file_name: model3DFile.name,
              file_url: publicUrl,
              file_size: model3DFile.size,
              storage_path: fileName,
              scan_source: 'polycam',
              scan_type: 'face',
              uploaded_by: userId,
            });
            
            console.log('Modelo 3D enviado com sucesso');
          } else {
            console.error('Erro ao enviar modelo 3D:', uploadError);
          }
        } catch (modelError) {
          console.error('Erro ao processar modelo 3D:', modelError);
        }
      }
      }

      // Always trigger n8n webhook with case data (even without photos)
      try {
        const webhookPayload = {
          case_id: caseId,
          codename: formData.codename,
          type: formData.type,
          notes: formData.notes,
          tags: formData.tags,
          photos: uploadedPhotosData.map(p => ({
            photo_id: p.photo_id,
            angle: p.angle,
            url: p.url,
          })),
          created_at: new Date().toISOString(),
          user_id: userId,
        };

        console.log('Enviando dados ao n8n webhook:', webhookPayload);

        const response = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload),
        });

        if (response.ok) {
          console.log('Webhook n8n acionado com sucesso');
        } else {
          console.error('Erro ao acionar webhook n8n:', response.status);
        }
      } catch (webhookError) {
        console.error('Erro ao enviar para webhook n8n:', webhookError);
        // Continue anyway - webhook failure shouldn't block case creation
      }

      if (!isEditing) {
        toast.success('Caso criado com sucesso');
        navigate(`/workbench/${caseId}`);
      } else {
        navigate('/cases');
      }
    } catch (error: any) {
      console.error('Error saving case:', error);
      toast.error(error.message || 'Erro ao salvar o caso');
    } finally {
      setIsSubmitting(false);
    }
  };

  const allAngles = [...REQUIRED_ANGLES, ...OPTIONAL_ANGLES];
  const uploadedCount = allAngles.filter(angle => photos[angle] || existingPhotos[angle]).length;
  const totalCount = allAngles.length;

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isEditing ? 'Editar Caso' : 'Novo Caso'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditing ? 'Atualize as informações do caso' : 'Cadastre um novo caso clínico'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card className="clinical-panel">
          <CardHeader>
            <CardTitle className="text-base">Informações Básicas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="codename">Codinome / ID Interno *</Label>
                <Input
                  id="codename"
                  placeholder="Ex: Paciente Alpha-23"
                  value={formData.codename}
                  onChange={(e) => setFormData(prev => ({ ...prev, codename: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Identificador anônimo do paciente
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Tipo de Caso *</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={(value: 'queimadura' | 'trauma') => 
                    setFormData(prev => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trauma">Trauma</SelectItem>
                    <SelectItem value="queimadura">Queimadura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas Clínicas</Label>
              <Textarea
                id="notes"
                placeholder="Observações relevantes sobre o caso..."
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                placeholder="Digite e pressione Enter para adicionar..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Consent */}
        <Card className="clinical-panel">
          <CardHeader>
            <CardTitle className="text-base">Consentimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
              <Checkbox
                id="consent"
                checked={formData.consentRegistered}
                onCheckedChange={(checked) => 
                  setFormData(prev => ({ 
                    ...prev, 
                    consentRegistered: checked as boolean,
                  }))
                }
              />
              <div className="flex-1">
                <Label htmlFor="consent" className="text-sm font-medium cursor-pointer">
                  Consentimento do paciente registrado *
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Declaro que o paciente foi informado e consentiu com a captura 
                  de imagens e uso para planejamento cirúrgico.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3D Model Upload */}
        <Card className="clinical-panel">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Box className="h-4 w-4" />
              Modelo 3D (Polycam)
            </CardTitle>
            {model3DFile && (
              <Check className="h-4 w-4 text-success" />
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {model3DFile ? (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Box className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{model3DFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(model3DFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setModel3DFile(null)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label
                  className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors border-border hover:border-primary/50 hover:bg-primary/5"
                >
                  <input
                    type="file"
                    accept=".glb,.gltf,.zip"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const ext = file.name.split('.').pop()?.toLowerCase();
                        
                        // Handle ZIP files
                        if (ext === 'zip') {
                          if (file.size > 200 * 1024 * 1024) {
                            toast.error('Arquivo ZIP muito grande. Máximo: 200MB');
                            return;
                          }
                          toast.info('Extraindo modelo do ZIP...');
                          try {
                            const JSZip = (await import('jszip')).default;
                            const zip = await JSZip.loadAsync(file);
                            const modelExtensions = ['.glb', '.gltf'];
                            let modelFile: File | null = null;
                            
                            for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
                              if (zipEntry.dir) continue;
                              const fileExt = relativePath.toLowerCase().slice(relativePath.lastIndexOf('.'));
                              if (modelExtensions.includes(fileExt)) {
                                const blob = await zipEntry.async('blob');
                                const extractedName = relativePath.split('/').pop() || relativePath;
                                modelFile = new File([blob], extractedName, {
                                  type: extractedName.endsWith('.glb') ? 'model/gltf-binary' : 'model/gltf+json'
                                });
                                break;
                              }
                            }
                            
                            if (modelFile) {
                              toast.success(`Extraído: ${modelFile.name}`);
                              setModel3DFile(modelFile);
                            } else {
                              toast.error('ZIP não contém arquivo GLB ou GLTF');
                            }
                          } catch (err) {
                            console.error('Error extracting ZIP:', err);
                            toast.error('Erro ao extrair arquivo ZIP');
                          }
                          return;
                        }
                        
                        // Regular GLB/GLTF files
                        if (ext !== 'glb' && ext !== 'gltf') {
                          toast.error('Formato inválido. Use arquivos .glb, .gltf ou .zip');
                          return;
                        }
                        if (file.size > 100 * 1024 * 1024) {
                          toast.error('Arquivo muito grande. Máximo: 100MB');
                          return;
                        }
                        setModel3DFile(file);
                      }
                    }}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Box className="h-8 w-8" />
                    <span className="text-sm font-medium">Arraste ou clique para enviar</span>
                    <span className="text-xs">Formatos: GLB, GLTF ou ZIP (até 100MB)</span>
                  </div>
                </label>
              )}
              <p className="text-xs text-muted-foreground">
                Exporte seu scan do Polycam em formato GLB ou GLTF. Você também pode enviar o ZIP exportado diretamente.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Photos */}
        <Card className="clinical-panel">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Fotos Padronizadas</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {uploadedCount}/{totalCount} fotos
              </span>
              {uploadedCount > 0 && (
                <Check className="h-4 w-4 text-success" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...REQUIRED_ANGLES, ...OPTIONAL_ANGLES].map((angle) => (
                <PhotoUploadSlot
                  key={angle}
                  angle={angle}
                  label={ANGLE_LABELS[angle]}
                  file={photos[angle]}
                  existingUrl={existingPhotos[angle]}
                  required={false}
                  onUpload={(file) => handlePhotoUpload(angle, file)}
                  onRemove={() => {
                    setPhotos(prev => ({ ...prev, [angle]: null }));
                    setExistingPhotos(prev => ({ ...prev, [angle]: null }));
                  }}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>
                Use a{' '}
                <Link to="/capture" className="text-primary hover:underline">
                  Captura Guiada
                </Link>
                {' '}para melhores resultados
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Salvando...
              </span>
            ) : (
              isEditing ? 'Salvar Alterações' : 'Criar Caso'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function PhotoUploadSlot({ 
  angle, 
  label, 
  file, 
  existingUrl,
  required,
  onUpload,
  onRemove
}: { 
  angle: PhotoAngle;
  label: string;
  file: File | null;
  existingUrl: string | null;
  required: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onUpload(selectedFile);
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // If it's an existing photo (from database), show confirmation
    if (existingUrl && !file) {
      setShowConfirm(true);
    } else {
      // If it's just a new upload, remove immediately
      onRemove();
    }
  };

  const handleConfirmRemove = () => {
    onRemove();
    setShowConfirm(false);
  };

  const previewUrl = file ? URL.createObjectURL(file) : existingUrl;
  const hasPhoto = file || existingUrl;

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <label
        className={cn(
          "flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
          hasPhoto 
            ? "border-success/50 bg-success/5" 
            : "border-border hover:border-primary/50 hover:bg-primary/5"
        )}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="hidden"
        />
        {previewUrl ? (
          <div className="relative w-full h-full group">
            <img
              src={previewUrl}
              alt={label}
              className="w-full h-full object-cover rounded-lg"
            />
            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-success flex items-center justify-center">
              <Check className="h-3 w-3 text-success-foreground" />
            </div>
            <button
              type="button"
              onClick={handleRemoveClick}
              className="absolute top-1 left-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3 text-destructive-foreground" />
            </button>
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
              <span className="text-xs text-white font-medium">Substituir</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Camera className="h-6 w-6" />
            <span className="text-xs">Upload</span>
          </div>
        )}
      </label>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover foto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta foto já está salva no sistema. Ao remover, você precisará enviar uma nova foto para o ângulo "{label}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
