// Self-Healing & Recovery System
// Handles errors and attempts automatic recovery

import type { RecoveryPolicy, AutonomousState } from "./types.js";

export type ErrorType = 
  | 'tool_failure'
  | 'rate_limit'
  | 'context_overflow'
  | 'deadlock'
  | 'external_failure'
  | 'network_error'
  | 'permission_denied'
  | 'unknown';

export interface RecoveryAction {
  type: 'retry' | 'replan' | 'compact' | 'wait' | 'skip' | 'escalate';
  retry: boolean;
  waitMs?: number;
  action?: string;
  constraint?: string;
}

export class RecoveryManager {
  private policy: RecoveryPolicy;
  private retryCount: Map<string, number> = new Map();
  private lastActions: string[] = [];

  constructor(policy: RecoveryPolicy) {
    this.policy = policy;
  }

  async handleError(error: Error, state: AutonomousState): Promise<RecoveryAction> {
    const errorType = this.classifyError(error);
    
    switch (errorType) {
      case 'tool_failure':
        return this.handleToolFailure(error, state);
      
      case 'rate_limit':
        return this.handleRateLimit(error);
      
      case 'context_overflow':
        return this.handleContextOverflow(state);
      
      case 'deadlock':
        return this.handleDeadlock(state);
      
      case 'external_failure':
        return this.handleExternalFailure(error);
      
      case 'network_error':
        return this.handleNetworkError(error);
      
      case 'permission_denied':
        return this.handlePermissionDenied(error);
      
      default:
        return this.handleUnknownError(error);
    }
  }

  private classifyError(error: Error): ErrorType {
    const msg = error.message.toLowerCase();

    // Rate limiting
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
      return 'rate_limit';
    }

    // Context overflow
    if (msg.includes('context') || msg.includes('token') || msg.includes('length') || msg.includes('maximum')) {
      return 'context_overflow';
    }

    // Network errors
    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('timeout') || msg.includes('fetch')) {
      return 'network_error';
    }

    // Permission errors
    if (msg.includes('permission') || msg.includes('access denied') || msg.includes('forbidden') || msg.includes('eacces')) {
      return 'permission_denied';
    }

    // External service failures
    if (msg.includes('api') || msg.includes('500') || msg.includes('502') || msg.includes('503')) {
      return 'external_failure';
    }

    // Tool failures
    if (msg.includes('tool') || msg.includes('command failed') || msg.includes('execution')) {
      return 'tool_failure';
    }

    return 'unknown';
  }

  private handleToolFailure(error: Error, state: AutonomousState): RecoveryAction {
    const errorKey = `tool_${error.message.slice(0, 50)}`;
    const retries = (this.retryCount.get(errorKey) || 0) + 1;
    this.retryCount.set(errorKey, retries);

    if (retries <= this.policy.maxRetries) {
      return {
        type: 'retry',
        retry: true,
        waitMs: this.policy.retryBackoffMs * retries,
        action: `Retrying tool (attempt ${retries}/${this.policy.maxRetries})`,
      };
    }

    return {
      type: 'skip',
      retry: false,
      action: 'Tool failed after max retries, skipping',
    };
  }

  private handleRateLimit(error: Error): RecoveryAction {
    // Extract retry-after if available
    const retryAfterMatch = error.message.match(/retry.?after[:\s]+(\d+)/i);
    const waitMs = retryAfterMatch 
      ? parseInt(retryAfterMatch[1]) * 1000 
      : this.policy.onRateLimitWaitMs;

    return {
      type: 'wait',
      retry: true,
      waitMs,
      action: `Rate limited, waiting ${waitMs / 1000}s`,
    };
  }

  private handleContextOverflow(state: AutonomousState): RecoveryAction {
    switch (this.policy.onContextOverflow) {
      case 'compact':
        return {
          type: 'compact',
          retry: true,
          action: 'Context overflow, compacting history',
        };
      
      case 'summarize':
        return {
          type: 'compact',
          retry: true,
          action: 'Context overflow, summarizing conversation',
        };
      
      case 'escalate':
      default:
        return {
          type: 'escalate',
          retry: false,
          action: 'Context overflow, escalating to user',
        };
    }
  }

  private handleDeadlock(state: AutonomousState): RecoveryAction {
    // Detect if agent is stuck in a loop
    const recentActions = state.history.slice(-10).map(h => h.action.description);
    const isLoop = this.detectLoop(recentActions);

    if (isLoop) {
      switch (this.policy.onDeadlock) {
        case 'replan':
          return {
            type: 'replan',
            retry: true,
            action: 'Deadlock detected, replanning with different approach',
            constraint: 'Avoid the approaches tried in recent actions',
          };
        
        case 'abort':
          return {
            type: 'escalate',
            retry: false,
            action: 'Deadlock detected, aborting',
          };
        
        case 'escalate':
        default:
          return {
            type: 'escalate',
            retry: false,
            action: 'Deadlock detected, escalating to user',
          };
      }
    }

    return {
      type: 'retry',
      retry: true,
      action: 'Potential deadlock, retrying with variation',
    };
  }

  private handleExternalFailure(error: Error): RecoveryAction {
    switch (this.policy.onExternalFailure) {
      case 'retry':
        const retries = (this.retryCount.get('external') || 0) + 1;
        this.retryCount.set('external', retries);
        
        if (retries <= this.policy.maxRetries) {
          return {
            type: 'retry',
            retry: true,
            waitMs: this.policy.retryBackoffMs * retries,
            action: `External service failed, retrying (${retries}/${this.policy.maxRetries})`,
          };
        }
        return {
          type: 'escalate',
          retry: false,
          action: 'External service failed after max retries',
        };
      
      case 'skip':
        return {
          type: 'skip',
          retry: false,
          action: 'External service failed, skipping',
        };
      
      case 'escalate':
      default:
        return {
          type: 'escalate',
          retry: false,
          action: 'External service failed, escalating',
        };
    }
  }

  private handleNetworkError(error: Error): RecoveryAction {
    const retries = (this.retryCount.get('network') || 0) + 1;
    this.retryCount.set('network', retries);

    if (retries <= this.policy.maxRetries) {
      return {
        type: 'retry',
        retry: true,
        waitMs: this.policy.retryBackoffMs * Math.pow(2, retries - 1), // Exponential backoff
        action: `Network error, retrying with backoff (${retries}/${this.policy.maxRetries})`,
      };
    }

    return {
      type: 'escalate',
      retry: false,
      action: 'Network error persists, escalating',
    };
  }

  private handlePermissionDenied(error: Error): RecoveryAction {
    // Permission errors usually can't be recovered automatically
    return {
      type: 'escalate',
      retry: false,
      action: 'Permission denied, requires user intervention',
    };
  }

  private handleUnknownError(error: Error): RecoveryAction {
    const retries = (this.retryCount.get('unknown') || 0) + 1;
    this.retryCount.set('unknown', retries);

    if (retries <= 1) {
      return {
        type: 'retry',
        retry: true,
        waitMs: this.policy.retryBackoffMs,
        action: 'Unknown error, attempting retry',
      };
    }

    return {
      type: 'escalate',
      retry: false,
      action: `Unknown error: ${error.message}`,
    };
  }

  private detectLoop(recentActions: string[]): boolean {
    if (recentActions.length < 4) return false;

    // Check for exact repetition
    const last = recentActions[recentActions.length - 1];
    const repetitions = recentActions.filter(a => a === last).length;
    if (repetitions >= 3) return true;

    // Check for pattern repetition (ABAB)
    if (recentActions.length >= 4) {
      const pattern = recentActions.slice(-2);
      const previous = recentActions.slice(-4, -2);
      if (pattern[0] === previous[0] && pattern[1] === previous[1]) {
        return true;
      }
    }

    // Check for similarity in actions
    const uniqueActions = new Set(recentActions);
    if (uniqueActions.size <= 2 && recentActions.length >= 6) {
      return true;
    }

    return false;
  }

  resetRetryCount(key?: string): void {
    if (key) {
      this.retryCount.delete(key);
    } else {
      this.retryCount.clear();
    }
  }

  addRecentAction(action: string): void {
    this.lastActions.push(action);
    if (this.lastActions.length > 20) {
      this.lastActions.shift();
    }
  }
}

export default RecoveryManager;
