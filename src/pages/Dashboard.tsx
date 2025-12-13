import { Link } from 'react-router-dom';
import { 
  FolderOpen, 
  Clock, 
  Loader2, 
  Download, 
  Plus,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getDashboardStats, mockJobs, type ClinicalCase } from '@/lib/mockData';
import { cn } from '@/lib/utils';

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  description,
  trend,
  className 
}: { 
  title: string; 
  value: number | string; 
  icon: React.ElementType;
  description?: string;
  trend?: string;
  className?: string;
}) {
  return (
    <Card className={cn("clinical-panel", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1 font-mono">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-2 text-success text-xs">
                <TrendingUp className="h-3 w-3" />
                <span>{trend}</span>
              </div>
            )}
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CaseTypeTag({ type }: { type: ClinicalCase['type'] }) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs font-medium",
        type === 'queimadura' 
          ? 'border-warning/30 text-warning bg-warning/10' 
          : 'border-primary/30 text-primary bg-primary/10'
      )}
    >
      {type === 'queimadura' ? 'Queimadura' : 'Trauma'}
    </Badge>
  );
}

function ProcessingJobCard() {
  const job = mockJobs.find(j => j.status === 'processando');
  
  if (!job) return null;

  return (
    <Card className="clinical-panel border-warning/20 bg-warning/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center">
            <Loader2 className="h-4 w-4 text-warning animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              Simulação em processamento
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-warning/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-warning rounded-full transition-all duration-500"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <span className="text-xs font-mono text-warning">{job.progress}%</span>
            </div>
          </div>
          <Link to={`/workbench/${job.caseId}`}>
            <Button variant="ghost" size="icon-sm">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const stats = getDashboardStats();

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral dos casos e simulações
          </p>
        </div>
        <Link to="/cases/new">
          <Button>
            <Plus className="h-4 w-4" />
            Novo Caso
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard 
          title="Casos Ativos" 
          value={stats.activeCases}
          icon={FolderOpen}
          description="Em acompanhamento"
        />
        <StatCard 
          title="Casos Recentes" 
          value={stats.recentCases.length}
          icon={Clock}
          description="Últimos 7 dias"
        />
        <StatCard 
          title="Em Processamento" 
          value={stats.processingJobs}
          icon={Loader2}
          description="Simulações ativas"
        />
        <StatCard 
          title="Exportações" 
          value={stats.recentExports}
          icon={Download}
          description="Este mês"
        />
      </div>

      {/* Processing job alert */}
      {mockJobs.some(j => j.status === 'processando') && (
        <div className="mb-8">
          <ProcessingJobCard />
        </div>
      )}

      {/* Recent Cases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="clinical-panel">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-base font-semibold">Casos Recentes</CardTitle>
            <Link to="/cases">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Ver todos
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {stats.recentCases.map((caseItem) => (
                <Link 
                  key={caseItem.id} 
                  to={`/workbench/${caseItem.id}`}
                  className="block"
                >
                  <div className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors group">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                      <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground truncate">
                          {caseItem.codename}
                        </span>
                        <CaseTypeTag type={caseItem.type} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {caseItem.responsible} • {caseItem.versions.length} versões
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="clinical-panel">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-base font-semibold">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-3">
              <Link to="/cases/new">
                <Button variant="outline" className="w-full h-auto py-6 flex-col gap-2">
                  <Plus className="h-6 w-6" />
                  <span>Novo Caso</span>
                </Button>
              </Link>
              <Link to="/capture">
                <Button variant="outline" className="w-full h-auto py-6 flex-col gap-2">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Captura Guiada</span>
                </Button>
              </Link>
              <Link to="/cases">
                <Button variant="outline" className="w-full h-auto py-6 flex-col gap-2">
                  <FolderOpen className="h-6 w-6" />
                  <span>Todos os Casos</span>
                </Button>
              </Link>
              <Link to="/exports">
                <Button variant="outline" className="w-full h-auto py-6 flex-col gap-2">
                  <Download className="h-6 w-6" />
                  <span>Exportações</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Disclaimer */}
      <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
        <p className="text-xs text-muted-foreground text-center">
          ⚕️ Simulação para planejamento — não substitui avaliação clínica profissional.
        </p>
      </div>
    </div>
  );
}
