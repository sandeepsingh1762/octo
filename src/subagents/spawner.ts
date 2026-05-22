import type {
  SubAgentType,
  SubAgentDefinition,
  SubAgentSpawnParams,
  SubAgentResult,
  SubAgentContext,
  SubAgentEvent,
  SubAgentEventHandler,
  PermissionSet,
  ContextInheritance,
  OutputMode,
  TOOL_SETS,
  READONLY_PERMISSIONS,
  CODING_PERMISSIONS,
  FULL_PERMISSIONS,
} from "./types.js";
import { SubAgentRunner } from "./runner.js";

type Message = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string };
type LLMChunk = { type: 'text' | 'tool_call' | 'done'; content?: string; tool?: string; params?: Record<string, unknown> };

function generateId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Default definitions for built-in agent types
const DEFAULT_DEFINITIONS: Record<SubAgentType, Omit<SubAgentDefinition, 'id'>> = {
  explore: {
    name: 'Explorer',
    type: 'explore',
    description: 'Read-only codebase exploration agent',
    capabilities: ['file reading', 'code search', 'symbol lookup'],
    tools: ['Read', 'Glob', 'Grep', 'CodebaseMap', 'SymbolFind', 'SymbolReferences'],
    maxDepth: 1,
    permissions: {
      read: true,
      write: false,
      execute: false,
      network: false,
      spawn: false,
      maxDepth: 1,
    },
    outputMode: 'last_message',
    contextInheritance: 'minimal',
  },
  plan: {
    name: 'Planner',
    type: 'plan',
    description: 'Architecture and planning agent',
    capabilities: ['planning', 'design', 'research'],
    tools: ['Read', 'Glob', 'Grep', 'WebSearchMulti', 'WebFetchClean', 'CodebaseMap'],
    maxDepth: 1,
    permissions: {
      read: true,
      write: false,
      execute: false,
      network: true,
      spawn: false,
      maxDepth: 1,
    },
    outputMode: 'last_message',
    contextInheritance: 'minimal',
  },
  code: {
    name: 'Coder',
    type: 'code',
    description: 'Code writing and editing agent',
    capabilities: ['code writing', 'editing', 'refactoring'],
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'DiagnosticsGet', 'FormatCode', 'StrReplace'],
    maxDepth: 1,
    permissions: {
      read: true,
      write: true,
      execute: true,
      network: false,
      spawn: false,
      maxDepth: 1,
    },
    outputMode: 'last_message',
    contextInheritance: 'minimal',
  },
  review: {
    name: 'Reviewer',
    type: 'review',
    description: 'Code review agent',
    capabilities: ['code review', 'analysis', 'quality checks'],
    tools: ['Read', 'Grep', 'DiagnosticsGet', 'TypeCheck', 'SymbolReferences'],
    maxDepth: 1,
    permissions: {
      read: true,
      write: false,
      execute: false,
      network: false,
      spawn: false,
      maxDepth: 1,
    },
    outputMode: 'structured_output',
    contextInheritance: 'minimal',
  },
  test: {
    name: 'Tester',
    type: 'test',
    description: 'Testing agent',
    capabilities: ['test writing', 'test running', 'test analysis'],
    tools: ['Read', 'Write', 'Bash', 'TestRun', 'TestGenerate'],
    maxDepth: 1,
    permissions: {
      read: true,
      write: true,
      execute: true,
      network: false,
      spawn: false,
      maxDepth: 1,
    },
    outputMode: 'last_message',
    contextInheritance: 'minimal',
  },
  research: {
    name: 'Researcher',
    type: 'research',
    description: 'Web research agent',
    capabilities: ['web search', 'documentation reading', 'information gathering'],
    tools: ['WebSearchMulti', 'WebFetchClean', 'WebFetchMarkdown', 'WebSearchAndFetch', 'BrowserLaunch', 'BrowserNavigate', 'BrowserSnapshot'],
    maxDepth: 1,
    permissions: {
      read: true,
      write: false,
      execute: false,
      network: true,
      spawn: false,
      maxDepth: 1,
    },
    outputMode: 'summary',
    contextInheritance: 'none',
  },
  shell: {
    name: 'Shell',
    type: 'shell',
    description: 'Command execution specialist',
    capabilities: ['command execution', 'scripts', 'system operations'],
    tools: ['Bash', 'Read', 'Write', 'Glob'],
    maxDepth: 1,
    permissions: {
      read: true,
      write: true,
      execute: true,
      network: false,
      spawn: false,
      maxDepth: 1,
    },
    outputMode: 'last_message',
    contextInheritance: 'none',
  },
  general: {
    name: 'General',
    type: 'general',
    description: 'General purpose agent with all capabilities',
    capabilities: ['all'],
    tools: [], // Empty means all tools
    maxDepth: 2,
    permissions: {
      read: true,
      write: true,
      execute: true,
      network: true,
      spawn: true,
      maxDepth: 2,
    },
    outputMode: 'last_message',
    contextInheritance: 'minimal',
  },
  custom: {
    name: 'Custom',
    type: 'custom',
    description: 'User-defined custom agent',
    capabilities: [],
    tools: [],
    maxDepth: 1,
    permissions: {
      read: true,
      write: false,
      execute: false,
      network: false,
      spawn: false,
      maxDepth: 1,
    },
    outputMode: 'last_message',
    contextInheritance: 'none',
  },
};

// System prompts for different agent types
const SYSTEM_PROMPTS: Record<SubAgentType, string> = {
  explore: `You are an Explorer agent specialized in codebase exploration.
Your job is to find and understand code in the repository.
You can ONLY READ files - you cannot modify anything.
Be thorough and report what you find.
Focus on providing useful, actionable information.`,

  plan: `You are a Planner agent specialized in software architecture and design.
Your job is to analyze requirements and create implementation plans.
You can research online and read code, but cannot modify files.
Provide detailed, step-by-step plans with clear justifications.`,

  code: `You are a Coder agent specialized in writing and editing code.
Your job is to implement features, fix bugs, and refactor code.
You have full access to file operations and can run commands.
Write clean, well-documented code following best practices.
Always verify your changes work before completing.`,

  review: `You are a Reviewer agent specialized in code review.
Your job is to analyze code for issues, suggest improvements, and ensure quality.
You can only read files - provide feedback without making changes.
Focus on: correctness, performance, security, maintainability, and style.
Provide specific, actionable feedback.`,

  test: `You are a Tester agent specialized in software testing.
Your job is to write tests, run them, and analyze results.
Ensure comprehensive test coverage for the code you're testing.
Write tests that are maintainable and clearly document expected behavior.`,

  research: `You are a Researcher agent specialized in gathering information from the web.
Your job is to find documentation, tutorials, best practices, and solutions.
Search thoroughly and provide well-sourced, accurate information.
Summarize findings clearly and cite sources.`,

  shell: `You are a Shell agent specialized in command execution.
Your job is to run commands, scripts, and system operations.
Be careful with destructive commands - verify before executing.
Report command outputs and any errors clearly.`,

  general: `You are a general-purpose autonomous coding assistant.
You have access to all tools and capabilities.
Analyze tasks carefully, plan your approach, and execute systematically.
You can spawn sub-agents for specialized tasks if needed.`,

  custom: `You are a specialized agent configured for a specific task.
Follow the instructions provided in your prompt carefully.
Use only the tools available to you.`,
};

export interface SpawnerConfig {
  toolExecutor: (tool: string, params: Record<string, unknown>) => Promise<string>;
  llmExecutor: (messages: Message[], tools: string[]) => AsyncIterable<LLMChunk>;
  eventHandler?: SubAgentEventHandler;
  defaultModel?: string;
  defaultTimeout?: number;
  maxConcurrentAgents?: number;
  getAllTools?: () => string[];
}

export class SubAgentSpawner {
  private config: SpawnerConfig;
  private activeAgents: Map<string, SubAgentRunner> = new Map();
  private completedAgents: Map<string, SubAgentResult> = new Map();
  private parentContext?: {
    messages: Message[];
    depth: number;
  };

  constructor(config: SpawnerConfig) {
    this.config = config;
  }

  setParentContext(messages: Message[], depth = 0): void {
    this.parentContext = { messages, depth };
  }

  async spawn(params: SubAgentSpawnParams): Promise<string | SubAgentResult> {
    const agentId = generateId();
    
    // Check concurrent agent limit
    if (this.config.maxConcurrentAgents && 
        this.activeAgents.size >= this.config.maxConcurrentAgents) {
      throw new Error(`Maximum concurrent agents (${this.config.maxConcurrentAgents}) reached`);
    }

    // Get definition for type
    const baseDef = DEFAULT_DEFINITIONS[params.type];
    
    // Create context
    const context = this.createContext(agentId, params, baseDef);

    // Check depth limit
    if (this.parentContext && this.parentContext.depth >= baseDef.maxDepth) {
      throw new Error(`Maximum agent depth (${baseDef.maxDepth}) reached`);
    }

    // Create runner
    const runner = new SubAgentRunner({
      id: agentId,
      context,
      toolExecutor: this.config.toolExecutor,
      llmExecutor: this.config.llmExecutor,
      eventHandler: this.config.eventHandler,
      timeout: params.timeout || this.config.defaultTimeout,
    });

    // Emit spawn event
    if (this.config.eventHandler) {
      this.config.eventHandler.onEvent({
        type: 'spawned',
        agentId,
        params,
      });
    }

    this.activeAgents.set(agentId, runner);

    if (params.runInBackground) {
      // Run async, return ID immediately
      this.runInBackground(agentId, runner);
      return agentId;
    } else {
      // Run sync, wait for result
      const result = await runner.run();
      this.activeAgents.delete(agentId);
      this.completedAgents.set(agentId, result);
      return result;
    }
  }

  private createContext(
    agentId: string,
    params: SubAgentSpawnParams,
    baseDef: Omit<SubAgentDefinition, 'id'>
  ): SubAgentContext {
    // Build system prompt
    let systemPrompt = SYSTEM_PROMPTS[params.type];
    if (params.type === 'custom' && baseDef.systemPrompt) {
      systemPrompt = baseDef.systemPrompt;
    }

    // Determine tools
    let tools = params.tools || baseDef.tools;
    if (tools.length === 0 && this.config.getAllTools) {
      tools = this.config.getAllTools();
    }

    // Build initial messages
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    
    // Handle context inheritance
    const inheritance = params.parentContext || baseDef.contextInheritance;
    if (this.parentContext && inheritance !== 'none') {
      if (inheritance === 'full' || inheritance === 'fork') {
        // Include full parent conversation, filtering out tool messages
        const filteredMessages = this.parentContext.messages
          .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
          .map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }));
        messages.push(...filteredMessages);
      } else if (inheritance === 'minimal') {
        // Include only recent context
        const recent = this.parentContext.messages.slice(-5);
        if (recent.length > 0) {
          messages.push({
            role: 'system',
            content: `Context from parent agent:\n${recent.map(m => `${m.role}: ${m.content}`).join('\n')}`,
          });
        }
      }
    }

    // Add the task prompt
    messages.push({
      role: 'user',
      content: params.prompt,
    });

    return {
      agentId,
      parentId: this.parentContext ? 'parent' : undefined,
      depth: (this.parentContext?.depth || 0) + 1,
      systemPrompt,
      messages,
      tools,
      model: params.model || this.config.defaultModel || 'default',
      maxTokens: 8192,
      permissions: baseDef.permissions,
    };
  }

  private async runInBackground(agentId: string, runner: SubAgentRunner): Promise<void> {
    try {
      const result = await runner.run();
      this.activeAgents.delete(agentId);
      this.completedAgents.set(agentId, result);
    } catch (error) {
      this.activeAgents.delete(agentId);
      this.completedAgents.set(agentId, {
        agentId,
        status: 'failed',
        result: '',
        tokensUsed: { input: 0, output: 0 },
        toolsUsed: [],
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getResult(agentId: string): Promise<SubAgentResult | null> {
    // Check completed first
    if (this.completedAgents.has(agentId)) {
      return this.completedAgents.get(agentId)!;
    }

    // Check if still running
    if (this.activeAgents.has(agentId)) {
      return null; // Still running
    }

    return null; // Not found
  }

  async waitForResult(agentId: string, timeout?: number): Promise<SubAgentResult> {
    const startTime = Date.now();
    const checkInterval = 100; // ms

    while (true) {
      const result = await this.getResult(agentId);
      if (result) {
        return result;
      }

      if (timeout && Date.now() - startTime > timeout) {
        // Try to cancel the agent
        this.cancel(agentId);
        throw new Error(`Timeout waiting for agent ${agentId}`);
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  cancel(agentId: string): boolean {
    const runner = this.activeAgents.get(agentId);
    if (runner) {
      runner.abort('Cancelled by spawner');
      return true;
    }
    return false;
  }

  cancelAll(): number {
    let count = 0;
    for (const [id, runner] of this.activeAgents) {
      runner.abort('Cancelled by spawner');
      count++;
    }
    return count;
  }

  getActiveAgents(): string[] {
    return Array.from(this.activeAgents.keys());
  }

  getCompletedAgents(): Map<string, SubAgentResult> {
    return new Map(this.completedAgents);
  }

  getAgentState(agentId: string): { status: string; state?: unknown } | null {
    const runner = this.activeAgents.get(agentId);
    if (runner) {
      return { status: 'running', state: runner.getState() };
    }

    const result = this.completedAgents.get(agentId);
    if (result) {
      return { status: result.status, state: result };
    }

    return null;
  }

  clearCompleted(): number {
    const count = this.completedAgents.size;
    this.completedAgents.clear();
    return count;
  }
}

// Convenience function for parallel spawning
export async function spawnParallel(
  spawner: SubAgentSpawner,
  agentParams: SubAgentSpawnParams[]
): Promise<SubAgentResult[]> {
  // Spawn all agents
  const agentIds = await Promise.all(
    agentParams.map(params => spawner.spawn({ ...params, runInBackground: true }))
  );

  // Wait for all to complete
  const results = await Promise.all(
    (agentIds as string[]).map(id => spawner.waitForResult(id))
  );

  return results;
}

// Convenience function for sequential spawning
export async function spawnSequential(
  spawner: SubAgentSpawner,
  agentParams: SubAgentSpawnParams[]
): Promise<SubAgentResult[]> {
  const results: SubAgentResult[] = [];

  for (const params of agentParams) {
    const result = await spawner.spawn({ ...params, runInBackground: false });
    results.push(result as SubAgentResult);
  }

  return results;
}

// Team execution helpers
export interface TeamExecutionParams {
  task: string;
  context?: string;
  teamType: 'development' | 'research' | 'devops' | 'custom';
  customRoles?: Array<{
    name: string;
    type: SubAgentType;
    prompt: string;
  }>;
}

export async function executeWithTeam(
  spawner: SubAgentSpawner,
  params: TeamExecutionParams
): Promise<{
  success: boolean;
  results: SubAgentResult[];
  summary: string;
}> {
  const { task, context, teamType, customRoles } = params;
  
  // Define team roles based on type
  let roles: Array<{ name: string; type: SubAgentType; prompt: string }>;
  
  switch (teamType) {
    case 'development':
      roles = [
        { name: 'Planner', type: 'plan', prompt: `Analyze this task and create a detailed plan: ${task}` },
        { name: 'Developer', type: 'code', prompt: `Implement based on the plan: ${task}` },
        { name: 'Reviewer', type: 'review', prompt: `Review the implementation: ${task}` },
      ];
      break;
    case 'research':
      roles = [
        { name: 'Explorer', type: 'explore', prompt: `Research the codebase for: ${task}` },
        { name: 'Researcher', type: 'research', prompt: `Research external sources for: ${task}` },
        { name: 'Synthesizer', type: 'general', prompt: `Synthesize findings about: ${task}` },
      ];
      break;
    case 'devops':
      roles = [
        { name: 'Analyzer', type: 'explore', prompt: `Analyze infrastructure for: ${task}` },
        { name: 'Builder', type: 'shell', prompt: `Execute build/deploy tasks: ${task}` },
        { name: 'Tester', type: 'test', prompt: `Run tests and validation: ${task}` },
      ];
      break;
    case 'custom':
      roles = customRoles || [];
      break;
    default:
      roles = [{ name: 'Agent', type: 'general', prompt: task }];
  }
  
  if (roles.length === 0) {
    return { success: false, results: [], summary: 'No roles defined for team' };
  }
  
  // Execute sequentially (supervisor pattern)
  const results: SubAgentResult[] = [];
  let accumulatedContext = context || '';
  
  for (const role of roles) {
    const result = await spawner.spawn({
      type: role.type,
      prompt: `${role.prompt}\n\nContext: ${accumulatedContext}`,
      description: `${role.name} agent`,
      runInBackground: false,
    }) as SubAgentResult;
    
    results.push(result);
    
    if (result.status === 'completed' && result.result) {
      accumulatedContext += `\n\n[${role.name} Output]:\n${result.result}`;
    }
    
    if (result.status === 'failed') {
      return {
        success: false,
        results,
        summary: `Team execution failed at ${role.name}: ${result.error}`,
      };
    }
  }
  
  return {
    success: true,
    results,
    summary: `Team ${teamType} completed task successfully. ${results.length} agents executed.`,
  };
}

export default SubAgentSpawner;
