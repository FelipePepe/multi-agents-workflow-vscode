export type SddPhase =
  | 'sdd-explore'
  | 'sdd-propose'
  | 'sdd-spec'
  | 'sdd-design'
  | 'sdd-tasks'
  | 'sdd-apply'
  | 'sdd-verify'
  | 'sdd-archive';

export type PhaseStatus = 'pending' | 'in-progress' | 'complete' | 'fail';

export type AgentRole =
  | 'orchestrator'
  | 'explorer'
  | 'proposal'
  | 'spec'
  | 'design'
  | 'tasks'
  | 'implementer'
  | 'tester'
  | 'verifier'
  | 'fixer'
  | 'archiver';

export interface WorkflowState {
  changeName: string;
  changeDir: string;
  createdAt: string;
  updatedAt: string;
  currentPhase: SddPhase;
  phases: Record<SddPhase, PhaseStatus>;
  verifyVerdict: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL' | null;
  reviewLoopIteration: number;
  notes: string;
}

export interface ModelsConfig {
  provider: string;
  baseUrl: string;
  defaultModel: string;
  models: Record<AgentRole | 'fallback', string>;
}

export interface AgentRunOptions {
  changeName: string;
  role: AgentRole;
  artifactPaths?: string[];
  userPrompt?: string;
  signal?: AbortSignal;
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export interface WorkflowPhaseConfig {
  id: SddPhase;
  agent: AgentRole;
  artifact: {
    reads: string[];
    writes: string;
  };
}

export interface WorkflowConfig {
  phases: WorkflowPhaseConfig[];
}
