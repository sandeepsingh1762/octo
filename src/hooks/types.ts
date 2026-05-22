// Hooks System Types
// Event-driven extensibility

export type HookEvent = 
  | 'session:start'
  | 'session:end'
  | 'message:before'
  | 'message:after'
  | 'tool:before'
  | 'tool:after'
  | 'tool:result'
  | 'agent:spawn'
  | 'agent:complete'
  | 'error'
  | 'checkpoint'
  | 'compact';

export interface HookEventData {
  event: HookEvent;
  timestamp: Date;
  data: unknown;
  sessionId?: string;
}

export interface HookContext {
  sessionId: string;
  workingDirectory: string;
  config: Record<string, unknown>;
  
  // Utilities
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface HookResult {
  continue: boolean;
  modified?: unknown;
  error?: string;
}

export type HookHandler = (event: HookEventData, ctx: HookContext) => Promise<HookResult>;

export interface Hook {
  id: string;
  name: string;
  event: HookEvent;
  handler: HookHandler;
  priority: number;  // Higher priority runs first
  enabled: boolean;
}

export interface HookDefinition {
  name: string;
  event: HookEvent;
  handler: HookHandler;
  priority?: number;
}
