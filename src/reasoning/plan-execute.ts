import type { ActionPlan, PlanStep, ReasoningResult, ThinkingChunk } from "./types.js";
import { Reasoner } from "./reasoner.js";

// Plan-and-Execute pattern based on LangGraph's approach
// 1. Planner creates initial plan
// 2. Executor executes each step
// 3. Replanner adjusts plan based on results

export interface AgentState {
  goal: string;
  context: string;
  plan?: ActionPlan;
  currentStep: number;
  results: Map<string, StepResult>;
  errors: string[];
  tokensUsed: number;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  output: string;
  observations: string[];
  tokensUsed: number;
  duration: number;
}

export interface PlanExecuteConfig {
  maxIterations: number;
  maxReplanAttempts: number;
  stopOnError: boolean;
  parallel: boolean;
  onStepComplete?: (step: PlanStep, result: StepResult) => void;
  onReplan?: (reason: string, newPlan: ActionPlan) => void;
}

const DEFAULT_CONFIG: PlanExecuteConfig = {
  maxIterations: 50,
  maxReplanAttempts: 3,
  stopOnError: false,
  parallel: false,
};

export class Planner {
  private reasoner: Reasoner;

  constructor(reasoner?: Reasoner) {
    this.reasoner = reasoner || new Reasoner();
  }

  async createPlan(goal: string, context: string): Promise<ReasoningResult> {
    return this.reasoner.reason(goal, context);
  }

  async refinePlan(
    plan: ActionPlan, 
    stepResult: StepResult, 
    state: AgentState
  ): Promise<ActionPlan> {
    // Analyze the step result
    const reflection = await this.reasoner.reflect({
      success: stepResult.success,
      output: stepResult.output,
    });

    if (!reflection.shouldReplan) {
      return plan;
    }

    // Create refined plan based on observations
    const refinedPlan = { ...plan, updatedAt: new Date() };
    const failedStepIndex = refinedPlan.steps.findIndex(s => s.id === stepResult.stepId);
    
    if (failedStepIndex !== -1) {
      const failedStep = refinedPlan.steps[failedStepIndex];
      
      // If step has fallback, use it
      if (failedStep.fallback) {
        refinedPlan.steps[failedStepIndex] = failedStep.fallback;
        refinedPlan.steps[failedStepIndex].status = 'pending';
      } else {
        // Mark as failed and add retry step
        failedStep.status = 'failed';
        failedStep.error = stepResult.output;
        
        // Insert retry step with adjusted approach
        const retryStep: PlanStep = {
          id: `retry-${failedStep.id}`,
          description: `Retry: ${failedStep.description} (with adjustments: ${reflection.adjustments.join(', ')})`,
          tool: failedStep.tool,
          params: failedStep.params,
          expectedOutcome: failedStep.expectedOutcome,
          dependencies: failedStep.dependencies,
          riskLevel: 'medium',
          status: 'pending',
        };
        
        refinedPlan.steps.splice(failedStepIndex + 1, 0, retryStep);
      }
    }

    return refinedPlan;
  }
}

export class Executor {
  private toolExecutor: (tool: string, params: Record<string, unknown>) => Promise<string>;

  constructor(toolExecutor: (tool: string, params: Record<string, unknown>) => Promise<string>) {
    this.toolExecutor = toolExecutor;
  }

  async executeStep(step: PlanStep, state: AgentState): Promise<StepResult> {
    const startTime = Date.now();
    step.status = 'in_progress';

    try {
      let output: string;

      if (step.tool) {
        // Execute tool
        output = await this.toolExecutor(step.tool, step.params || {});
      } else {
        // No specific tool - this is a logical/planning step
        output = `Completed: ${step.description}`;
      }

      const duration = Date.now() - startTime;
      const tokensUsed = Math.ceil(output.length / 4); // Rough estimate

      // Analyze output for observations
      const observations = this.extractObservations(output);

      step.status = 'completed';
      step.result = output;

      return {
        stepId: step.id,
        success: true,
        output,
        observations,
        tokensUsed,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      step.status = 'failed';
      step.error = errorMessage;

      return {
        stepId: step.id,
        success: false,
        output: errorMessage,
        observations: ['Step execution failed'],
        tokensUsed: 0,
        duration,
      };
    }
  }

  private extractObservations(output: string): string[] {
    const observations: string[] = [];

    // Look for common patterns in output
    if (output.includes('error') || output.includes('Error')) {
      observations.push('Errors detected in output');
    }
    if (output.includes('warning') || output.includes('Warning')) {
      observations.push('Warnings present');
    }
    if (output.includes('success') || output.includes('Success') || output.includes('completed')) {
      observations.push('Operation completed successfully');
    }
    if (output.includes('not found') || output.includes('missing')) {
      observations.push('Resource not found');
    }
    if (output.length > 10000) {
      observations.push('Large output generated');
    }
    if (output.length < 10) {
      observations.push('Minimal output');
    }

    return observations;
  }

  async executeParallel(steps: PlanStep[], state: AgentState): Promise<StepResult[]> {
    // Execute independent steps in parallel
    const promises = steps.map(step => this.executeStep(step, state));
    return Promise.all(promises);
  }
}

export class Replanner {
  private planner: Planner;
  private replanCount = 0;
  private maxReplans: number;

  constructor(planner: Planner, maxReplans = 3) {
    this.planner = planner;
    this.maxReplans = maxReplans;
  }

  async shouldReplan(result: StepResult, plan: ActionPlan, state: AgentState): Promise<boolean> {
    // Don't replan if we've hit the limit
    if (this.replanCount >= this.maxReplans) {
      return false;
    }

    // Replan on failure
    if (!result.success) {
      return true;
    }

    // Replan if observations suggest issues
    if (result.observations.includes('Errors detected in output')) {
      return true;
    }

    // Check if remaining steps are still valid
    const remainingSteps = plan.steps.filter(s => s.status === 'pending');
    if (remainingSteps.length === 0) {
      return false;
    }

    return false;
  }

  async replan(
    result: StepResult, 
    plan: ActionPlan, 
    state: AgentState
  ): Promise<ActionPlan> {
    this.replanCount++;
    return this.planner.refinePlan(plan, result, state);
  }

  resetReplanCount(): void {
    this.replanCount = 0;
  }
}

// Main Plan-and-Execute loop
export class PlanExecuteLoop {
  private planner: Planner;
  private executor: Executor;
  private replanner: Replanner;
  private config: PlanExecuteConfig;

  constructor(
    toolExecutor: (tool: string, params: Record<string, unknown>) => Promise<string>,
    config?: Partial<PlanExecuteConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.planner = new Planner();
    this.executor = new Executor(toolExecutor);
    this.replanner = new Replanner(this.planner, this.config.maxReplanAttempts);
  }

  async run(goal: string, context: string): Promise<{
    success: boolean;
    results: Map<string, StepResult>;
    plan: ActionPlan | undefined;
    reasoning: ReasoningResult;
    totalTokens: number;
    totalDuration: number;
  }> {
    const startTime = Date.now();
    
    // Initialize state
    const state: AgentState = {
      goal,
      context,
      currentStep: 0,
      results: new Map(),
      errors: [],
      tokensUsed: 0,
    };

    // Create initial plan
    const reasoning = await this.planner.createPlan(goal, context);
    
    if (!reasoning.success || !reasoning.plan) {
      return {
        success: false,
        results: state.results,
        plan: undefined,
        reasoning,
        totalTokens: reasoning.tokensUsed,
        totalDuration: Date.now() - startTime,
      };
    }

    state.plan = reasoning.plan;
    let iterations = 0;

    // Execute plan
    while (iterations < this.config.maxIterations) {
      iterations++;

      // Find next step to execute
      const pendingSteps = state.plan.steps.filter(s => s.status === 'pending');
      
      if (pendingSteps.length === 0) {
        // All steps completed
        break;
      }

      // Check dependencies and find executable steps
      const executableSteps = pendingSteps.filter(step => {
        const deps = state.plan!.dependencies.get(step.id) || [];
        return deps.every(depId => {
          const depStep = state.plan!.steps.find(s => s.id === depId);
          return depStep?.status === 'completed';
        });
      });

      if (executableSteps.length === 0) {
        // Deadlock - no steps can be executed
        state.errors.push('Deadlock: No steps can be executed due to dependency cycle');
        break;
      }

      // Execute steps
      let results: StepResult[];
      
      if (this.config.parallel && executableSteps.length > 1) {
        results = await this.executor.executeParallel(executableSteps, state);
      } else {
        const step = executableSteps[0];
        const result = await this.executor.executeStep(step, state);
        results = [result];
      }

      // Process results
      for (const result of results) {
        state.results.set(result.stepId, result);
        state.tokensUsed += result.tokensUsed;

        // Notify callback
        if (this.config.onStepComplete) {
          const step = state.plan.steps.find(s => s.id === result.stepId)!;
          this.config.onStepComplete(step, result);
        }

        // Check if replanning is needed
        if (await this.replanner.shouldReplan(result, state.plan, state)) {
          const newPlan = await this.replanner.replan(result, state.plan, state);
          
          if (this.config.onReplan) {
            this.config.onReplan(`Step ${result.stepId} failed`, newPlan);
          }
          
          state.plan = newPlan;
        }

        // Stop on error if configured
        if (!result.success && this.config.stopOnError) {
          state.errors.push(`Stopped due to error in step ${result.stepId}: ${result.output}`);
          break;
        }
      }

      // Check for errors that should stop execution
      if (state.errors.length > 0 && this.config.stopOnError) {
        break;
      }
    }

    // Determine overall success
    const completedSteps = state.plan.steps.filter(s => s.status === 'completed');
    const failedSteps = state.plan.steps.filter(s => s.status === 'failed');
    const success = failedSteps.length === 0 && completedSteps.length === state.plan.steps.length;

    return {
      success,
      results: state.results,
      plan: state.plan,
      reasoning,
      totalTokens: state.tokensUsed + reasoning.tokensUsed,
      totalDuration: Date.now() - startTime,
    };
  }

  // Convenience method to get execution summary
  formatExecutionSummary(
    result: Awaited<ReturnType<PlanExecuteLoop['run']>>
  ): string {
    const lines: string[] = [
      '=== Plan Execution Summary ===\n',
      `Status: ${result.success ? '✓ Success' : '✗ Failed'}`,
      `Total Duration: ${result.totalDuration}ms`,
      `Total Tokens: ${result.totalTokens}`,
    ];

    if (result.plan) {
      lines.push(`\nPlan: ${result.plan.goal}`);
      lines.push(`Steps: ${result.plan.steps.length}`);
      
      const completed = result.plan.steps.filter(s => s.status === 'completed').length;
      const failed = result.plan.steps.filter(s => s.status === 'failed').length;
      const pending = result.plan.steps.filter(s => s.status === 'pending').length;
      
      lines.push(`  Completed: ${completed}`);
      lines.push(`  Failed: ${failed}`);
      lines.push(`  Pending: ${pending}`);

      lines.push('\nStep Details:');
      for (const step of result.plan.steps) {
        const icon = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : '○';
        lines.push(`  ${icon} ${step.description}`);
        
        const stepResult = result.results.get(step.id);
        if (stepResult) {
          lines.push(`      Duration: ${stepResult.duration}ms`);
          if (stepResult.observations.length > 0) {
            lines.push(`      Observations: ${stepResult.observations.join(', ')}`);
          }
          if (!stepResult.success) {
            lines.push(`      Error: ${stepResult.output.slice(0, 200)}`);
          }
        }
      }
    }

    return lines.join('\n');
  }
}

export default PlanExecuteLoop;
