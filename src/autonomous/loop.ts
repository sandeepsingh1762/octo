// Autonomous Execution Loop
// Continuously works toward a goal without human interaction

import type {
  AutonomousConfig,
  AutonomousState,
  AutonomousResult,
  Action,
  ActionResult,
  Checkpoint,
  EscalationRequest,
  EscalationReason,
  AutonomousEventHandler,
  DEFAULT_AUTONOMOUS_CONFIG,
} from "./types.js";
import { RecoveryManager } from "./recovery.js";
import type { ActionPlan, PlanStep } from "../reasoning/types.js";
import { Reasoner } from "../reasoning/reasoner.js";

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AutonomousAgentConfig {
  config: AutonomousConfig;
  toolExecutor: (tool: string, params: Record<string, unknown>) => Promise<string>;
  llmExecutor: (prompt: string) => Promise<string>;
  eventHandler?: AutonomousEventHandler;
  escalationHandler?: (request: EscalationRequest) => Promise<string>;
}

export class AutonomousAgent {
  private agentConfig: AutonomousAgentConfig;
  private state: AutonomousState;
  private recovery: RecoveryManager;
  private reasoner: Reasoner;
  private paused = false;
  private aborted = false;

  constructor(config: AutonomousAgentConfig) {
    this.agentConfig = config;
    this.recovery = new RecoveryManager(config.config.recoveryPolicy);
    this.reasoner = new Reasoner();
    this.state = this.createInitialState('');
  }

  private createInitialState(goal: string): AutonomousState {
    return {
      goal,
      context: '',
      status: 'running',
      iteration: 0,
      tokensUsed: 0,
      startTime: new Date(),
      history: [],
      errors: [],
      checkpoints: [],
    };
  }

  async run(goal: string, context?: string): Promise<AutonomousResult> {
    this.state = this.createInitialState(goal);
    this.state.context = context || '';
    this.paused = false;
    this.aborted = false;

    this.emit({ type: 'started', goal });

    const config = this.agentConfig.config;
    const escalations: EscalationRequest[] = [];

    try {
      // Create initial plan
      const planResult = await this.reasoner.reason(goal, context || '');
      if (!planResult.success || !planResult.plan) {
        return this.createFailedResult('Failed to create initial plan');
      }

      this.state.currentPlan = planResult.plan.steps.map(s => s.description);

      // Main execution loop
      while (!this.shouldStop()) {
        this.state.iteration++;

        // Check limits
        const limitCheck = this.checkLimits();
        if (limitCheck) {
          const escalation = await this.escalate(limitCheck);
          escalations.push(escalation);
          if (escalation.defaultOption === 'abort') {
            this.state.status = 'escalated';
            break;
          }
        }

        // Wait if paused
        while (this.paused && !this.aborted) {
          await this.sleep(100);
        }

        if (this.aborted) break;

        // Get next action
        const action = await this.getNextAction();
        if (!action) {
          // No more actions - verify goal achieved
          const verified = await this.verifyGoalAchieved();
          if (verified) {
            this.state.status = 'completed';
            break;
          } else {
            // Replan
            const replanResult = await this.replan();
            if (!replanResult) {
              this.state.status = 'failed';
              break;
            }
            continue;
          }
        }

        this.emit({ type: 'iteration', iteration: this.state.iteration, action });

        // Check if action needs approval
        if (this.needsApproval(action)) {
          const escalation = await this.escalate({
            reason: this.getEscalationReason(action),
            action,
            message: `Action requires approval: ${action.description}`,
            options: ['approve', 'skip', 'abort'],
            defaultOption: 'approve',
          });
          escalations.push(escalation);
          
          if (escalation.defaultOption === 'skip') continue;
          if (escalation.defaultOption === 'abort') {
            this.state.status = 'escalated';
            break;
          }
        }

        // Execute action
        const result = await this.executeAction(action);
        this.state.history.push({ action, result });
        this.state.tokensUsed += result.tokensUsed;

        this.emit({ type: 'action_completed', action, result });

        // Handle failure
        if (!result.success) {
          this.state.errors.push(result.error || 'Unknown error');
          
          // Check consecutive errors
          const recentErrors = this.state.history
            .slice(-config.escalationPolicy.maxConsecutiveErrors)
            .filter(h => !h.result.success);
          
          if (recentErrors.length >= config.escalationPolicy.maxConsecutiveErrors) {
            const escalation = await this.escalate({
              reason: 'max_errors',
              message: `${recentErrors.length} consecutive errors`,
              options: ['continue', 'replan', 'abort'],
              defaultOption: 'replan',
            });
            escalations.push(escalation);

            if (escalation.defaultOption === 'replan') {
              await this.replan();
            } else if (escalation.defaultOption === 'abort') {
              this.state.status = 'failed';
              break;
            }
          }
        }

        // Checkpoint
        if (this.state.iteration % config.checkpointInterval === 0) {
          await this.createCheckpoint();
        }
      }

      return this.createResult(escalations);
    } catch (error) {
      this.state.status = 'failed';
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.state.errors.push(errorMsg);
      this.emit({ type: 'error', error: errorMsg });
      return this.createFailedResult(errorMsg, escalations);
    }
  }

  private shouldStop(): boolean {
    return (
      this.aborted ||
      this.state.status === 'completed' ||
      this.state.status === 'failed' ||
      this.state.status === 'escalated'
    );
  }

  private checkLimits(): EscalationRequest | null {
    const config = this.agentConfig.config;

    if (this.state.iteration >= config.maxIterations) {
      return {
        reason: 'budget_exceeded',
        message: `Maximum iterations (${config.maxIterations}) reached`,
        options: ['continue', 'abort'],
        defaultOption: 'abort',
      };
    }

    if (this.state.tokensUsed >= config.maxTokenBudget) {
      return {
        reason: 'budget_exceeded',
        message: `Token budget (${config.maxTokenBudget}) exceeded`,
        options: ['continue', 'abort'],
        defaultOption: 'abort',
      };
    }

    const elapsedMinutes = (Date.now() - this.state.startTime.getTime()) / 60000;
    if (elapsedMinutes >= config.maxTimeMinutes) {
      return {
        reason: 'time_exceeded',
        message: `Time limit (${config.maxTimeMinutes} minutes) exceeded`,
        options: ['continue', 'abort'],
        defaultOption: 'abort',
      };
    }

    return null;
  }

  private async getNextAction(): Promise<Action | null> {
    // Find next incomplete step in plan
    if (!this.state.currentPlan || this.state.currentPlan.length === 0) {
      return null;
    }

    const completedSteps = this.state.history
      .filter(h => h.result.success)
      .map(h => h.action.description);

    for (const step of this.state.currentPlan) {
      if (!completedSteps.some(c => c.includes(step) || step.includes(c))) {
        return this.createActionFromStep(step);
      }
    }

    return null;
  }

  private createActionFromStep(step: string): Action {
    const lowerStep = step.toLowerCase();
    let tool: string | undefined;
    let riskLevel: Action['riskLevel'] = 'low';

    // Infer tool from step description
    if (lowerStep.includes('read') || lowerStep.includes('analyze')) {
      tool = 'Read';
    } else if (lowerStep.includes('write') || lowerStep.includes('create')) {
      tool = 'Write';
      riskLevel = 'medium';
    } else if (lowerStep.includes('search') || lowerStep.includes('find')) {
      tool = 'Grep';
    } else if (lowerStep.includes('run') || lowerStep.includes('execute') || lowerStep.includes('test')) {
      tool = 'Bash';
      riskLevel = 'high';
    } else if (lowerStep.includes('edit') || lowerStep.includes('modify')) {
      tool = 'Edit';
      riskLevel = 'medium';
    }

    return {
      id: generateId(),
      type: 'tool',
      description: step,
      tool,
      confidence: 0.8,
      riskLevel,
    };
  }

  private needsApproval(action: Action): boolean {
    const policy = this.agentConfig.config.escalationPolicy;

    // High risk actions
    if (policy.askOnHighRiskAction && this.isHighRisk(action)) {
      return true;
    }

    // Low confidence
    if (policy.askOnUncertainty > 0 && action.confidence < policy.askOnUncertainty) {
      return true;
    }

    return false;
  }

  private isHighRisk(action: Action): boolean {
    if (action.riskLevel === 'high' || action.riskLevel === 'critical') {
      return true;
    }

    // Check against patterns
    const patterns = this.agentConfig.config.escalationPolicy.highRiskPatterns;
    const actionStr = JSON.stringify(action.params || {}) + ' ' + (action.description || '');

    for (const pattern of patterns) {
      if (new RegExp(pattern, 'i').test(actionStr)) {
        return true;
      }
    }

    return false;
  }

  private getEscalationReason(action: Action): EscalationReason {
    if (this.isHighRisk(action)) return 'high_risk_action';
    if (action.confidence < this.agentConfig.config.escalationPolicy.askOnUncertainty) return 'low_confidence';
    return 'high_risk_action';
  }

  private async executeAction(action: Action): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      let output: string;

      if (action.tool) {
        output = await this.agentConfig.toolExecutor(action.tool, action.params || {});
      } else if (action.message) {
        output = await this.agentConfig.llmExecutor(action.message);
      } else {
        output = `Completed: ${action.description}`;
      }

      return {
        actionId: action.id,
        success: true,
        output,
        tokensUsed: Math.ceil(output.length / 4),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Attempt recovery
      const recovered = await this.recovery.handleError(error as Error, this.state);
      
      if (recovered.retry) {
        this.emit({ type: 'recovery', reason: errorMsg, action: recovered.action || 'retry' });
        
        if (recovered.waitMs) {
          await this.sleep(recovered.waitMs);
        }

        // Retry the action
        return this.executeAction(action);
      }

      return {
        actionId: action.id,
        success: false,
        output: '',
        tokensUsed: 0,
        duration: Date.now() - startTime,
        error: errorMsg,
      };
    }
  }

  private async verifyGoalAchieved(): Promise<boolean> {
    // Ask LLM to verify
    const prompt = `
Goal: ${this.state.goal}

Actions completed:
${this.state.history.filter(h => h.result.success).map(h => `- ${h.action.description}`).join('\n')}

Has the goal been achieved? Answer with just "yes" or "no".
`;

    const response = await this.agentConfig.llmExecutor(prompt);
    return response.toLowerCase().includes('yes');
  }

  private async replan(): Promise<boolean> {
    const planResult = await this.reasoner.reason(
      this.state.goal,
      `Previous attempts:\n${this.state.history.map(h => `- ${h.action.description}: ${h.result.success ? 'Success' : 'Failed'}`).join('\n')}`
    );

    if (planResult.success && planResult.plan) {
      this.state.currentPlan = planResult.plan.steps.map(s => s.description);
      return true;
    }

    return false;
  }

  private async escalate(request: EscalationRequest): Promise<EscalationRequest> {
    this.emit({ type: 'escalation', request });

    if (this.agentConfig.escalationHandler) {
      const response = await this.agentConfig.escalationHandler(request);
      request.defaultOption = response;
    }

    return request;
  }

  private async createCheckpoint(): Promise<void> {
    const checkpoint: Checkpoint = {
      id: generateId(),
      timestamp: new Date(),
      iteration: this.state.iteration,
      state: {
        goal: this.state.goal,
        tokensUsed: this.state.tokensUsed,
        currentPlan: this.state.currentPlan,
      },
      description: `Checkpoint at iteration ${this.state.iteration}`,
    };

    this.state.checkpoints.push(checkpoint);
    this.state.lastCheckpoint = checkpoint.timestamp;

    this.emit({ type: 'checkpoint', checkpoint });
  }

  private createResult(escalations: EscalationRequest[]): AutonomousResult {
    const result: AutonomousResult = {
      success: this.state.status === 'completed',
      goal: this.state.goal,
      result: this.state.history
        .filter(h => h.result.success)
        .map(h => h.result.output)
        .join('\n'),
      iterations: this.state.iteration,
      tokensUsed: this.state.tokensUsed,
      duration: Date.now() - this.state.startTime.getTime(),
      actionsCompleted: this.state.history.filter(h => h.result.success).length,
      errors: this.state.errors,
      escalations,
    };

    this.emit({ type: 'completed', result });
    return result;
  }

  private createFailedResult(error: string, escalations: EscalationRequest[] = []): AutonomousResult {
    return {
      success: false,
      goal: this.state.goal,
      result: error,
      iterations: this.state.iteration,
      tokensUsed: this.state.tokensUsed,
      duration: Date.now() - this.state.startTime.getTime(),
      actionsCompleted: this.state.history.filter(h => h.result.success).length,
      errors: [...this.state.errors, error],
      escalations,
    };
  }

  private emit(event: Parameters<AutonomousEventHandler['onEvent']>[0]): void {
    if (this.agentConfig.eventHandler) {
      this.agentConfig.eventHandler.onEvent(event);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Control methods
  pause(): void {
    this.paused = true;
    this.state.status = 'paused';
  }

  resume(): void {
    this.paused = false;
    this.state.status = 'running';
  }

  abort(): void {
    this.aborted = true;
  }

  getState(): AutonomousState {
    return { ...this.state };
  }

  restoreCheckpoint(checkpointId: string): boolean {
    const checkpoint = this.state.checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) return false;

    // Restore state from checkpoint
    Object.assign(this.state, checkpoint.state);
    this.state.iteration = checkpoint.iteration;
    
    // Remove history after checkpoint
    const checkpointIndex = this.state.checkpoints.indexOf(checkpoint);
    this.state.checkpoints = this.state.checkpoints.slice(0, checkpointIndex + 1);

    return true;
  }
}

export default AutonomousAgent;
