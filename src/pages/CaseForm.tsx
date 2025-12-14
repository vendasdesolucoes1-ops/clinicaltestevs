import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Upload, 
  Check, 
  X, 
  Camera,
  AlertCircle
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type PhotoAngle = Database['public']['Enums']['photo_angle'];
type CaseType = Database['public']['Enums']['case_type'];

const REQUIRED_ANGLES: PhotoAngle[] = ['frente', 'perfil_d', 'perfil_e'];
const OPTIONAL_ANGLES: PhotoAngle[] = ['tres_quartos'];

const ANGLE_LABELS: Record<PhotoAngle, string> = {
  frente: 'Frente',
  perfil_d: 'Perfil Direito',
  perfil_e: 'Perfil Esquerdo',
  tres_quartos: '3/4 (Opcional)',
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

    const missingPhotos = REQUIRED_ANGLES.filter(angle => !photos[angle]);
    if (missingPhotos.length > 0 && !isEditing) {
      toast.error(`Fotos obrigatórias faltando: ${missingPhotos.map(a => ANGLE_LABELS[a]).join(', ')}`);
      return;
    }

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

      // Upload photos
      const photosToUpload = Object.entries(photos).filter(([_, file]) => file !== null);
      
      for (const [angle, file] of photosToUpload) {
        if (!file) continue;
        
        const publicUrl = await uploadPhotoToStorage(caseId, angle as PhotoAngle, file);
        
        if (publicUrl) {
          await supabase
            .from('case_photos')
            .insert({
              case_id: caseId,
              angle: angle as PhotoAngle,
              url: publicUrl,
              storage_path: `${caseId}/${angle}_${Date.now()}`,
            });
        }
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

  const uploadedCount = Object.values(photos).filter(Boolean).length;
  const requiredCount = REQUIRED_ANGLES.length;

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

        {/* Photos */}
        <Card className="clinical-panel">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Fotos Padronizadas</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {uploadedCount}/{requiredCount} obrigatórias
              </span>
              {uploadedCount >= requiredCount && (
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
                  required={REQUIRED_ANGLES.includes(angle)}
                  onUpload={(file) => handlePhotoUpload(angle, file)}
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
  required,
  onUpload 
}: { 
  angle: PhotoAngle;
  label: string;
  file: File | null;
  required: boolean;
  onUpload: (file: File) => void;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onUpload(selectedFile);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <label
        className={cn(
          "flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
          file 
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
        {file ? (
          <div className="relative w-full h-full">
            <img
              src={URL.createObjectURL(file)}
              alt={label}
              className="w-full h-full object-cover rounded-lg"
            />
            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-success flex items-center justify-center">
              <Check className="h-3 w-3 text-success-foreground" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Camera className="h-6 w-6" />
            <span className="text-xs">Upload</span>
          </div>
        )}
      </label>
    </div>
  );
}
