// Mock Data Layer for InsightsCirurgic
// This file contains all mock data and simulates API responses

export type CaseType = 'queimadura' | 'trauma';
export type CaseStatus = 'ativo' | 'arquivado' | 'em_processamento';
export type SimulationStatus = 'processando' | 'pronto' | 'falhou';

export interface CasePhoto {
  id: string;
  angle: 'frente' | 'perfil_d' | 'perfil_e' | 'tres_quartos';
  url: string;
  capturedAt: string;
}

export interface CaseVersion {
  id: string;
  name: string;
  type: 'base' | 'A' | 'B';
  subVersion?: number;
  description: string;
  status: SimulationStatus;
  createdAt: string;
  author: string;
  thumbnailUrl?: string;
  /** Conteúdo de `case_versions.canvas_state`; ver src/lib/versionState.ts. */
  canvasState?: unknown;
  /** Foto que a versão retrata (`case_versions.photo_id`). */
  photoId?: string;
}

export interface SimulationJob {
  id: string;
  caseId: string;
  versionId: string;
  status: SimulationStatus;
  progress: number;
  startedAt: string;
  completedAt?: string;
  parameters: {
    quality: 'rapido' | 'qualidade';
    preserveSymmetry: boolean;
    avoidEyeDistortion: boolean;
    maintainMouthLine: boolean;
    clinicalObjective?: string;
  };
}

export interface CaseExport {
  id: string;
  caseId: string;
  versionId: string;
  format: 'png' | 'jpg' | 'pdf';
  createdAt: string;
  downloadUrl: string;
  fileName: string;
}

export interface ClinicalCase {
  id: string;
  codename: string;
  type: CaseType;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  responsible: string;
  tags: string[];
  notes: string;
  consentRegistered: boolean;
  consentDate?: string;
  photos: CasePhoto[];
  versions: CaseVersion[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'cirurgiao' | 'residente' | 'admin';
  avatar?: string;
}

// Mock current user
export const currentUser: User = {
  id: 'usr_001',
  name: 'Dr. Carlos Mendes',
  email: 'carlos.mendes@clinica.com',
  role: 'cirurgiao',
};

// Mock cases data
export const mockCases: ClinicalCase[] = [
  {
    id: 'caso_001',
    codename: 'Paciente Alpha-23',
    type: 'queimadura',
    status: 'ativo',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-18T14:20:00Z',
    responsible: 'Dr. Carlos Mendes',
    tags: ['face', 'grau_2', 'urgente'],
    notes: 'Queimadura térmica em região facial direita. Necessita reconstrução de área malar.',
    consentRegistered: true,
    consentDate: '2024-01-15T10:00:00Z',
    photos: [
      { id: 'ph_001', angle: 'frente', url: '/placeholder.svg', capturedAt: '2024-01-15T10:35:00Z' },
      { id: 'ph_002', angle: 'perfil_d', url: '/placeholder.svg', capturedAt: '2024-01-15T10:36:00Z' },
      { id: 'ph_003', angle: 'perfil_e', url: '/placeholder.svg', capturedAt: '2024-01-15T10:37:00Z' },
    ],
    versions: [
      {
        id: 'ver_001',
        name: 'Original',
        type: 'base',
        description: 'Versão base - imagens originais',
        status: 'pronto',
        createdAt: '2024-01-15T10:40:00Z',
        author: 'Dr. Carlos Mendes',
      },
      {
        id: 'ver_002',
        name: 'Versão A',
        type: 'A',
        description: 'Técnica de enxerto expandido',
        status: 'pronto',
        createdAt: '2024-01-16T09:00:00Z',
        author: 'Dr. Carlos Mendes',
      },
      {
        id: 'ver_003',
        name: 'Versão B',
        type: 'B',
        description: 'Técnica de retalho local',
        status: 'processando',
        createdAt: '2024-01-18T14:00:00Z',
        author: 'Dr. Carlos Mendes',
      },
    ],
  },
  {
    id: 'caso_002',
    codename: 'Paciente Beta-07',
    type: 'trauma',
    status: 'ativo',
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-01-17T16:45:00Z',
    responsible: 'Dra. Ana Silva',
    tags: ['nariz', 'fratura', 'bilateral'],
    notes: 'Trauma facial com fratura nasal e laceração. Planejamento de rinoplastia reconstrutiva.',
    consentRegistered: true,
    consentDate: '2024-01-10T07:50:00Z',
    photos: [
      { id: 'ph_004', angle: 'frente', url: '/placeholder.svg', capturedAt: '2024-01-10T08:10:00Z' },
      { id: 'ph_005', angle: 'perfil_d', url: '/placeholder.svg', capturedAt: '2024-01-10T08:11:00Z' },
      { id: 'ph_006', angle: 'perfil_e', url: '/placeholder.svg', capturedAt: '2024-01-10T08:12:00Z' },
      { id: 'ph_007', angle: 'tres_quartos', url: '/placeholder.svg', capturedAt: '2024-01-10T08:13:00Z' },
    ],
    versions: [
      {
        id: 'ver_004',
        name: 'Original',
        type: 'base',
        description: 'Versão base - imagens originais',
        status: 'pronto',
        createdAt: '2024-01-10T08:20:00Z',
        author: 'Dra. Ana Silva',
      },
      {
        id: 'ver_005',
        name: 'Versão A',
        type: 'A',
        subVersion: 1,
        description: 'Abordagem aberta - primeira iteração',
        status: 'pronto',
        createdAt: '2024-01-12T11:00:00Z',
        author: 'Dra. Ana Silva',
      },
      {
        id: 'ver_006',
        name: 'Versão A.2',
        type: 'A',
        subVersion: 2,
        description: 'Abordagem aberta - ajuste de ângulo',
        status: 'pronto',
        createdAt: '2024-01-14T10:00:00Z',
        author: 'Dra. Ana Silva',
      },
    ],
  },
  {
    id: 'caso_003',
    codename: 'Paciente Gamma-15',
    type: 'queimadura',
    status: 'arquivado',
    createdAt: '2023-12-01T09:00:00Z',
    updatedAt: '2023-12-20T11:30:00Z',
    responsible: 'Dr. Carlos Mendes',
    tags: ['face', 'grau_3', 'concluido'],
    notes: 'Caso concluído. Procedimento realizado com sucesso.',
    consentRegistered: true,
    consentDate: '2023-12-01T08:45:00Z',
    photos: [
      { id: 'ph_008', angle: 'frente', url: '/placeholder.svg', capturedAt: '2023-12-01T09:10:00Z' },
    ],
    versions: [
      {
        id: 'ver_007',
        name: 'Original',
        type: 'base',
        description: 'Versão base',
        status: 'pronto',
        createdAt: '2023-12-01T09:15:00Z',
        author: 'Dr. Carlos Mendes',
      },
    ],
  },
];

// Mock simulation jobs
export const mockJobs: SimulationJob[] = [
  {
    id: 'job_001',
    caseId: 'caso_001',
    versionId: 'ver_003',
    status: 'processando',
    progress: 67,
    startedAt: '2024-01-18T14:00:00Z',
    parameters: {
      quality: 'qualidade',
      preserveSymmetry: true,
      avoidEyeDistortion: true,
      maintainMouthLine: true,
      clinicalObjective: 'Reconstrução de área malar com preservação de contorno facial',
    },
  },
];

// Mock exports
export const mockExports: CaseExport[] = [
  {
    id: 'exp_001',
    caseId: 'caso_001',
    versionId: 'ver_002',
    format: 'png',
    createdAt: '2024-01-17T10:00:00Z',
    downloadUrl: '#',
    fileName: 'caso_001_versao_A_20240117.png',
  },
  {
    id: 'exp_002',
    caseId: 'caso_002',
    versionId: 'ver_006',
    format: 'pdf',
    createdAt: '2024-01-16T15:30:00Z',
    downloadUrl: '#',
    fileName: 'caso_002_relatorio_20240116.pdf',
  },
];

// Mock API functions (to be replaced with real API calls)
export const api = {
  // Cases
  getCases: async (): Promise<ClinicalCase[]> => {
    await new Promise(r => setTimeout(r, 500));
    return mockCases;
  },

  getCase: async (id: string): Promise<ClinicalCase | undefined> => {
    await new Promise(r => setTimeout(r, 300));
    return mockCases.find(c => c.id === id);
  },

  createCase: async (data: Partial<ClinicalCase>): Promise<ClinicalCase> => {
    await new Promise(r => setTimeout(r, 800));
    const newCase: ClinicalCase = {
      id: `caso_${Date.now()}`,
      codename: data.codename || 'Novo Caso',
      type: data.type || 'trauma',
      status: 'ativo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responsible: currentUser.name,
      tags: data.tags || [],
      notes: data.notes || '',
      consentRegistered: data.consentRegistered || false,
      consentDate: data.consentDate,
      photos: [],
      versions: [
        {
          id: `ver_${Date.now()}`,
          name: 'Original',
          type: 'base',
          description: 'Versão base - imagens originais',
          status: 'pronto',
          createdAt: new Date().toISOString(),
          author: currentUser.name,
        },
      ],
    };
    mockCases.push(newCase);
    return newCase;
  },

  updateCase: async (id: string, data: Partial<ClinicalCase>): Promise<ClinicalCase> => {
    await new Promise(r => setTimeout(r, 500));
    const index = mockCases.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Caso não encontrado');
    mockCases[index] = { ...mockCases[index], ...data, updatedAt: new Date().toISOString() };
    return mockCases[index];
  },

  // Photos
  uploadPhoto: async (caseId: string, angle: CasePhoto['angle'], file: File): Promise<CasePhoto> => {
    await new Promise(r => setTimeout(r, 1000));
    const photo: CasePhoto = {
      id: `ph_${Date.now()}`,
      angle,
      url: URL.createObjectURL(file),
      capturedAt: new Date().toISOString(),
    };
    const caseItem = mockCases.find(c => c.id === caseId);
    if (caseItem) {
      caseItem.photos.push(photo);
    }
    return photo;
  },

  // Simulations
  startSimulation: async (caseId: string, versionId: string, params: SimulationJob['parameters']): Promise<SimulationJob> => {
    await new Promise(r => setTimeout(r, 500));
    const job: SimulationJob = {
      id: `job_${Date.now()}`,
      caseId,
      versionId,
      status: 'processando',
      progress: 0,
      startedAt: new Date().toISOString(),
      parameters: params,
    };
    mockJobs.push(job);
    return job;
  },

  getJobStatus: async (jobId: string): Promise<SimulationJob | undefined> => {
    await new Promise(r => setTimeout(r, 200));
    return mockJobs.find(j => j.id === jobId);
  },

  // Versions
  createVersion: async (caseId: string, type: 'A' | 'B', description: string): Promise<CaseVersion> => {
    await new Promise(r => setTimeout(r, 500));
    const caseItem = mockCases.find(c => c.id === caseId);
    if (!caseItem) throw new Error('Caso não encontrado');
    
    const existingVersions = caseItem.versions.filter(v => v.type === type);
    const subVersion = existingVersions.length > 0 ? existingVersions.length + 1 : undefined;
    
    const version: CaseVersion = {
      id: `ver_${Date.now()}`,
      name: subVersion ? `Versão ${type}.${subVersion}` : `Versão ${type}`,
      type,
      subVersion,
      description,
      status: 'pronto',
      createdAt: new Date().toISOString(),
      author: currentUser.name,
    };
    
    caseItem.versions.push(version);
    return version;
  },

  // Exports
  createExport: async (caseId: string, versionId: string, format: 'png' | 'jpg' | 'pdf'): Promise<CaseExport> => {
    await new Promise(r => setTimeout(r, 1500));
    const exp: CaseExport = {
      id: `exp_${Date.now()}`,
      caseId,
      versionId,
      format,
      createdAt: new Date().toISOString(),
      downloadUrl: '#',
      fileName: `${caseId}_${versionId}_${Date.now()}.${format}`,
    };
    mockExports.push(exp);
    return exp;
  },

  getExports: async (caseId?: string): Promise<CaseExport[]> => {
    await new Promise(r => setTimeout(r, 300));
    if (caseId) {
      return mockExports.filter(e => e.caseId === caseId);
    }
    return mockExports;
  },
};

// Dashboard stats
export const getDashboardStats = () => {
  const activeCases = mockCases.filter(c => c.status === 'ativo').length;
  const processingJobs = mockJobs.filter(j => j.status === 'processando').length;
  const recentExports = mockExports.length;
  const recentCases = mockCases
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  return {
    activeCases,
    processingJobs,
    recentExports,
    recentCases,
  };
};
