import { useState } from 'react';
import { 
  Download, 
  FileImage, 
  FileText, 
  Calendar,
  Search,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockExports, mockCases, type CaseExport } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function getFormatIcon(format: CaseExport['format']) {
  switch (format) {
    case 'pdf':
      return FileText;
    default:
      return FileImage;
  }
}

function getFormatColor(format: CaseExport['format']) {
  switch (format) {
    case 'pdf':
      return 'text-destructive bg-destructive/10 border-destructive/30';
    case 'png':
      return 'text-primary bg-primary/10 border-primary/30';
    case 'jpg':
      return 'text-warning bg-warning/10 border-warning/30';
    default:
      return 'text-muted-foreground bg-muted border-muted';
  }
}

export default function Exports() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredExports = mockExports.filter(exp => {
    const caseItem = mockCases.find(c => c.id === exp.caseId);
    return (
      exp.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      caseItem?.codename.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleDownload = (exp: CaseExport) => {
    toast.success(`Download iniciado: ${exp.fileName}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCaseName = (caseId: string) => {
    return mockCases.find(c => c.id === caseId)?.codename || caseId;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Exportações</h1>
          <p className="text-muted-foreground mt-1">
            Histórico de imagens e relatórios exportados
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por arquivo ou caso..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 max-w-md"
        />
      </div>

      {/* Exports Grid */}
      <div className="grid gap-4">
        {filteredExports.map((exp) => {
          const FormatIcon = getFormatIcon(exp.format);
          
          return (
            <Card key={exp.id} className="clinical-panel">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center",
                    getFormatColor(exp.format)
                  )}>
                    <FormatIcon className="h-6 w-6" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {exp.fileName}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{getCaseName(exp.caseId)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(exp.createdAt)}
                      </span>
                    </div>
                  </div>

                  <Badge 
                    variant="outline" 
                    className={cn("uppercase", getFormatColor(exp.format))}
                  >
                    {exp.format}
                  </Badge>

                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDownload(exp)}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredExports.length === 0 && (
          <Card className="clinical-panel">
            <CardContent className="py-12 text-center">
              <Download className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhuma exportação encontrada</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
