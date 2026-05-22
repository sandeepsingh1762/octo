// Supervisor Pattern - Most common for production
// Central coordinator that delegates to specialized workers

import type {
  TeamDefinition,
  TeamState,
  TeamExecutionResult,
  TeamMemory,
  TaskQueueItem,
  TeamCoordinator,
  TeamEventHandler,
  AgentRole,
} from "./types.js";
import type { SubAgentSpawnParams, SubAgentResult, SubAgentType } from "../subagents/types.js";
import { SubAgentSpawner, spawnParallel } from "../subagents/spawner.js";
import { ResultAggregator } from "../subagents/communication.js";

function generateId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface SupervisorConfig {
  definition: TeamDefinition;
  spawner: SubAgentSpawner;
  eventHandler?: TeamEventHandler;
  maxParallelWorkers?: number;
  maxRetries?: number;
}

export class SupervisorTeam implements TeamCoordinator {
  private config: SupervisorConfig;
  private state: TeamState;
  private resultAggregator: ResultAggregator;
  private cancelled = false;

  constructor(config: SupervisorConfig) {
    this.config = config;
    this.resultAggregator = new ResultAggregator();
    this.state = {
      teamId: config.definition.id,
      activeAgents: [],
      completedTasks: 0,
      failedTasks: 0,
      memory: {
        shortTerm: new Map(),
        workingMemory: new Map(),
        sharedContext: [],
      },
      taskQueue: [],
    };
  }

  async executeTask(task: string, context?: string): Promise<TeamExecutionResult> {
    const startTime = Date.now();
    this.cancelled = false;
    this.state.currentTask = task;

    this.emit({ type: 'team_started', teamId: this.config.definition.id, task });

    try {
      // 1. Supervisor analyzes task
      const analysis = await this.analyzeTask(task, context);
      
      if (this.cancelled) return this.createCancelledResult(startTime);

      // 2. Supervisor creates subtasks
      const subtasks = await this.decomposeTask(analysis, task);
      
      if (this.cancelled) return this.createCancelledResult(startTime);

      // 3. Delegate to workers
      const workerResults = await this.delegateToWorkers(subtasks);
      
      if (this.cancelled) return this.createCancelledResult(startTime);

      // 4. Supervisor synthesizes results
      const finalResult = await this.synthesizeResults(task, workerResults);

      this.state.completedTasks++;
      this.state.currentTask = undefined;

      const result: TeamExecutionResult = {
        success: true,
        result: finalResult,
        agentResults: workerResults,
        tokensUsed: this.aggregateTokens(workerResults),
        duration: Date.now() - startTime,
        tasksCompleted: this.state.completedTasks,
        tasksFailed: this.state.failedTasks,
      };

      this.emit({ type: 'team_completed', teamId: this.config.definition.id, result });

      return result;
    } catch (error) {
      this.state.failedTasks++;
      this.state.currentTask = undefined;

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit({ type: 'team_error', teamId: this.config.definition.id, error: errorMsg });

      return {
        success: false,
        result: `Error: ${errorMsg}`,
        agentResults: this.resultAggregator.getAll(),
        tokensUsed: this.aggregateTokens(this.resultAggregator.getAll()),
        duration: Date.now() - startTime,
        tasksCompleted: this.state.completedTasks,
        tasksFailed: this.state.failedTasks,
      };
    }
  }

  private async analyzeTask(task: string, context?: string): Promise<{
    complexity: 'simple' | 'moderate' | 'complex';
    requiredSpecialists: string[];
    parallelizable: boolean;
    estimatedSteps: number;
  }> {
    // Use supervisor to analyze the task
    const analysisPrompt = `
Analyze this task and determine how to best accomplish it:

Task: ${task}
${context ? `Context: ${context}` : ''}

Available specialists:
${Array.from(this.config.definition.specialists.entries())
  .map(([id, role]) => `- ${role.name}: ${role.description}`)
  .join('\n')}

Provide your analysis:
1. Complexity: simple/moderate/complex
2. Which specialists are needed (by name)
3. Can subtasks run in parallel? yes/no
4. Estimated number of steps
`;

    // For now, do a heuristic analysis (can be enhanced with LLM call)
    const specialists = this.selectSpecialists(task);
    const complexity = this.assessComplexity(task);

    return {
      complexity,
      requiredSpecialists: specialists,
      parallelizable: specialists.length > 1 && complexity !== 'complex',
      estimatedSteps: Math.max(specialists.length, 2),
    };
  }

  private selectSpecialists(task: string): string[] {
    const taskLower = task.toLowerCase();
    const specialists: string[] = [];

    const specialistMap = this.config.definition.specialists;

    // Match based on keywords
    if (taskLower.includes('read') || taskLower.includes('find') || taskLower.includes('search') || taskLower.includes('explore')) {
      const explorer = Array.from(specialistMap.entries()).find(([_, r]) => 
        r.name.toLowerCase().includes('explorer') || r.name.toLowerCase().includes('finder') || r.capabilities.includes('search'));
      if (explorer) specialists.push(explorer[0]);
    }

    if (taskLower.includes('plan') || taskLower.includes('design') || taskLower.includes('architect')) {
      const planner = Array.from(specialistMap.entries()).find(([_, r]) => 
        r.name.toLowerCase().includes('planner') || r.capabilities.includes('planning'));
      if (planner) specialists.push(planner[0]);
    }

    if (taskLower.includes('write') || taskLower.includes('implement') || taskLower.includes('create') || taskLower.includes('code')) {
      const coder = Array.from(specialistMap.entries()).find(([_, r]) => 
        r.name.toLowerCase().includes('coder') || r.capabilities.includes('coding'));
      if (coder) specialists.push(coder[0]);
    }

    if (taskLower.includes('review') || taskLower.includes('check') || taskLower.includes('audit')) {
      const reviewer = Array.from(specialistMap.entries()).find(([_, r]) => 
        r.name.toLowerCase().includes('reviewer') || r.capabilities.includes('review'));
      if (reviewer) specialists.push(reviewer[0]);
    }

    if (taskLower.includes('test') || taskLower.includes('verify')) {
      const tester = Array.from(specialistMap.entries()).find(([_, r]) => 
        r.name.toLowerCase().includes('tester') || r.capabilities.includes('testing'));
      if (tester) specialists.push(tester[0]);
    }

    // If no match, use the first available specialist
    if (specialists.length === 0 && specialistMap.size > 0) {
      specialists.push(Array.from(specialistMap.keys())[0]);
    }

    return specialists;
  }

  private assessComplexity(task: string): 'simple' | 'moderate' | 'complex' {
    const words = task.split(/\s+/).length;
    const hasMultipleActions = (task.match(/\b(and|then|also|after)\b/gi) || []).length > 1;
    
    if (words < 10 && !hasMultipleActions) return 'simple';
    if (words < 30 && !hasMultipleActions) return 'moderate';
    return 'complex';
  }

  private async decomposeTask(
    analysis: { complexity: string; requiredSpecialists: string[]; parallelizable: boolean; estimatedSteps: number },
    task: string
  ): Promise<Array<{ specialist: string; subtask: string; dependencies: string[] }>> {
    const subtasks: Array<{ specialist: string; subtask: string; dependencies: string[] }> = [];
    
    if (analysis.complexity === 'simple') {
      // Single task to single specialist
      const specialist = analysis.requiredSpecialists[0] || Array.from(this.config.definition.specialists.keys())[0];
      subtasks.push({
        specialist,
        subtask: task,
        dependencies: [],
      });
    } else {
      // Multiple subtasks
      const specialists = analysis.requiredSpecialists;
      
      // Create sequential subtasks with dependencies
      let prevTaskId: string | undefined;
      for (let i = 0; i < specialists.length; i++) {
        const specialist = specialists[i];
        const role = this.config.definition.specialists.get(specialist);
        
        let subtaskDesc: string;
        if (role?.name.toLowerCase().includes('explorer') || role?.name.toLowerCase().includes('finder')) {
          subtaskDesc = `Explore and gather context for: ${task}`;
        } else if (role?.name.toLowerCase().includes('planner')) {
          subtaskDesc = `Create a plan for: ${task}`;
        } else if (role?.name.toLowerCase().includes('coder')) {
          subtaskDesc = `Implement: ${task}`;
        } else if (role?.name.toLowerCase().includes('reviewer')) {
          subtaskDesc = `Review the work done for: ${task}`;
        } else if (role?.name.toLowerCase().includes('tester')) {
          subtaskDesc = `Test the implementation of: ${task}`;
        } else {
          subtaskDesc = `${role?.description || 'Complete'}: ${task}`;
        }

        const taskId = generateId();
        subtasks.push({
          specialist,
          subtask: subtaskDesc,
          dependencies: analysis.parallelizable ? [] : (prevTaskId ? [prevTaskId] : []),
        });
        
        if (!analysis.parallelizable) {
          prevTaskId = taskId;
        }
      }
    }

    // Add to task queue
    for (const subtask of subtasks) {
      this.state.taskQueue.push({
        id: generateId(),
        task: subtask.subtask,
        priority: 1,
        assignedTo: subtask.specialist,
        status: 'pending',
        createdAt: new Date(),
      });
    }

    return subtasks;
  }

  private async delegateToWorkers(
    subtasks: Array<{ specialist: string; subtask: string; dependencies: string[] }>
  ): Promise<SubAgentResult[]> {
    const results: SubAgentResult[] = [];
    
    // Separate parallel and sequential tasks
    const parallelTasks = subtasks.filter(t => t.dependencies.length === 0);
    const sequentialTasks = subtasks.filter(t => t.dependencies.length > 0);

    // Execute parallel tasks
    if (parallelTasks.length > 0 && !this.cancelled) {
      const maxParallel = this.config.maxParallelWorkers || 3;
      
      for (let i = 0; i < parallelTasks.length; i += maxParallel) {
        if (this.cancelled) break;
        
        const batch = parallelTasks.slice(i, i + maxParallel);
        const spawnParams: SubAgentSpawnParams[] = batch.map(t => ({
          type: this.getAgentType(t.specialist),
          prompt: this.buildWorkerPrompt(t.specialist, t.subtask),
          description: `${t.specialist}: ${t.subtask.slice(0, 50)}`,
          tools: this.config.definition.specialists.get(t.specialist)?.tools,
          timeout: this.config.definition.defaultTimeout,
        }));

        // Emit delegation events
        for (const param of spawnParams) {
          this.emit({
            type: 'task_delegated',
            teamId: this.config.definition.id,
            agentId: param.description,
            task: param.prompt.slice(0, 100),
          });
        }

        const batchResults = await spawnParallel(this.config.spawner, spawnParams);
        
        for (const result of batchResults) {
          this.resultAggregator.add(result);
          results.push(result);
          this.emit({
            type: 'agent_completed',
            teamId: this.config.definition.id,
            agentId: result.agentId,
            result,
          });
        }
      }
    }

    // Execute sequential tasks
    for (const task of sequentialTasks) {
      if (this.cancelled) break;

      const spawnParams: SubAgentSpawnParams = {
        type: this.getAgentType(task.specialist),
        prompt: this.buildWorkerPrompt(task.specialist, task.subtask, results),
        description: `${task.specialist}: ${task.subtask.slice(0, 50)}`,
        tools: this.config.definition.specialists.get(task.specialist)?.tools,
        timeout: this.config.definition.defaultTimeout,
      };

      this.emit({
        type: 'task_delegated',
        teamId: this.config.definition.id,
        agentId: spawnParams.description,
        task: spawnParams.prompt.slice(0, 100),
      });

      const result = await this.config.spawner.spawn(spawnParams) as SubAgentResult;
      this.resultAggregator.add(result);
      results.push(result);

      this.emit({
        type: 'agent_completed',
        teamId: this.config.definition.id,
        agentId: result.agentId,
        result,
      });

      // Update shared context with result
      this.state.memory.sharedContext.push(result.result);
    }

    return results;
  }

  private getAgentType(specialist: string): SubAgentType {
    const role = this.config.definition.specialists.get(specialist);
    if (!role) return 'general';

    const nameLower = role.name.toLowerCase();
    if (nameLower.includes('explorer') || nameLower.includes('finder')) return 'explore';
    if (nameLower.includes('planner')) return 'plan';
    if (nameLower.includes('coder') || nameLower.includes('developer')) return 'code';
    if (nameLower.includes('reviewer')) return 'review';
    if (nameLower.includes('tester')) return 'test';
    if (nameLower.includes('researcher')) return 'research';
    return 'general';
  }

  private buildWorkerPrompt(specialist: string, subtask: string, previousResults?: SubAgentResult[]): string {
    const role = this.config.definition.specialists.get(specialist);
    let prompt = subtask;

    if (role?.systemPrompt) {
      prompt = `${role.systemPrompt}\n\nTask: ${subtask}`;
    }

    // Include context from previous results
    if (previousResults && previousResults.length > 0) {
      const context = previousResults
        .filter(r => r.status === 'completed')
        .map(r => r.result)
        .join('\n\n');
      
      if (context) {
        prompt += `\n\nContext from previous work:\n${context.slice(0, 5000)}`;
      }
    }

    // Include shared context
    if (this.state.memory.sharedContext.length > 0) {
      const shared = this.state.memory.sharedContext.slice(-3).join('\n');
      prompt += `\n\nShared context:\n${shared.slice(0, 2000)}`;
    }

    return prompt;
  }

  private async synthesizeResults(task: string, results: SubAgentResult[]): Promise<string> {
    const successful = results.filter(r => r.status === 'completed');
    const failed = results.filter(r => r.status !== 'completed');

    if (successful.length === 0) {
      return `Task failed. All workers encountered errors:\n${failed.map(f => f.error).join('\n')}`;
    }

    if (successful.length === 1) {
      return successful[0].result;
    }

    // Combine multiple results
    const combined = successful.map(r => r.result).join('\n\n---\n\n');
    
    // Create summary
    const summary = [
      `Task: ${task}`,
      ``,
      `Results from ${successful.length} workers:`,
      combined,
    ];

    if (failed.length > 0) {
      summary.push(``, `Note: ${failed.length} worker(s) failed.`);
    }

    return summary.join('\n');
  }

  private aggregateTokens(results: SubAgentResult[]): { input: number; output: number } {
    return results.reduce(
      (acc, r) => ({
        input: acc.input + r.tokensUsed.input,
        output: acc.output + r.tokensUsed.output,
      }),
      { input: 0, output: 0 }
    );
  }

  private createCancelledResult(startTime: number): TeamExecutionResult {
    return {
      success: false,
      result: 'Team execution cancelled',
      agentResults: this.resultAggregator.getAll(),
      tokensUsed: this.aggregateTokens(this.resultAggregator.getAll()),
      duration: Date.now() - startTime,
      tasksCompleted: this.state.completedTasks,
      tasksFailed: this.state.failedTasks,
    };
  }

  private emit(event: Parameters<TeamEventHandler['onEvent']>[0]): void {
    if (this.config.eventHandler) {
      this.config.eventHandler.onEvent(event);
    }
  }

  getState(): TeamState {
    return { ...this.state };
  }

  cancel(): void {
    this.cancelled = true;
    this.config.spawner.cancelAll();
  }
}

export default SupervisorTeam;
