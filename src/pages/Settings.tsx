import { useState } from 'react';
import { 
  User, 
  Moon, 
  Sun, 
  Keyboard, 
  Shield, 
  Bell,
  Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { currentUser } from '@/lib/mockData';
import { toast } from 'sonner';

export default function Settings() {
  const [settings, setSettings] = useState({
    darkMode: true,
    keyboardShortcuts: true,
    notifications: true,
    autoSave: true,
  });

  const handleSave = () => {
    toast.success('Configurações salvas com sucesso');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie suas preferências e configurações de conta
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile */}
        <Card className="clinical-panel">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Perfil
            </CardTitle>
            <CardDescription>
              Informações da sua conta
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input defaultValue={currentUser.name} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input defaultValue={currentUser.email} type="email" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Input defaultValue="Cirurgião" disabled className="bg-muted" />
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card className="clinical-panel">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {settings.darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              Aparência
            </CardTitle>
            <CardDescription>
              Personalize a interface do sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Tema Escuro</p>
                <p className="text-sm text-muted-foreground">
                  Recomendado para visualização de imagens médicas
                </p>
              </div>
              <Switch 
                checked={settings.darkMode}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, darkMode: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Shortcuts */}
        <Card className="clinical-panel">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Atalhos de Teclado
            </CardTitle>
            <CardDescription>
              Configure atalhos para ações rápidas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Ativar Atalhos</p>
                <p className="text-sm text-muted-foreground">
                  Use Z para desfazer, Y para refazer, Espaço para pan
                </p>
              </div>
              <Switch 
                checked={settings.keyboardShortcuts}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, keyboardShortcuts: checked }))}
              />
            </div>
            
            <Separator />

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between p-2 rounded bg-muted">
                <span className="text-muted-foreground">Desfazer</span>
                <kbd className="px-2 py-0.5 rounded bg-background border text-xs font-mono">Z</kbd>
              </div>
              <div className="flex justify-between p-2 rounded bg-muted">
                <span className="text-muted-foreground">Refazer</span>
                <kbd className="px-2 py-0.5 rounded bg-background border text-xs font-mono">Y</kbd>
              </div>
              <div className="flex justify-between p-2 rounded bg-muted">
                <span className="text-muted-foreground">Pan</span>
                <kbd className="px-2 py-0.5 rounded bg-background border text-xs font-mono">Espaço</kbd>
              </div>
              <div className="flex justify-between p-2 rounded bg-muted">
                <span className="text-muted-foreground">Zoom</span>
                <kbd className="px-2 py-0.5 rounded bg-background border text-xs font-mono">Scroll</kbd>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="clinical-panel">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notificações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Notificações de Processamento</p>
                <p className="text-sm text-muted-foreground">
                  Receba alertas quando simulações forem concluídas
                </p>
              </div>
              <Switch 
                checked={settings.notifications}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, notifications: checked }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Auto-salvar</p>
                <p className="text-sm text-muted-foreground">
                  Salvar alterações automaticamente
                </p>
              </div>
              <Switch 
                checked={settings.autoSave}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoSave: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card className="clinical-panel">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Privacidade e LGPD
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-muted/50 border border-border text-sm">
              <p className="text-foreground font-medium mb-2">
                Conformidade com a Lei Geral de Proteção de Dados
              </p>
              <p className="text-muted-foreground">
                Este sistema segue as diretrizes da LGPD para tratamento de dados 
                sensíveis de saúde. Todas as imagens e informações de pacientes são 
                armazenadas de forma criptografada e acessíveis apenas por profissionais 
                autorizados. Para mais informações sobre nossas políticas de privacidade, 
                entre em contato com o administrador do sistema.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            Salvar Configurações
          </Button>
        </div>
      </div>
    </div>
  );
}
