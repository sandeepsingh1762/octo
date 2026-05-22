// Reasoning system types (inspired by Claude's extended thinking)

export type ThinkingCategory = 
  | 'analysis'      // Breaking down the problem
  | 'planning'      // Creating action plan
  | 'evaluation'    // Assessing options
  | 'reflection'    // Self-correction
  | 'synthesis'     // Combining information
  | 'hypothesis'    // Testing assumptions
  | 'verification'  // Checking work
  | 'decision'      // Making choices
  | 'research'      // Gathering information
  | 'decomposition'; // Breaking into subtasks

export interface ThinkingChunk {
  id: string;
  type: 'thinking';
  content: string;
  category: ThinkingCategory;
  depth: number;         // Nesting level (0 = top level)
  confidence: number;    // 0-1 confidence score
  timestamp: number;
  parentId?: string;     // For nested thoughts
  metadata?: Record<string, unknown>;
}

export interface Conclusion {
  id: string;
  summary: string;
  confidence: number;
  supportingThoughts: string[];  // ThinkingChunk IDs
  alternatives?: string[];       // Alternative conclusions considered
  timestamp: number;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PlanStep {
  id: string;
  description: string;
  tool?: string;
  params?: Record<string, unknown>;
  expectedOutcome: string;
  fallback?: PlanStep;
  dependencies: string[];    // IDs of steps that must complete first
  estimatedTokens?: number;
  riskLevel: RiskLevel;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
}

export interface ActionPlan {
  id: string;
  goal: string;
  steps: PlanStep[];
  dependencies: Map<string, string[]>;  // step ID -> dependency IDs
  estimatedTokens: number;
  riskAssessment: RiskLevel;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReasoningSession {
  id: string;
  goal: string;
  context: string;
  thoughts: ThinkingChunk[];
  conclusions: Conclusion[];
  plan?: ActionPlan;
  confidence: number;
  startedAt: Date;
  completedAt?: Date;
  tokensUsed: number;
}

export interface ReasoningConfig {
  maxThinkingDepth: number;     // Maximum nesting level
  maxThinkingTokens: number;    // Token budget for thinking
  minConfidence: number;        // Minimum confidence to proceed
  enableParallelThinking: boolean;
  thinkingCategories: ThinkingCategory[];  // Enabled categories
  showThinkingToUser: boolean;
  autoReplan: boolean;          // Automatically replan on failure
}

export const DEFAULT_REASONING_CONFIG: ReasoningConfig = {
  maxThinkingDepth: 3,
  maxThinkingTokens: 10000,
  minConfidence: 0.6,
  enableParallelThinking: true,
  thinkingCategories: ['analysis', 'planning', 'evaluation', 'reflection', 'verification'],
  showThinkingToUser: true,
  autoReplan: true,
};

export interface ReasoningResult {
  success: boolean;
  plan?: ActionPlan;
  thoughts: ThinkingChunk[];
  conclusions: Conclusion[];
  confidence: number;
  tokensUsed: number;
  error?: string;
}

// For streaming thinking output
export interface ThinkingEvent {
  type: 'thought' | 'conclusion' | 'plan_step' | 'plan_complete' | 'error';
  data: ThinkingChunk | Conclusion | PlanStep | ActionPlan | { message: string };
}
