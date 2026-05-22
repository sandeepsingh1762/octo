// Specialized Agent Teams Types
// Based on 2026 multi-agent orchestration patterns

import type { SubAgentDefinition, SubAgentResult, SubAgentSpawnParams } from "../subagents/types.js";

export type OrchestrationPattern = 
  | 'supervisor'    // Central agent delegates to specialists
  | 'pipeline'      // Linear sequential execution
  | 'swarm'         // Decentralized, autonomous agents
  | 'router'        // Classify and dispatch to single specialist
  | 'hierarchical'  // Multi-level delegation
  | 'hybrid';       // Combination based on task

export interface AgentRole {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  systemPrompt?: string;
}

export interface TeamDefinition {
  id: string;
  name: string;
  description: string;
  pattern: OrchestrationPattern;
  coordinator: AgentRole;
  specialists: Map<string, AgentRole>;
  defaultTimeout?: number;
}

export interface TeamMemory {
  shortTerm: Map<string, unknown>;      // Session context
  workingMemory: Map<string, string>;   // Current task state
  sharedContext: string[];              // Shared context items
}

export interface TaskQueueItem {
  id: string;
  task: string;
  priority: number;
  assignedTo?: string;
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TeamState {
  teamId: string;
  activeAgents: string[];
  completedTasks: number;
  failedTasks: number;
  currentTask?: string;
  memory: TeamMemory;
  taskQueue: TaskQueueItem[];
}

export interface TeamExecutionResult {
  success: boolean;
  result: string;
  agentResults: SubAgentResult[];
  tokensUsed: { input: number; output: number };
  duration: number;
  tasksCompleted: number;
  tasksFailed: number;
}

// Events for team orchestration
export type TeamEvent = 
  | { type: 'team_started'; teamId: string; task: string }
  | { type: 'task_delegated'; teamId: string; agentId: string; task: string }
  | { type: 'agent_completed'; teamId: string; agentId: string; result: SubAgentResult }
  | { type: 'task_queued'; teamId: string; taskId: string; task: string }
  | { type: 'team_completed'; teamId: string; result: TeamExecutionResult }
  | { type: 'team_error'; teamId: string; error: string };

export interface TeamEventHandler {
  onEvent: (event: TeamEvent) => void;
}

// Coordinator interface that all patterns implement
export interface TeamCoordinator {
  executeTask(task: string, context?: string): Promise<TeamExecutionResult>;
  getState(): TeamState;
  cancel(): void;
}
