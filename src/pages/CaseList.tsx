import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  Plus, 
  MoreHorizontal,
  Archive,
  Eye,
  FolderOpen,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type CaseStatus = Database['public']['Enums']['case_status'];
type CaseType = Database['public']['Enums']['case_type'];

interface ClinicalCaseRow {
  id: string;
  codename: string;
  type: CaseType;
  status: CaseStatus;
  updatedAt: string;
  tags: string[];
  notes: string | null;
  responsibleName: string;
}

function StatusBadge({ status }: { status: CaseStatus }) {
  const config = {
    ativo: { label: 'Ativo', className: 'status-ready' },
    arquivado: { label: 'Arquivado', className: 'bg-muted text-muted-foreground border-muted' },
    em_processamento: { label: 'Em processamento', className: 'status-processing' },
  } as const;

  const { label, className } = config[status];

  return (
    <Badge variant="outline" className={cn('version-badge', className)}>
      {label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: CaseType }) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        'text-xs font-medium',
        type === 'queimadura' 
          ? 'border-warning/30 text-warning bg-warning/10' 
          : 'border-primary/30 text-primary bg-primary/10'
      )}
    >
      {type === 'queimadura' ? 'Queimadura' : 'Trauma'}
    </Badge>
  );
}

export default function CaseList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [cases, setCases] = useState<ClinicalCaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCases = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('clinical_cases')
        .select('id, codename, type, status, updated_at, tags, notes, profiles:responsible_id(first_name, last_name)')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Erro ao carregar casos:', error);
        toast.error('Não foi possível carregar os casos');
        setIsLoading(false);
        return;
      }

      const mapped: ClinicalCaseRow[] = (data || []).map((item: any) => {
        const fullName = item.profiles
          ? `${item.profiles.first_name ?? ''} ${item.profiles.last_name ?? ''}`.trim()
          : '';

        return {
          id: item.id,
          codename: item.codename,
          type: item.type,
          status: item.status,
          updatedAt: item.updated_at,
          tags: item.tags ?? [],
          notes: item.notes ?? null,
          responsibleName: fullName || '—',
        };
      });

      setCases(mapped);
      setIsLoading(false);
    };

    loadCases();
  }, []);

  const filteredCases = useMemo(() => {
    return cases.filter((caseItem) => {
      const normalizedSearch = searchQuery.toLowerCase();
      const matchesSearch =
        caseItem.codename.toLowerCase().includes(normalizedSearch) ||
        caseItem.id.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === 'all' || caseItem.status === statusFilter;
      const matchesType = typeFilter === 'all' || caseItem.type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [cases, searchQuery, statusFilter, typeFilter]);

  const handleArchive = (caseItem: ClinicalCaseRow) => {
    toast.success(`Caso ${caseItem.codename} arquivado (apenas visual, ainda não move para "arquivado")`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Casos Clínicos</h1>
          <p className="text-muted-foreground mt-1">
            {filteredCases.length} casos encontrados
          </p>
        </div>
        <Link to="/cases/new">
          <Button>
            <Plus className="h-4 w-4" />
            Novo Caso
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID ou codinome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="arquivado">Arquivados</SelectItem>
              <SelectItem value="em_processamento">Processando</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="queimadura">Queimadura</SelectItem>
              <SelectItem value="trauma">Trauma</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="clinical-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Codinome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Atualizado</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Carregando casos...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filteredCases.map((caseItem) => (
              <TableRow key={caseItem.id} className="group">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  #{caseItem.id.slice(0, 8)}
                </TableCell>
                <TableCell>
                  <Link 
                    to={`/workbench/${caseItem.id}`}
                    className="font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {caseItem.codename}
                  </Link>
                </TableCell>
                <TableCell>
                  <TypeBadge type={caseItem.type} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={caseItem.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {caseItem.responsibleName}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    {caseItem.tags.slice(0, 2).map((tag) => (
                      <Badge 
                        key={tag} 
                        variant="secondary" 
                        className="text-xs font-normal"
                      >
                        {tag}
                      </Badge>
                    ))}
                    {caseItem.tags.length > 2 && (
                      <Badge variant="secondary" className="text-xs font-normal">
                        +{caseItem.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(caseItem.updatedAt)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/workbench/${caseItem.id}`} className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          Abrir Workbench
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={`/cases/${caseItem.id}/edit`} className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4" />
                          Editar Caso
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleArchive(caseItem)}
                        className="flex items-center gap-2"
                      >
                        <Archive className="h-4 w-4" />
                        Arquivar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredCases.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum caso encontrado</p>
            <Link to="/cases/new" className="mt-4">
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Criar Primeiro Caso
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
