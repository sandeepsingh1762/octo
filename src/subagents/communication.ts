import type { SubAgentMessage, SubAgentEvent, SubAgentResult } from "./types.js";

// Message bus for subagent communication
export class MessageBus {
  private messages: SubAgentMessage[] = [];
  private subscribers: Map<string, Array<(msg: SubAgentMessage) => void>> = new Map();
  private eventLog: SubAgentEvent[] = [];

  send(message: Omit<SubAgentMessage, 'id' | 'timestamp'>): void {
    const fullMessage: SubAgentMessage = {
      ...message,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    this.messages.push(fullMessage);

    // Notify subscribers
    const toSubscribers = this.subscribers.get(message.to) || [];
    const broadcastSubscribers = this.subscribers.get('*') || [];
    
    for (const subscriber of [...toSubscribers, ...broadcastSubscribers]) {
      try {
        subscriber(fullMessage);
      } catch (e) {
        console.error('Message subscriber error:', e);
      }
    }
  }

  subscribe(agentId: string, callback: (msg: SubAgentMessage) => void): () => void {
    const existing = this.subscribers.get(agentId) || [];
    existing.push(callback);
    this.subscribers.set(agentId, existing);

    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(agentId) || [];
      const index = subs.indexOf(callback);
      if (index !== -1) {
        subs.splice(index, 1);
      }
    };
  }

  subscribeAll(callback: (msg: SubAgentMessage) => void): () => void {
    return this.subscribe('*', callback);
  }

  getMessages(agentId?: string, since?: number): SubAgentMessage[] {
    let filtered = this.messages;

    if (agentId) {
      filtered = filtered.filter(m => m.from === agentId || m.to === agentId);
    }

    if (since) {
      filtered = filtered.filter(m => m.timestamp > since);
    }

    return filtered;
  }

  getMessagesBetween(from: string, to: string): SubAgentMessage[] {
    return this.messages.filter(m => 
      (m.from === from && m.to === to) || (m.from === to && m.to === from)
    );
  }

  logEvent(event: SubAgentEvent): void {
    this.eventLog.push(event);
  }

  getEventLog(agentId?: string): SubAgentEvent[] {
    if (agentId) {
      return this.eventLog.filter(e => 'agentId' in e && e.agentId === agentId);
    }
    return [...this.eventLog];
  }

  clear(): void {
    this.messages = [];
    this.eventLog = [];
  }

  private generateId(): string {
    return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }
}

// Progress tracker for subagent work
export class ProgressTracker {
  private progress: Map<string, {
    current: number;
    total: number;
    message: string;
    startedAt: Date;
    updatedAt: Date;
  }> = new Map();

  start(agentId: string, total = 100, message = 'Starting...'): void {
    this.progress.set(agentId, {
      current: 0,
      total,
      message,
      startedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  update(agentId: string, current: number, message?: string): void {
    const existing = this.progress.get(agentId);
    if (existing) {
      existing.current = current;
      if (message) existing.message = message;
      existing.updatedAt = new Date();
    }
  }

  increment(agentId: string, amount = 1, message?: string): void {
    const existing = this.progress.get(agentId);
    if (existing) {
      existing.current = Math.min(existing.current + amount, existing.total);
      if (message) existing.message = message;
      existing.updatedAt = new Date();
    }
  }

  complete(agentId: string, message = 'Completed'): void {
    const existing = this.progress.get(agentId);
    if (existing) {
      existing.current = existing.total;
      existing.message = message;
      existing.updatedAt = new Date();
    }
  }

  get(agentId: string): {
    percent: number;
    message: string;
    elapsed: number;
  } | null {
    const p = this.progress.get(agentId);
    if (!p) return null;

    return {
      percent: Math.round((p.current / p.total) * 100),
      message: p.message,
      elapsed: Date.now() - p.startedAt.getTime(),
    };
  }

  getAll(): Map<string, {
    percent: number;
    message: string;
    elapsed: number;
  }> {
    const result = new Map();
    for (const [id, _] of this.progress) {
      const data = this.get(id);
      if (data) result.set(id, data);
    }
    return result;
  }

  remove(agentId: string): void {
    this.progress.delete(agentId);
  }
}

// Result aggregator for combining subagent outputs
export class ResultAggregator {
  private results: Map<string, SubAgentResult> = new Map();

  add(result: SubAgentResult): void {
    this.results.set(result.agentId, result);
  }

  get(agentId: string): SubAgentResult | undefined {
    return this.results.get(agentId);
  }

  getAll(): SubAgentResult[] {
    return Array.from(this.results.values());
  }

  getSuccessful(): SubAgentResult[] {
    return this.getAll().filter(r => r.status === 'completed');
  }

  getFailed(): SubAgentResult[] {
    return this.getAll().filter(r => r.status === 'failed');
  }

  aggregate(): {
    totalAgents: number;
    successful: number;
    failed: number;
    totalTokens: { input: number; output: number };
    totalDuration: number;
    allResults: string;
    toolsUsed: string[];
  } {
    const all = this.getAll();
    
    const totalTokens = { input: 0, output: 0 };
    let totalDuration = 0;
    const toolsUsed = new Set<string>();

    for (const r of all) {
      totalTokens.input += r.tokensUsed.input;
      totalTokens.output += r.tokensUsed.output;
      totalDuration += r.duration;
      r.toolsUsed.forEach(t => toolsUsed.add(t));
    }

    const allResults = this.getSuccessful()
      .map(r => `[${r.agentId}]: ${r.result}`)
      .join('\n\n');

    return {
      totalAgents: all.length,
      successful: this.getSuccessful().length,
      failed: this.getFailed().length,
      totalTokens,
      totalDuration,
      allResults,
      toolsUsed: Array.from(toolsUsed),
    };
  }

  summarize(): string {
    const agg = this.aggregate();
    const lines = [
      `SubAgent Execution Summary`,
      `==========================`,
      `Total Agents: ${agg.totalAgents}`,
      `Successful: ${agg.successful}`,
      `Failed: ${agg.failed}`,
      `Total Tokens: ${agg.totalTokens.input + agg.totalTokens.output}`,
      `Total Duration: ${agg.totalDuration}ms`,
      `Tools Used: ${agg.toolsUsed.join(', ')}`,
      ``,
      `Results:`,
      `--------`,
      agg.allResults,
    ];

    const failed = this.getFailed();
    if (failed.length > 0) {
      lines.push(``, `Errors:`, `-------`);
      for (const f of failed) {
        lines.push(`[${f.agentId}]: ${f.error}`);
      }
    }

    return lines.join('\n');
  }

  clear(): void {
    this.results.clear();
  }
}

// Coordination utilities
export class SubAgentCoordinator {
  private messageBus: MessageBus;
  private progressTracker: ProgressTracker;
  private resultAggregator: ResultAggregator;

  constructor() {
    this.messageBus = new MessageBus();
    this.progressTracker = new ProgressTracker();
    this.resultAggregator = new ResultAggregator();
  }

  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  getProgressTracker(): ProgressTracker {
    return this.progressTracker;
  }

  getResultAggregator(): ResultAggregator {
    return this.resultAggregator;
  }

  // Convenience method to handle a completed agent
  handleCompletion(result: SubAgentResult): void {
    this.resultAggregator.add(result);
    this.progressTracker.complete(result.agentId, 
      result.status === 'completed' ? 'Completed' : `Failed: ${result.error}`
    );
    this.messageBus.send({
      from: result.agentId,
      to: 'parent',
      type: 'result',
      content: result,
    });
  }

  // Get overall status
  getStatus(): {
    activeAgents: number;
    completedAgents: number;
    failedAgents: number;
    progress: Map<string, { percent: number; message: string; elapsed: number }>;
  } {
    const progress = this.progressTracker.getAll();
    const results = this.resultAggregator.getAll();
    const successful = this.resultAggregator.getSuccessful();
    const failed = this.resultAggregator.getFailed();

    return {
      activeAgents: progress.size - results.length,
      completedAgents: successful.length,
      failedAgents: failed.length,
      progress,
    };
  }

  reset(): void {
    this.messageBus.clear();
    this.resultAggregator.clear();
  }
}

export default SubAgentCoordinator;
