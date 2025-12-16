import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Search, 
  Plus, 
  User, 
  Settings, 
  LogOut, 
  Moon, 
  Sun,
  ChevronDown,
  Bell,
  CheckCircle2,
  AlertCircle,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { currentUser } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TopBarProps {
  onThemeToggle: () => void;
  isDark: boolean;
}

export function TopBar({ onThemeToggle, isDark }: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();

  const isWorkbench = location.pathname.includes('/workbench');

  return (
    <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between sticky top-0 z-50">
      {/* Left side - Logo and nav */}
      <div className="flex items-center gap-6">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-clinical-teal flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">IC</span>
          </div>
          <span className="font-semibold text-foreground hidden sm:block">InsightsCirurgic</span>
        </Link>

        {!isWorkbench && (
          <nav className="hidden md:flex items-center gap-1">
            <Link to="/dashboard">
              <Button 
                variant={location.pathname === '/dashboard' ? 'secondary' : 'ghost'} 
                size="sm"
              >
                Dashboard
              </Button>
            </Link>
            <Link to="/cases">
              <Button 
                variant={location.pathname === '/cases' ? 'secondary' : 'ghost'} 
                size="sm"
              >
                Casos
              </Button>
            </Link>
            <Link to="/exports">
              <Button 
                variant={location.pathname === '/exports' ? 'secondary' : 'ghost'} 
                size="sm"
              >
                Exportações
              </Button>
            </Link>
          </nav>
        )}
      </div>

      {/* Center - Search */}
      <div className={cn(
        "flex-1 max-w-md mx-4",
        isWorkbench && "hidden lg:flex"
      )}>
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar paciente ou caso..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-secondary/50 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        <Link to="/cases/new">
          <Button size="sm" className="hidden sm:flex">
            <Plus className="h-4 w-4" />
            Novo Caso
          </Button>
          <Button size="icon-sm" className="sm:hidden">
            <Plus className="h-4 w-4" />
          </Button>
        </Link>

        <Button 
          variant="ghost" 
          size="icon-sm"
          onClick={() => {
            onThemeToggle();
            toast.success(isDark ? 'Tema claro ativado' : 'Tema escuro ativado');
          }}
          className="text-muted-foreground"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="p-3 border-b border-border">
              <h4 className="font-semibold text-sm">Notificações</h4>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <div 
                className="p-3 hover:bg-secondary/50 cursor-pointer border-b border-border/50"
                onClick={() => {
                  toast.info('Notificação visualizada');
                }}
              >
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Análise concluída</p>
                    <p className="text-xs text-muted-foreground">Caso "Laura" foi processado com sucesso</p>
                    <p className="text-xs text-muted-foreground mt-1">Há 5 min</p>
                  </div>
                </div>
              </div>
              <div 
                className="p-3 hover:bg-secondary/50 cursor-pointer border-b border-border/50"
                onClick={() => {
                  toast.info('Notificação visualizada');
                }}
              >
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                    <AlertCircle className="h-4 w-4 text-warning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Atenção necessária</p>
                    <p className="text-xs text-muted-foreground">Job em processamento há mais de 10 min</p>
                    <p className="text-xs text-muted-foreground mt-1">Há 12 min</p>
                  </div>
                </div>
              </div>
              <div 
                className="p-3 hover:bg-secondary/50 cursor-pointer"
                onClick={() => {
                  toast.info('Notificação visualizada');
                }}
              >
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Info className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Nova versão disponível</p>
                    <p className="text-xs text-muted-foreground">Sistema atualizado com melhorias</p>
                    <p className="text-xs text-muted-foreground mt-1">Há 1 hora</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-2 border-t border-border">
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-xs"
                onClick={() => toast.success('Todas as notificações marcadas como lidas')}
              >
                Marcar todas como lidas
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="hidden md:block text-sm font-medium">{currentUser.name}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{currentUser.name}</p>
              <p className="text-xs text-muted-foreground">{currentUser.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                <Settings className="h-4 w-4" />
                Configurações
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/login" className="flex items-center gap-2 cursor-pointer text-destructive">
                <LogOut className="h-4 w-4" />
                Sair
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
