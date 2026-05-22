// Fully Autonomous Mode Types
// Agent operates without human interaction

export interface AutonomousConfig {
  enabled: boolean;
  maxIterations: number;        // Safety limit
  maxTokenBudget: number;       // Cost limit
  maxTimeMinutes: number;       // Time limit
  checkpointInterval: number;   // Steps between checkpoints
  escalationPolicy: EscalationPolicy;
  recoveryPolicy: RecoveryPolicy;
}

export interface EscalationPolicy {
  askOnHighRiskAction: boolean;
  askOnUncertainty: number;       // Confidence threshold 0-1
  askOnExpensiveAction: boolean;
  askOnDeadlock: boolean;
  highRiskPatterns: string[];     // Regex patterns for high-risk commands
  maxConsecutiveErrors: number;
}

export interface RecoveryPolicy {
  maxRetries: number;
  retryBackoffMs: number;
  onRateLimitWaitMs: number;
  onContextOverflow: 'compact' | 'summarize' | 'escalate';
  onDeadlock: 'replan' | 'escalate' | 'abort';
  onExternalFailure: 'retry' | 'skip' | 'escalate';
}

export const DEFAULT_AUTONOMOUS_CONFIG: AutonomousConfig = {
  enabled: false,
  maxIterations: 100,
  maxTokenBudget: 500000,
  maxTimeMinutes: 60,
  checkpointInterval: 10,
  escalationPolicy: {
    askOnHighRiskAction: true,
    askOnUncertainty: 0.4,
    askOnExpensiveAction: true,
    askOnDeadlock: true,
    highRiskPatterns: [
      'rm\\s+-rf',
      'git\\s+push.*--force',
      'drop\\s+table',
      'delete\\s+from',
      'sudo',
      'curl.*\\|\\s*sh',
      'eval\\s*\\(',
      'chmod\\s+777',
    ],
    maxConsecutiveErrors: 3,
  },
  recoveryPolicy: {
    maxRetries: 3,
    retryBackoffMs: 1000,
    onRateLimitWaitMs: 60000,
    onContextOverflow: 'compact',
    onDeadlock: 'replan',
    onExternalFailure: 'retry',
  },
};

export type ActionType = 'tool' | 'message' | 'spawn' | 'plan' | 'checkpoint';

export interface Action {
  id: string;
  type: ActionType;
  description: string;
  tool?: string;
  params?: Record<string, unknown>;
  message?: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  estimatedTokens?: number;
}

export interface ActionResult {
  actionId: string;
  success: boolean;
  output: string;
  tokensUsed: number;
  duration: number;
  error?: string;
}

export interface AutonomousState {
  goal: string;
  context: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'escalated';
  iteration: number;
  tokensUsed: number;
  startTime: Date;
  lastCheckpoint?: Date;
  currentPlan?: string[];
  history: Array<{ action: Action; result: ActionResult }>;
  errors: string[];
  checkpoints: Checkpoint[];
}

export interface Checkpoint {
  id: string;
  timestamp: Date;
  iteration: number;
  state: Partial<AutonomousState>;
  description: string;
}

export type EscalationReason = 
  | 'high_risk_action'
  | 'low_confidence'
  | 'expensive_operation'
  | 'deadlock'
  | 'max_errors'
  | 'budget_exceeded'
  | 'time_exceeded'
  | 'unknown_error';

export interface EscalationRequest {
  reason: EscalationReason;
  action?: Action;
  message: string;
  options: string[];
  defaultOption: string;
}

export interface AutonomousResult {
  success: boolean;
  goal: string;
  result: string;
  iterations: number;
  tokensUsed: number;
  duration: number;
  actionsCompleted: number;
  errors: string[];
  escalations: EscalationRequest[];
}

// Events for monitoring
export type AutonomousEvent =
  | { type: 'started'; goal: string }
  | { type: 'iteration'; iteration: number; action: Action }
  | { type: 'action_completed'; action: Action; result: ActionResult }
  | { type: 'checkpoint'; checkpoint: Checkpoint }
  | { type: 'escalation'; request: EscalationRequest }
  | { type: 'recovery'; reason: string; action: string }
  | { type: 'completed'; result: AutonomousResult }
  | { type: 'error'; error: string };

export interface AutonomousEventHandler {
  onEvent: (event: AutonomousEvent) => void;
}
