import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Por favor, preencha todos os campos');
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        // Sign up
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        
        if (error) throw error;
        toast.success('Conta criada! Verifique seu e-mail para confirmar.');
      } else {
        // Sign in
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        toast.success('Login realizado com sucesso');
        navigate('/dashboard');
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast.error(error.message || 'Erro de autenticação');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/10 via-clinical-teal/5 to-background p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-clinical-teal flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl">IC</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">InsightsCirurgic</h1>
              <p className="text-sm text-muted-foreground">Planejamento Cirúrgico Facial</p>
            </div>
          </div>

          <div className="space-y-8 max-w-md">
            <div>
              <h2 className="text-3xl font-semibold text-foreground leading-tight">
                Simulação avançada para reconstrução facial
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Ferramenta de planejamento cirúrgico com visualização 2D/3D, 
                comparação de técnicas e histórico versionado para casos de 
                trauma e queimaduras.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-card border border-border">
                <div className="text-2xl font-bold text-primary font-mono">2D/3D</div>
                <div className="text-sm text-muted-foreground">Visualização</div>
              </div>
              <div className="p-4 rounded-lg bg-card border border-border">
                <div className="text-2xl font-bold text-clinical-teal font-mono">A/B</div>
                <div className="text-sm text-muted-foreground">Comparação</div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          © 2024 InsightsCirurgic. Todos os direitos reservados.
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-clinical-teal flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">IC</span>
            </div>
            <span className="text-xl font-bold text-foreground">InsightsCirurgic</span>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-semibold text-foreground">
              {isSignUp ? 'Criar conta' : 'Entrar'}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {isSignUp ? 'Crie sua conta para começar' : 'Acesse sua conta para continuar'}
            </p>
          </div>

          {/* Warning banner */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Ferramenta clínica interna</p>
              <p className="text-muted-foreground">
                Uso restrito a profissionais de saúde autorizados.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu.email@clinica.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {!isSignUp && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-input" />
                  <span className="text-muted-foreground">Lembrar-me</span>
                </label>
                <button type="button" className="text-primary hover:underline">
                  Esqueci minha senha
                </button>
              </div>
            )}

            <Button type="submit" className="w-full h-11" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  {isSignUp ? 'Criando conta...' : 'Entrando...'}
                </span>
              ) : (
                isSignUp ? 'Criar conta' : 'Entrar'
              )}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-primary hover:underline"
            >
              {isSignUp ? 'Já tem conta? Entre aqui' : 'Não tem conta? Cadastre-se'}
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Simulação para planejamento — não substitui avaliação clínica.
          </p>
        </div>
      </div>
    </div>
  );
}