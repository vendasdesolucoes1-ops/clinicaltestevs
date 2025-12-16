import { useState, useEffect } from 'react';
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
  Info,
  XCircle,
  Loader2
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
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TopBarProps {
  onThemeToggle: () => void;
  isDark: boolean;
}

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  message: string;
  read: boolean;
  case_id: string | null;
  created_at: string;
}

const NotificationIcon = ({ type }: { type: Notification['type'] }) => {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case 'warning':
      return <AlertCircle className="h-4 w-4 text-warning" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Info className="h-4 w-4 text-primary" />;
  }
};

const NotificationIconBg = ({ type }: { type: Notification['type'] }) => {
  switch (type) {
    case 'success':
      return 'bg-success/10';
    case 'warning':
      return 'bg-warning/10';
    case 'error':
      return 'bg-destructive/10';
    default:
      return 'bg-primary/10';
  }
};

export function TopBar({ onThemeToggle, isDark }: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const isWorkbench = location.pathname.includes('/workbench');

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        setNotifications((data || []).map(n => ({
          ...n,
          type: n.type as Notification['type']
        })));
      } catch (error) {
        console.error('Erro ao carregar notificações:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications'
        },
        (payload) => {
          const raw = payload.new as { id: string; type: string; title: string; message: string; read: boolean; case_id: string | null; created_at: string };
          const newNotification: Notification = {
            ...raw,
            type: raw.type as Notification['type']
          };
          setNotifications(prev => [newNotification, ...prev].slice(0, 10));
          toast.info(newNotification.title, {
            description: newNotification.message
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error('Erro ao marcar como lida:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      if (unreadIds.length === 0) return;

      await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', unreadIds);

      setNotifications(prev =>
        prev.map(n => ({ ...n, read: true }))
      );
      
      toast.success('Todas as notificações marcadas como lidas');
    } catch (error) {
      console.error('Erro ao marcar todas como lidas:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    
    if (notification.case_id) {
      setIsOpen(false);
      window.location.href = `/workbench/${notification.case_id}`;
    }
  };

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

        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h4 className="font-semibold text-sm">Notificações</h4>
              {unreadCount > 0 && (
                <span className="text-xs text-muted-foreground">{unreadCount} não lidas</span>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {isLoading ? (
                <div className="p-8 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div 
                    key={notification.id}
                    className={cn(
                      "p-3 hover:bg-secondary/50 cursor-pointer border-b border-border/50 transition-colors",
                      !notification.read && "bg-primary/5"
                    )}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        NotificationIconBg({ type: notification.type })
                      )}>
                        <NotificationIcon type={notification.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-sm",
                            !notification.read && "font-medium"
                          )}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.created_at), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {notifications.length > 0 && (
              <div className="p-2 border-t border-border">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full text-xs"
                  onClick={markAllAsRead}
                  disabled={unreadCount === 0}
                >
                  Marcar todas como lidas
                </Button>
              </div>
            )}
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
