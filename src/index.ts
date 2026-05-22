// Core exports
export * from "./ai/index.js";
export * from "./agent/index.js";

// Tools - export everything except Task to avoid conflict
export { 
  registerTool, 
  executeTool, 
  getTool,
  getAllTools,
  getToolSchemas,
  registerAllTools,
  registerCodebaseTools,
  registerStrReplaceTools,
  registerBrowserAutomationTools,
  registerWebEnhancedTools,
  registerCodingAdvancedTools,
  registerTaskBucketTools,
} from "./tools/index.js";

export * from "./config/index.js";
export * from "./memory/store.js";

// Tasks store
export { type Task as AgentTask, createTask, updateTask, getTask, listTasks } from "./tasks/store.js";

// Advanced systems - using explicit imports to avoid name conflicts
export { Reasoner, PlanExecuteLoop, type ActionPlan, type PlanStep, type ReasoningSession, type ReasoningConfig } from "./reasoning/index.js";
export { SubAgentSpawner, SubAgentRunner, MessageBus, ProgressTracker, ResultAggregator, SubAgentCoordinator, spawnParallel, type SubAgentDefinition, type SubAgentResult, type SubAgentContext } from "./subagents/index.js";
export { SupervisorTeam, PipelineTeam, createCICDPipeline, createCodeReviewPipeline, developmentTeam, researchTeam, devopsTeam, type TeamDefinition, type TeamExecutionResult, type OrchestrationPattern } from "./teams/index.js";
export { COMMANDS, parseCommand, getCompletions, validateCommand, type SlashCommand, type ParsedCommand, type CommandContext, type CommandResult } from "./commands/index.js";
export { AutonomousAgent, RecoveryManager, type AutonomousConfig, type AutonomousResult, type EscalationPolicy, type RecoveryPolicy } from "./autonomous/index.js";
export { SkillLoader, SkillExecutor, type Skill, type SkillTriggers, type SkillContext, type SkillResult } from "./skills/index.js";
export { SessionManager, type Session as AgentSession, type SessionContext as AgentSessionContext, type SessionCheckpoint, type SessionSummary } from "./session/index.js";
export { HookManager, createLoggingHook, createTimingHook, createErrorRecoveryHook, type Hook, type HookEvent, type HookEventData, type HookContext as AgentHookContext, type HookResult } from "./hooks/index.js";
export { Logger, getLogger, configureLogger, ErrorHandler, LRUCache, ToolCache, OctopusError, NetworkError, APIError, RateLimitError, ToolError, ValidationError, type LogLevel, type LogEntry, type LoggerConfig } from "./utils/index.js";
