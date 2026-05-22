// SubAgent System Types (inspired by Claude Code's Agent Teams)

export type SubAgentType = 
  | 'explore'     // Read-only codebase exploration
  | 'plan'        // Planning and architecture
  | 'code'        // Code writing/editing
  | 'review'      // Code review
  | 'test'        // Testing
  | 'research'    // Web research
  | 'shell'       // Command execution
  | 'general'     // General purpose
  | 'custom';     // User-defined

export type OutputMode = 'last_message' | 'all_messages' | 'structured_output' | 'summary';
export type ContextInheritance = 'none' | 'minimal' | 'full' | 'fork';
export type SubAgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';

export interface PermissionSet {
  read: boolean;
  write: boolean;
  execute: boolean;
  network: boolean;
  spawn: boolean;     // Can spawn sub-subagents
  maxDepth: number;   // Max nesting depth
}

export interface SubAgentDefinition {
  id: string;
  name: string;
  type: SubAgentType;
  description: string;
  capabilities: string[];
  tools: string[];           // Allowed tools (empty = all for type)
  model?: string;            // Override model
  systemPrompt?: string;     // Custom system prompt
  maxDepth: number;          // Prevent infinite nesting
  permissions: PermissionSet;
  outputMode: OutputMode;
  contextInheritance: ContextInheritance;
  timeout?: number;          // Timeout in ms
}

export interface SubAgentSpawnParams {
  type: SubAgentType;
  prompt: string;
  description: string;
  runInBackground?: boolean;
  parentContext?: ContextInheritance;
  tools?: string[];
  model?: string;
  timeout?: number;
  outputMode?: OutputMode;
  metadata?: Record<string, unknown>;
}

export interface SubAgentResult {
  agentId: string;
  status: SubAgentStatus;
  result: string;
  tokensUsed: { input: number; output: number };
  toolsUsed: string[];
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface SubAgentMessage {
  id: string;
  from: string;        // agentId
  to: string;          // 'parent' or agentId
  type: 'result' | 'progress' | 'error' | 'request' | 'status';
  content: unknown;
  timestamp: number;
}

export interface SubAgentContext {
  agentId: string;
  parentId?: string;
  depth: number;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  tools: string[];
  model: string;
  maxTokens: number;
  permissions: PermissionSet;
}

export interface SubAgentRunnerState {
  status: SubAgentStatus;
  startedAt?: Date;
  completedAt?: Date;
  currentTool?: string;
  progress?: number;
  tokensUsed: { input: number; output: number };
  toolCalls: Array<{ tool: string; params: unknown; result: string; duration: number }>;
}

// Events for observability
export type SubAgentEvent = 
  | { type: 'spawned'; agentId: string; params: SubAgentSpawnParams }
  | { type: 'started'; agentId: string }
  | { type: 'tool_call'; agentId: string; tool: string; params: unknown }
  | { type: 'tool_result'; agentId: string; tool: string; result: string }
  | { type: 'progress'; agentId: string; message: string; progress?: number }
  | { type: 'completed'; agentId: string; result: SubAgentResult }
  | { type: 'error'; agentId: string; error: string }
  | { type: 'cancelled'; agentId: string };

export interface SubAgentEventHandler {
  onEvent: (event: SubAgentEvent) => void;
}

// Default permission sets
export const READONLY_PERMISSIONS: PermissionSet = {
  read: true,
  write: false,
  execute: false,
  network: true,
  spawn: false,
  maxDepth: 1,
};

export const CODING_PERMISSIONS: PermissionSet = {
  read: true,
  write: true,
  execute: true,
  network: true,
  spawn: false,
  maxDepth: 1,
};

export const FULL_PERMISSIONS: PermissionSet = {
  read: true,
  write: true,
  execute: true,
  network: true,
  spawn: true,
  maxDepth: 2,
};

// Tool sets for different agent types
export const TOOL_SETS: Record<SubAgentType, string[]> = {
  explore: ['Read', 'Glob', 'Grep', 'CodebaseMap', 'SymbolFind', 'SymbolReferences'],
  plan: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetchClean', 'CodebaseMap'],
  code: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'DiagnosticsGet', 'FormatCode'],
  review: ['Read', 'Grep', 'DiagnosticsGet', 'TypeCheck', 'SymbolReferences'],
  test: ['Read', 'Write', 'Bash', 'TestRun', 'TestGenerate'],
  research: ['WebSearchMulti', 'WebFetchClean', 'WebFetchMarkdown', 'BrowserLaunch', 'BrowserNavigate'],
  shell: ['Bash', 'Read', 'Write', 'Glob'],
  general: [], // All tools
  custom: [],  // Defined at spawn time
};
