// Hooks Manager
// Manages registration and execution of hooks

import type {
  Hook,
  HookEvent,
  HookEventData,
  HookContext,
  HookResult,
  HookHandler,
  HookDefinition,
} from "./types.js";

function generateId(): string {
  return `hook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export class HookManager {
  private hooks: Map<HookEvent, Hook[]> = new Map();
  private context: HookContext;
  private eventLog: HookEventData[] = [];
  private maxEventLogSize = 1000;

  constructor(context: Partial<HookContext> = {}) {
    this.context = {
      sessionId: context.sessionId || 'default',
      workingDirectory: context.workingDirectory || process.cwd(),
      config: context.config || {},
      log: context.log || console.log,
      warn: context.warn || console.warn,
      error: context.error || console.error,
    };
  }

  // Register a hook
  register(definition: HookDefinition): string {
    const hook: Hook = {
      id: generateId(),
      name: definition.name,
      event: definition.event,
      handler: definition.handler,
      priority: definition.priority || 0,
      enabled: true,
    };

    const existing = this.hooks.get(definition.event) || [];
    existing.push(hook);
    
    // Sort by priority (descending)
    existing.sort((a, b) => b.priority - a.priority);
    
    this.hooks.set(definition.event, existing);

    return hook.id;
  }

  // Unregister a hook
  unregister(hookId: string): boolean {
    for (const [event, hooks] of this.hooks) {
      const index = hooks.findIndex(h => h.id === hookId);
      if (index !== -1) {
        hooks.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  // Enable/disable a hook
  setEnabled(hookId: string, enabled: boolean): boolean {
    for (const hooks of this.hooks.values()) {
      const hook = hooks.find(h => h.id === hookId);
      if (hook) {
        hook.enabled = enabled;
        return true;
      }
    }
    return false;
  }

  // Trigger an event
  async trigger(event: HookEvent, data: unknown): Promise<unknown> {
    const eventData: HookEventData = {
      event,
      timestamp: new Date(),
      data,
      sessionId: this.context.sessionId,
    };

    // Log event
    this.eventLog.push(eventData);
    if (this.eventLog.length > this.maxEventLogSize) {
      this.eventLog.shift();
    }

    // Get hooks for this event
    const hooks = this.hooks.get(event) || [];
    const enabledHooks = hooks.filter(h => h.enabled);

    if (enabledHooks.length === 0) {
      return data;
    }

    // Execute hooks in priority order
    let result = data;

    for (const hook of enabledHooks) {
      try {
        const hookResult = await hook.handler(
          { ...eventData, data: result },
          this.context
        );

        if (!hookResult.continue) {
          // Hook requested to stop processing
          break;
        }

        if (hookResult.modified !== undefined) {
          result = hookResult.modified;
        }
      } catch (error) {
        this.context.error(`Hook ${hook.name} failed: ${error}`);
        // Continue with other hooks
      }
    }

    return result;
  }

  // Get all registered hooks
  getHooks(event?: HookEvent): Hook[] {
    if (event) {
      return [...(this.hooks.get(event) || [])];
    }

    const all: Hook[] = [];
    for (const hooks of this.hooks.values()) {
      all.push(...hooks);
    }
    return all;
  }

  // Get event log
  getEventLog(event?: HookEvent, limit?: number): HookEventData[] {
    let filtered = this.eventLog;
    
    if (event) {
      filtered = filtered.filter(e => e.event === event);
    }
    
    if (limit) {
      filtered = filtered.slice(-limit);
    }
    
    return filtered;
  }

  // Clear all hooks
  clear(): void {
    this.hooks.clear();
  }

  // Update context
  updateContext(updates: Partial<HookContext>): void {
    Object.assign(this.context, updates);
  }
}

// Built-in hooks

// Logging hook - logs all events
export function createLoggingHook(): HookDefinition {
  return {
    name: 'logging',
    event: 'message:after',
    priority: -100,  // Low priority, runs last
    handler: async (event, ctx) => {
      ctx.log(`[${event.event}] ${JSON.stringify(event.data).slice(0, 200)}`);
      return { continue: true };
    },
  };
}

// Timing hook - tracks execution time
export function createTimingHook(): HookDefinition {
  const startTimes = new Map<string, number>();

  return {
    name: 'timing',
    event: 'tool:before',
    priority: 100,  // High priority, runs first
    handler: async (event, ctx) => {
      const data = event.data as { tool?: string };
      if (data.tool) {
        startTimes.set(data.tool, Date.now());
      }
      return { continue: true };
    },
  };
}

// Error recovery hook
export function createErrorRecoveryHook(
  onError: (error: unknown) => Promise<{ retry: boolean; modified?: unknown }>
): HookDefinition {
  return {
    name: 'error-recovery',
    event: 'error',
    priority: 50,
    handler: async (event, ctx) => {
      const result = await onError(event.data);
      return {
        continue: result.retry,
        modified: result.modified,
      };
    },
  };
}

export default HookManager;
