import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Camera, 
  RotateCcw, 
  Check, 
  X,
  AlertCircle,
  Sun,
  Focus,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type CaptureAngle = 'frente' | 'perfil_d' | 'perfil_e' | 'tres_quartos';

interface CapturedPhoto {
  angle: CaptureAngle;
  blob: Blob;
  url: string;
}

const CAPTURE_STEPS: { angle: CaptureAngle; label: string; instruction: string }[] = [
  { 
    angle: 'frente', 
    label: 'Frente', 
    instruction: 'Posicione o rosto de frente, olhando diretamente para a câmera' 
  },
  { 
    angle: 'perfil_d', 
    label: 'Perfil Direito', 
    instruction: 'Gire a cabeça para mostrar o perfil direito' 
  },
  { 
    angle: 'perfil_e', 
    label: 'Perfil Esquerdo', 
    instruction: 'Gire a cabeça para mostrar o perfil esquerdo' 
  },
  { 
    angle: 'tres_quartos', 
    label: '3/4 (Opcional)', 
    instruction: 'Posicione o rosto em ângulo de 3/4' 
  },
];

export default function CameraCapture() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [qualityChecks, setQualityChecks] = useState({
    lighting: true,
    focus: true,
    centered: true,
  });

  const currentAngle = CAPTURE_STEPS[currentStep];
  const progress = ((photos.length) / CAPTURE_STEPS.length) * 100;

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
      setCameraError(null);
    } catch (error) {
      console.error('Camera error:', error);
      setCameraError('Não foi possível acessar a câmera. Verifique as permissões ou use o upload manual.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror the image for selfie camera
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setPreviewPhoto(url);
      }
    }, 'image/jpeg', 0.9);
  }, []);

  const confirmPhoto = useCallback(() => {
    if (!previewPhoto || !canvasRef.current) return;

    canvasRef.current.toBlob((blob) => {
      if (blob) {
        const newPhoto: CapturedPhoto = {
          angle: currentAngle.angle,
          blob,
          url: previewPhoto,
        };

        setPhotos(prev => [...prev, newPhoto]);
        setPreviewPhoto(null);

        if (currentStep < CAPTURE_STEPS.length - 1) {
          setCurrentStep(prev => prev + 1);
          toast.success(`${currentAngle.label} capturada`);
        } else {
          toast.success('Todas as fotos capturadas!');
        }
      }
    }, 'image/jpeg', 0.9);
  }, [previewPhoto, currentStep, currentAngle]);

  const retakePhoto = () => {
    if (previewPhoto) {
      URL.revokeObjectURL(previewPhoto);
    }
    setPreviewPhoto(null);
  };

  const skipOptional = () => {
    if (currentAngle.angle === 'tres_quartos') {
      toast.info('Foto opcional ignorada');
      // Complete the capture
    }
  };

  const handleComplete = () => {
    // In a real app, we'd pass these photos to the case creation
    toast.success('Captura concluída! Redirecionando...');
    navigate('/cases/new');
  };

  const isComplete = photos.length >= 3; // At least 3 required photos

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-semibold text-foreground">Captura Guiada</h1>
            <p className="text-xs text-muted-foreground">
              Passo {currentStep + 1} de {CAPTURE_STEPS.length}
            </p>
          </div>
        </div>
        <Progress value={progress} className="w-32 h-2" />
      </header>

      <div className="p-6 max-w-4xl mx-auto">
        {cameraError ? (
          <Card className="clinical-panel">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-warning mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Câmera Indisponível
              </h2>
              <p className="text-muted-foreground mb-6">{cameraError}</p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={startCamera}>
                  Tentar Novamente
                </Button>
                <Button onClick={() => navigate('/cases/new')}>
                  Upload Manual
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Camera View */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="clinical-panel overflow-hidden">
                <div className="relative aspect-video bg-canvas-bg">
                  {previewPhoto ? (
                    <img 
                      src={previewPhoto} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                      {/* Face overlay guide */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className={cn(
                          "w-48 h-64 border-2 border-dashed rounded-full transition-colors",
                          qualityChecks.centered ? "border-success/50" : "border-warning/50"
                        )} />
                      </div>
                    </>
                  )}
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Instruction banner */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-4">
                    <p className="text-sm font-medium text-foreground text-center">
                      {currentAngle.instruction}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Quality Indicators */}
              <div className="flex justify-center gap-4">
                <QualityIndicator 
                  icon={Sun} 
                  label="Iluminação" 
                  ok={qualityChecks.lighting} 
                />
                <QualityIndicator 
                  icon={Focus} 
                  label="Foco" 
                  ok={qualityChecks.focus} 
                />
                <QualityIndicator 
                  icon={User} 
                  label="Centralizado" 
                  ok={qualityChecks.centered} 
                />
              </div>

              {/* Capture Controls */}
              <div className="flex justify-center gap-4">
                {previewPhoto ? (
                  <>
                    <Button 
                      variant="outline" 
                      size="lg"
                      onClick={retakePhoto}
                      className="gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Refazer
                    </Button>
                    <Button 
                      size="lg"
                      onClick={confirmPhoto}
                      className="gap-2"
                    >
                      <Check className="h-4 w-4" />
                      Confirmar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      size="xl"
                      onClick={capturePhoto}
                      className="gap-2 px-12"
                    >
                      <Camera className="h-5 w-5" />
                      Capturar {currentAngle.label}
                    </Button>
                    {currentAngle.angle === 'tres_quartos' && (
                      <Button 
                        variant="ghost" 
                        size="lg"
                        onClick={skipOptional}
                      >
                        Pular
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Progress Panel */}
            <div className="space-y-4">
              <Card className="clinical-panel">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-foreground mb-4">Progresso</h3>
                  <div className="space-y-3">
                    {CAPTURE_STEPS.map((step, index) => {
                      const isCompleted = photos.some(p => p.angle === step.angle);
                      const isCurrent = index === currentStep;
                      
                      return (
                        <div 
                          key={step.angle}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-lg transition-colors",
                            isCurrent && "bg-primary/10",
                            isCompleted && "bg-success/10"
                          )}
                        >
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                            isCompleted 
                              ? "bg-success text-success-foreground" 
                              : isCurrent 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-muted text-muted-foreground"
                          )}>
                            {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
                          </div>
                          <span className={cn(
                            "text-sm",
                            isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                          )}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Captured Photos Preview */}
              {photos.length > 0 && (
                <Card className="clinical-panel">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-foreground mb-3">Fotos Capturadas</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {photos.map((photo) => (
                        <div 
                          key={photo.angle}
                          className="aspect-square rounded-lg overflow-hidden relative"
                        >
                          <img 
                            src={photo.url} 
                            alt={photo.angle}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/80 to-transparent p-1">
                            <span className="text-xs text-foreground">
                              {CAPTURE_STEPS.find(s => s.angle === photo.angle)?.label}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Complete Button */}
              {isComplete && (
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={handleComplete}
                >
                  Concluir Captura
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QualityIndicator({ 
  icon: Icon, 
  label, 
  ok 
}: { 
  icon: React.ElementType; 
  label: string; 
  ok: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm",
      ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
    )}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {ok ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
    </div>
  );
}
