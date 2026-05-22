// Integrated Agent Runner
// Ties together the agent loop with all advanced features

import type { StreamEvent, Message, ToolCall } from "../ai/types.js";
import { getProvider, buildProviderConfig, initializeKeyManager } from "../ai/registry.js";
import { getToolSchemas, executeTool } from "../tools/registry.js";
import type { Config } from "../config/index.js";
import { maybeCompact } from "../context/compaction.js";
import { AgentState } from "./state.js";
import { isSafeBash } from "../tools/shell.js";
import { HookManager, type HookEvent, type HookEventData } from "../hooks/index.js";
import { SessionManager, type Session, type Message as SessionMessage } from "../session/index.js";
import { SkillLoader, SkillExecutor, type SkillContext } from "../skills/index.js";
import { AutonomousAgent, type AutonomousAgentConfig, DEFAULT_AUTONOMOUS_CONFIG, type AutonomousConfig } from "../autonomous/index.js";
import { Logger, getLogger } from "../utils/logger.js";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_start"; name: string; inputs: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: string; permitted: boolean }
  | { type: "turn_done"; input_tokens: number; output_tokens: number }
  | { type: "permission_request"; description: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "skill_triggered"; name: string }
  | { type: "autonomous_step"; iteration: number; action: string }
  | { type: "checkpoint"; id: string };

export interface RunnerConfig {
  enableHooks: boolean;
  enableSkills: boolean;
  enableSessions: boolean;
  enableAutonomous: boolean;
  autonomousConfig?: Partial<AutonomousConfig>;
}

const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  enableHooks: true,
  enableSkills: true,
  enableSessions: true,
  enableAutonomous: false,
};

export class IntegratedAgentRunner {
  private config: Config;
  private systemPrompt: string;
  private runnerConfig: RunnerConfig;
  
  private hookManager: HookManager;
  private sessionManager: SessionManager;
  private skillLoader: SkillLoader;
  private skillExecutor: SkillExecutor;
  private logger: Logger;
  
  private state: AgentState;
  private session: Session | null = null;

  constructor(
    config: Config,
    systemPrompt: string,
    runnerConfig: Partial<RunnerConfig> = {}
  ) {
    this.config = config;
    this.systemPrompt = systemPrompt;
    this.runnerConfig = { ...DEFAULT_RUNNER_CONFIG, ...runnerConfig };
    
    this.hookManager = new HookManager();
    this.sessionManager = new SessionManager();
    this.skillLoader = new SkillLoader(process.cwd());
    this.skillExecutor = new SkillExecutor({ workingDirectory: process.cwd() });
    this.logger = getLogger();
    
    this.state = new AgentState();
  }

  async initialize(): Promise<void> {
    await initializeKeyManager();
    // Load skills
    if (this.runnerConfig.enableSkills) {
      await this.skillLoader.loadAll();
    }
    
    // Create or load session
    if (this.runnerConfig.enableSessions) {
      this.session = this.sessionManager.create({
        model: this.config.model,
        workingDirectory: process.cwd(),
      });
    }
  }

  async *run(userMessage: string): AsyncGenerator<AgentEvent> {
    // Trigger session:start hook
    if (this.runnerConfig.enableHooks) {
      await this.hookManager.trigger('session:start', { message: userMessage });
    }

    // Check for skill triggers
    if (this.runnerConfig.enableSkills) {
      const triggeredSkills = this.skillLoader.findByTrigger({ keyword: userMessage });
      for (const skill of triggeredSkills) {
        yield { type: "skill_triggered", name: skill.name };
        
        const skillContext: SkillContext = {
          workingDirectory: process.cwd(),
          userPrompt: userMessage,
          userMessage: userMessage,
          sessionId: this.session?.id,
        };
        
        const result = await this.skillExecutor.execute(skill, skillContext);
        
        if (result.instructions) {
          // Prepend skill instructions to system prompt
          this.systemPrompt = result.instructions + '\n\n' + this.systemPrompt;
        }
      }
    }

    // Check for autonomous mode
    if (this.runnerConfig.enableAutonomous) {
      yield* this.runAutonomous(userMessage);
      return;
    }

    // Regular agent loop
    yield* this.runStandard(userMessage);
  }

  private async *runStandard(userMessage: string): AsyncGenerator<AgentEvent> {
    try {
      const msg: Message = { role: "user", content: userMessage };
      this.state.messages.push(msg);
      
      // Save to session
      if (this.session) {
        this.sessionManager.addMessage({ role: 'user', content: userMessage });
      }

      while (!this.state.cancelled) {
        this.state.turn_count++;
        maybeCompact(this.state.messages, this.config.model);

        // Hook: message:before
        if (this.runnerConfig.enableHooks) {
          const modified = await this.hookManager.trigger('message:before', {
            messages: this.state.messages,
            turn: this.state.turn_count,
          });
          if (modified && Array.isArray(modified)) {
            this.state.messages = modified as Message[];
          }
        }

        const provider = getProvider(this.config.model);
        const pConfig = await buildProviderConfig(this.config.model, {
          maxTokens: this.config.max_tokens,
          temperature: 0.7,
          thinking: this.config.thinking,
          thinkingBudget: this.config.thinking_budget,
        });

        let turnText = "";
        let turnToolCalls: ToolCall[] = [];
        let inTokens = 0;
        let outTokens = 0;

        const stream = provider.stream(this.systemPrompt, this.state.messages, getToolSchemas(), pConfig);
        for await (const ev of stream) {
          if (this.state.cancelled) return;
          if (ev.type === "text") {
            turnText += ev.text;
            yield { type: "text", text: ev.text };
          } else if (ev.type === "thinking") {
            yield { type: "thinking", text: ev.text };
          }
          if (ev.type === "turn_done") {
            turnToolCalls = ev.tool_calls;
            inTokens = ev.input_tokens;
            outTokens = ev.output_tokens;
          }
        }

        this.state.messages.push({
          role: "assistant",
          content: turnText,
          tool_calls: turnToolCalls.length > 0 ? turnToolCalls : undefined,
        });
        
        // Save assistant message to session
        if (this.session) {
          this.sessionManager.addMessage({
            role: 'assistant',
            content: turnText,
          });
        }
        
        this.state.total_input_tokens += inTokens;
        this.state.total_output_tokens += outTokens;
        yield { type: "turn_done", input_tokens: inTokens, output_tokens: outTokens };

        if (!turnToolCalls.length) {
          // Hook: message:after
          if (this.runnerConfig.enableHooks) {
            await this.hookManager.trigger('message:after', {
              response: turnText,
              tokens: { input: inTokens, output: outTokens },
            });
          }
          yield { type: "done" };
          return;
        }

        for (const tc of turnToolCalls) {
          if (this.state.cancelled) return;
          
          // Hook: tool:before
          if (this.runnerConfig.enableHooks) {
            await this.hookManager.trigger('tool:before', {
              tool: tc.name,
              input: tc.input,
            });
          }
          
          yield { type: "tool_start", name: tc.name, inputs: tc.input };

          const perm = this.checkPermission(tc);
          if (!perm.permitted) {
            yield { type: "permission_request", description: perm.description || `${tc.name}` };
            const result = "Denied: permission required for this operation";
            yield { type: "tool_end", name: tc.name, result, permitted: false };
            this.state.messages.push({
              role: "tool",
              tool_call_id: tc.id,
              name: tc.name,
              content: result,
            });
            continue;
          }

          const result = await executeTool(tc.name, tc.input, { model: this.config.model }, this.config.max_tool_output);
          
          // Hook: tool:after
          if (this.runnerConfig.enableHooks) {
            await this.hookManager.trigger('tool:after', {
              tool: tc.name,
              input: tc.input,
              output: result,
            });
          }
          
          yield { type: "tool_end", name: tc.name, result, permitted: true };
          this.state.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: tc.name,
            content: result,
          });
        }
      }
    } catch (e) {
      // Hook: error
      if (this.runnerConfig.enableHooks) {
        await this.hookManager.trigger('error', { error: e });
      }
      yield { type: "error", message: e instanceof Error ? e.message : String(e) };
    }
  }

  private async *runAutonomous(goal: string): AsyncGenerator<AgentEvent> {
    const toolExecutor = async (tool: string, params: Record<string, unknown>): Promise<string> => {
      return executeTool(tool, params, { model: this.config.model }, this.config.max_tool_output);
    };

    const llmExecutor = async (prompt: string): Promise<string> => {
      const provider = getProvider(this.config.model);
      const pConfig = await buildProviderConfig(this.config.model, {
        maxTokens: this.config.max_tokens,
        thinking: this.config.thinking,
      });

      let text = "";
      const messages: Message[] = [{ role: 'user', content: prompt }];

      const stream = provider.stream(this.systemPrompt, messages, getToolSchemas(), pConfig);
      for await (const ev of stream) {
        if (ev.type === "text") {
          text += ev.text;
        }
      }

      return text;
    };

    const agentConfig: AutonomousAgentConfig = {
      config: { ...DEFAULT_AUTONOMOUS_CONFIG, ...this.runnerConfig.autonomousConfig },
      toolExecutor,
      llmExecutor,
    };

    const agent = new AutonomousAgent(agentConfig);

    const result = await agent.run(goal);
    
    // Stream the final result
    yield { type: "text", text: result.result };
    yield { type: "turn_done", input_tokens: result.tokensUsed, output_tokens: 0 };
    yield { type: "done" };
  }

  private checkPermission(tc: ToolCall): { permitted: boolean; description?: string } {
    const mode = this.config.permission_mode;
    if (mode === "accept-all") return { permitted: true };
    if (mode === "manual") return { permitted: false, description: `${tc.name}(${JSON.stringify(tc.input).slice(0, 80)})` };
    
    // auto mode
    const safeReads = [
      "Read", "Glob", "Grep", "WebFetch", "WebSearch", "CodebaseSearch", 
      "GetDiagnostics", "MemorySearch", "MemoryList", "TaskList", 
      "RegexExtract", "BrowserOpen", "BrowserClick", "CodebaseMap",
      "SymbolFind", "SymbolReferences", "TaskQuery", "TaskBucketList",
      "WebSearchMulti", "WebFetchClean", "WebFetchMarkdown",
      "BrowserSnapshot", "BrowserSessions", "DiagnosticsGet", "ProjectDetect"
    ];
    
    if (safeReads.includes(tc.name)) return { permitted: true };
    
    if (tc.name === "Bash") {
      const cmd = String(tc.input.command || "");
      if (isSafeBash(cmd)) return { permitted: true };
      return { permitted: false, description: `Run: ${cmd}` };
    }
    
    const writeTools = [
      "Write", "Edit", "MemorySave", "MemoryDelete", "RegexReplace",
      "StrReplace", "StrReplaceMulti", "TaskAdd", "TaskTransition",
      "BrowserClick", "BrowserNavigate", "FormatCode", "DiagnosticsFix"
    ];
    
    if (writeTools.includes(tc.name)) {
      return { permitted: false, description: `${tc.name}: ${JSON.stringify(tc.input).slice(0, 80)}` };
    }
    
    return { permitted: true };
  }

  // Session management
  async saveSession(name?: string): Promise<string> {
    return this.sessionManager.save(name);
  }

  async loadSession(id: string): Promise<boolean> {
    const session = await this.sessionManager.load(id);
    if (session) {
      this.session = session;
      // Restore messages to state
      this.state.messages = session.messages.map(m => ({
        role: m.role as "user" | "assistant" | "tool",
        content: m.content,
      }));
      return true;
    }
    return false;
  }

  // Hook management
  registerHook(event: HookEvent, handler: (data: HookEventData, ctx: any) => Promise<{ continue: boolean; modified?: unknown }>, priority = 0): string {
    return this.hookManager.register({
      name: `hook-${Date.now()}`,
      event,
      handler,
      priority,
    });
  }

  // State access
  getState(): AgentState {
    return this.state;
  }

  cancel(): void {
    this.state.cancelled = true;
  }
}

export default IntegratedAgentRunner;
