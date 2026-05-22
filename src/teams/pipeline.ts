// Pipeline Pattern - Linear sequential execution
// Each agent passes its output to the next

import type {
  TeamDefinition,
  TeamState,
  TeamExecutionResult,
  TeamCoordinator,
  TeamEventHandler,
  AgentRole,
} from "./types.js";
import type { SubAgentSpawnParams, SubAgentResult, SubAgentType } from "../subagents/types.js";
import { SubAgentSpawner } from "../subagents/spawner.js";

function generateId(): string {
  return `pipeline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface PipelineStage {
  id: string;
  role: AgentRole;
  transform?: (input: string, stageResult: string) => string;  // Optional transformation between stages
}

export interface PipelineConfig {
  id: string;
  name: string;
  stages: PipelineStage[];
  spawner: SubAgentSpawner;
  eventHandler?: TeamEventHandler;
  stopOnError?: boolean;
  defaultTimeout?: number;
}

export class PipelineTeam implements TeamCoordinator {
  private config: PipelineConfig;
  private state: TeamState;
  private cancelled = false;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.state = {
      teamId: config.id,
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

    this.emit({ type: 'team_started', teamId: this.config.id, task });

    const results: SubAgentResult[] = [];
    let currentInput = context ? `${task}\n\nContext: ${context}` : task;
    let success = true;

    try {
      for (let i = 0; i < this.config.stages.length; i++) {
        if (this.cancelled) {
          break;
        }

        const stage = this.config.stages[i];
        
        // Emit delegation event
        this.emit({
          type: 'task_delegated',
          teamId: this.config.id,
          agentId: stage.id,
          task: `Stage ${i + 1}: ${stage.role.name}`,
        });

        // Spawn agent for this stage
        const spawnParams: SubAgentSpawnParams = {
          type: this.getAgentType(stage.role),
          prompt: this.buildStagePrompt(stage, currentInput, i, this.config.stages.length),
          description: `Pipeline Stage ${i + 1}: ${stage.role.name}`,
          tools: stage.role.tools,
          timeout: this.config.defaultTimeout,
        };

        const result = await this.config.spawner.spawn(spawnParams) as SubAgentResult;
        results.push(result);

        this.emit({
          type: 'agent_completed',
          teamId: this.config.id,
          agentId: stage.id,
          result,
        });

        if (result.status !== 'completed') {
          success = false;
          this.state.failedTasks++;

          if (this.config.stopOnError) {
            break;
          }
          // Continue with error message as input
          currentInput = `Previous stage (${stage.role.name}) failed: ${result.error}\n\nOriginal input: ${currentInput}`;
        } else {
          // Transform output for next stage
          if (stage.transform) {
            currentInput = stage.transform(currentInput, result.result);
          } else {
            currentInput = result.result;
          }
          this.state.completedTasks++;
        }

        // Update working memory
        this.state.memory.workingMemory.set(`stage_${i}`, result.result);
      }

      this.state.currentTask = undefined;

      const finalResult: TeamExecutionResult = {
        success: success && !this.cancelled,
        result: currentInput,  // Final output from pipeline
        agentResults: results,
        tokensUsed: this.aggregateTokens(results),
        duration: Date.now() - startTime,
        tasksCompleted: this.state.completedTasks,
        tasksFailed: this.state.failedTasks,
      };

      this.emit({ type: 'team_completed', teamId: this.config.id, result: finalResult });

      return finalResult;
    } catch (error) {
      this.state.failedTasks++;
      this.state.currentTask = undefined;

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit({ type: 'team_error', teamId: this.config.id, error: errorMsg });

      return {
        success: false,
        result: `Pipeline error: ${errorMsg}`,
        agentResults: results,
        tokensUsed: this.aggregateTokens(results),
        duration: Date.now() - startTime,
        tasksCompleted: this.state.completedTasks,
        tasksFailed: this.state.failedTasks,
      };
    }
  }

  private getAgentType(role: AgentRole): SubAgentType {
    const nameLower = role.name.toLowerCase();
    if (nameLower.includes('explorer') || nameLower.includes('finder')) return 'explore';
    if (nameLower.includes('planner')) return 'plan';
    if (nameLower.includes('coder') || nameLower.includes('developer')) return 'code';
    if (nameLower.includes('reviewer')) return 'review';
    if (nameLower.includes('tester')) return 'test';
    if (nameLower.includes('researcher')) return 'research';
    if (nameLower.includes('shell') || nameLower.includes('deployer')) return 'shell';
    return 'general';
  }

  private buildStagePrompt(stage: PipelineStage, input: string, stageIndex: number, totalStages: number): string {
    let prompt = `You are stage ${stageIndex + 1} of ${totalStages} in a processing pipeline.

Your role: ${stage.role.name}
${stage.role.description}

Capabilities: ${stage.role.capabilities.join(', ')}

Input from previous stage:
---
${input}
---

Complete your part of the task and provide output for the next stage.`;

    if (stage.role.systemPrompt) {
      prompt = `${stage.role.systemPrompt}\n\n${prompt}`;
    }

    return prompt;
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

// Factory function to create common pipelines
export function createCICDPipeline(spawner: SubAgentSpawner, eventHandler?: TeamEventHandler): PipelineTeam {
  return new PipelineTeam({
    id: 'cicd-pipeline',
    name: 'CI/CD Pipeline',
    spawner,
    eventHandler,
    stopOnError: true,
    stages: [
      {
        id: 'build',
        role: {
          id: 'builder',
          name: 'Builder',
          description: 'Build the project',
          capabilities: ['build', 'compile'],
          tools: ['Bash', 'Read'],
        },
      },
      {
        id: 'test',
        role: {
          id: 'tester',
          name: 'Tester',
          description: 'Run tests',
          capabilities: ['testing'],
          tools: ['Bash', 'TestRun'],
        },
      },
      {
        id: 'lint',
        role: {
          id: 'linter',
          name: 'Linter',
          description: 'Check code quality',
          capabilities: ['linting', 'code quality'],
          tools: ['DiagnosticsGet', 'TypeCheck'],
        },
      },
      {
        id: 'deploy',
        role: {
          id: 'deployer',
          name: 'Deployer',
          description: 'Deploy the application',
          capabilities: ['deployment'],
          tools: ['Bash'],
        },
      },
    ],
  });
}

export function createCodeReviewPipeline(spawner: SubAgentSpawner, eventHandler?: TeamEventHandler): PipelineTeam {
  return new PipelineTeam({
    id: 'code-review-pipeline',
    name: 'Code Review Pipeline',
    spawner,
    eventHandler,
    stopOnError: false,
    stages: [
      {
        id: 'analyze',
        role: {
          id: 'analyzer',
          name: 'Code Analyzer',
          description: 'Analyze code structure and patterns',
          capabilities: ['static analysis'],
          tools: ['Read', 'CodebaseMap', 'SymbolFind'],
        },
      },
      {
        id: 'security',
        role: {
          id: 'security-reviewer',
          name: 'Security Reviewer',
          description: 'Check for security issues',
          capabilities: ['security review'],
          tools: ['Read', 'Grep'],
        },
      },
      {
        id: 'quality',
        role: {
          id: 'quality-checker',
          name: 'Quality Checker',
          description: 'Check code quality and best practices',
          capabilities: ['quality review'],
          tools: ['DiagnosticsGet', 'TypeCheck'],
        },
      },
      {
        id: 'summarize',
        role: {
          id: 'summarizer',
          name: 'Review Summarizer',
          description: 'Summarize all review findings',
          capabilities: ['summarization'],
          tools: ['Read'],
        },
      },
    ],
  });
}

export default PipelineTeam;
