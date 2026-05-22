import type { 
  SubAgentContext, 
  SubAgentResult, 
  SubAgentRunnerState,
  SubAgentStatus,
  SubAgentEvent,
  SubAgentEventHandler,
  PermissionSet 
} from "./types.js";

type Message = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; name?: string };

export interface SubAgentRunnerConfig {
  id: string;
  context: SubAgentContext;
  toolExecutor: (tool: string, params: Record<string, unknown>) => Promise<string>;
  llmExecutor: (messages: Message[], tools: string[]) => AsyncIterable<{
    type: 'text' | 'tool_call' | 'done';
    content?: string;
    tool?: string;
    params?: Record<string, unknown>;
  }>;
  eventHandler?: SubAgentEventHandler;
  timeout?: number;
}

export class SubAgentRunner {
  private config: SubAgentRunnerConfig;
  private state: SubAgentRunnerState;
  private aborted = false;
  private timeoutId?: ReturnType<typeof setTimeout>;

  constructor(config: SubAgentRunnerConfig) {
    this.config = config;
    this.state = {
      status: 'pending',
      tokensUsed: { input: 0, output: 0 },
      toolCalls: [],
    };
  }

  async run(): Promise<SubAgentResult> {
    this.state.status = 'running';
    this.state.startedAt = new Date();
    
    this.emit({ type: 'started', agentId: this.config.id });

    // Set up timeout
    if (this.config.timeout) {
      this.timeoutId = setTimeout(() => {
        this.abort('Timeout exceeded');
      }, this.config.timeout);
    }

    const messages: Message[] = [
      { role: 'system', content: this.config.context.systemPrompt },
      ...this.config.context.messages,
    ];

    let finalResult = '';
    let iterationCount = 0;
    const maxIterations = 50; // Safety limit

    try {
      while (!this.aborted && iterationCount < maxIterations) {
        iterationCount++;

        // Get LLM response
        const response = await this.processLLMResponse(messages);
        
        if (this.aborted) break;

        if (response.type === 'text') {
          // Agent has finished with a text response
          finalResult = response.content || '';
          break;
        } else if (response.type === 'tool_call' && response.tool) {
          // Execute tool
          const toolResult = await this.executeTool(response.tool, response.params || {});
          
          // Add tool call and result to messages
          messages.push({ 
            role: 'assistant', 
            content: `Calling tool: ${response.tool}` 
          });
          messages.push({ 
            role: 'tool', 
            name: response.tool,
            content: toolResult 
          });

          // Update progress
          this.emit({
            type: 'progress',
            agentId: this.config.id,
            message: `Executed ${response.tool}`,
            progress: iterationCount / maxIterations,
          });
        } else if (response.type === 'done') {
          finalResult = response.content || messages[messages.length - 1]?.content || '';
          break;
        }
      }

      // Clear timeout
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }

      // Determine final status
      if (this.aborted) {
        if ((this.state.status as string) === 'timeout') {
          // Already set by abort
        } else {
          this.state.status = 'cancelled';
        }
      } else {
        this.state.status = 'completed';
      }

      this.state.completedAt = new Date();

      const result: SubAgentResult = {
        agentId: this.config.id,
        status: this.state.status,
        result: finalResult,
        tokensUsed: this.state.tokensUsed,
        toolsUsed: [...new Set(this.state.toolCalls.map(tc => tc.tool))],
        duration: this.state.completedAt.getTime() - (this.state.startedAt?.getTime() || 0),
      };

      this.emit({ type: 'completed', agentId: this.config.id, result });

      return result;
    } catch (error) {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }

      this.state.status = 'failed';
      this.state.completedAt = new Date();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.emit({ type: 'error', agentId: this.config.id, error: errorMessage });

      return {
        agentId: this.config.id,
        status: 'failed',
        result: '',
        tokensUsed: this.state.tokensUsed,
        toolsUsed: [...new Set(this.state.toolCalls.map(tc => tc.tool))],
        duration: this.state.completedAt.getTime() - (this.state.startedAt?.getTime() || 0),
        error: errorMessage,
      };
    }
  }

  private async processLLMResponse(messages: Message[]): Promise<{
    type: 'text' | 'tool_call' | 'done';
    content?: string;
    tool?: string;
    params?: Record<string, unknown>;
  }> {
    let lastResponse: {
      type: 'text' | 'tool_call' | 'done';
      content?: string;
      tool?: string;
      params?: Record<string, unknown>;
    } = { type: 'done' };

    let textBuffer = '';

    for await (const chunk of this.config.llmExecutor(messages, this.config.context.tools)) {
      if (this.aborted) break;

      if (chunk.type === 'text' && chunk.content) {
        textBuffer += chunk.content;
      } else if (chunk.type === 'tool_call') {
        lastResponse = chunk;
        break; // Stop on tool call
      } else if (chunk.type === 'done') {
        lastResponse = { type: 'text', content: textBuffer };
        break;
      }
    }

    // Estimate tokens (rough)
    this.state.tokensUsed.input += messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    this.state.tokensUsed.output += Math.ceil((textBuffer.length + (lastResponse.content?.length || 0)) / 4);

    return lastResponse;
  }

  private async executeTool(tool: string, params: Record<string, unknown>): Promise<string> {
    // Check permissions
    if (!this.hasToolPermission(tool)) {
      return `Error: Permission denied for tool ${tool}`;
    }

    // Check if tool is in allowed list
    if (this.config.context.tools.length > 0 && !this.config.context.tools.includes(tool)) {
      return `Error: Tool ${tool} not available to this agent`;
    }

    this.state.currentTool = tool;
    this.emit({ type: 'tool_call', agentId: this.config.id, tool, params });

    const startTime = Date.now();

    try {
      const result = await this.config.toolExecutor(tool, params);
      const duration = Date.now() - startTime;

      this.state.toolCalls.push({ tool, params, result, duration });
      this.emit({ type: 'tool_result', agentId: this.config.id, tool, result });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;
      
      this.state.toolCalls.push({ tool, params, result: `Error: ${errorMsg}`, duration });
      
      return `Error executing ${tool}: ${errorMsg}`;
    } finally {
      this.state.currentTool = undefined;
    }
  }

  private hasToolPermission(tool: string): boolean {
    const permissions = this.config.context.permissions;
    
    // Check tool categories
    const readTools = ['Read', 'Glob', 'Grep', 'CodebaseMap', 'SymbolFind', 'WebFetch'];
    const writeTools = ['Write', 'Edit', 'StrReplace'];
    const execTools = ['Bash', 'TestRun'];
    const networkTools = ['WebSearch', 'WebFetch', 'BrowserLaunch', 'BrowserNavigate'];

    if (readTools.includes(tool) && !permissions.read) return false;
    if (writeTools.includes(tool) && !permissions.write) return false;
    if (execTools.includes(tool) && !permissions.execute) return false;
    if (networkTools.includes(tool) && !permissions.network) return false;

    return true;
  }

  abort(reason?: string): void {
    this.aborted = true;
    if (reason === 'Timeout exceeded') {
      this.state.status = 'timeout';
    } else {
      this.state.status = 'cancelled';
    }
    this.emit({ type: 'cancelled', agentId: this.config.id });
  }

  getState(): SubAgentRunnerState {
    return { ...this.state };
  }

  private emit(event: SubAgentEvent): void {
    if (this.config.eventHandler) {
      this.config.eventHandler.onEvent(event);
    }
  }
}

export default SubAgentRunner;
